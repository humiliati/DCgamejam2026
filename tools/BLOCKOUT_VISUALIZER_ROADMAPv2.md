# Blockout Visualizer — Engine Roadmap

Current state (v0.13, April 2026): visualizer with full Tier 1 drawing tools (paint + brush sizes,
rect, line, flood fill, replace-all-of-type), lasso select/move, copy/cut/paste clipboard with
cross-floor persistence, per-floor undo/redo stacks, direct file write with confirmation diff
(File System Access API + download fallback), **Tier 2 validation** (walkability BFS, door
contract sanity, spawn checks, required-tile checks + cross-floor door-target reciprocity),
**Tier 3 per-floor metadata editor** (spawn drag-place, door-target dropdowns per door tile,
JSON-snippet clipboard export, meta undo entries), resize, full/diff export, all-tile picker,
live schema extraction (tiles, cards, enemies, strings), **the Tier 4 window-scene editor
first pass** — auto-detect window tiles per floor, per-window sub-grid editor with paint /
resize / clipboard-stamp / jump-to-parent, in-memory scene store with JSON sidecar export —
**and Tier 6 Passes 1 + 2 + 3 + 4** — the headless `window.BO.run({action,…})` command surface, the
matching `tools/blockout-cli.js` Node CLI, the perception tools (`renderAscii`, `diffAscii`,
`describeCell`, `reportValidation`, `captureFloor`), the tile semantic lookup layer
(`tile`, `tileName`, `tileSchema`, `findTiles` — both as router actions and as direct
`window.BO.*` methods, mirrored in the CLI), **and the stamp library** — parametric
stamps (`stampRoom`, `stampCorridor`, `stampTorchRing`) plus a named registry
(`saveStamp`, `applyStamp`, `listStamps`, `deleteStamp`, `exportStamps`, `importStamps`)
with a `tools/stamps.json` sidecar for cross-session reuse and CLI/browser interop —
so AI agents can drive the editor, observe world state without a canvas, resolve tile
identities symbolically, AND compose floor geometry from reusable patterns (1:1 mapping
to existing primitives; heterogeneous-bulk undo/redo/validation parity; Node CLI mirrors
the vocabulary).
Reference frame: what a level designer coming from Tiled, Ogmo, Unity Tilemaps, Unreal, or a AAA in-house
editor would expect to find when they sit down at this tool.

**Planned next:** Pass 0 (modularization) **shipped April 2026** — visualizer split into 26 `tools/js/bv-*.js` modules (483-line HTML shell), CLI split into 17 `tools/cli/*.js` modules, module manifest at `tools/js/MODULES.md`, CSS extracted to `tools/css/blockout-visualizer.css`. Sub-items 0.5 (tools/ code-review-graph) and 0.6 (file-size CI budgets) are scaffolded but not enforced. Pass 5a **shipped**; Pass 5c **shipped**; Pass 5d (agent-feedback closeouts) **shipped April 2026** via Track C (C1-C6 all closed — `--dry-run`, IIFE round-trip, `bo help`, biome stamps, IIFE-aware `render-ascii`, expanded validate rules). The World Designer → BO-V §3.1 payload handoff **shipped** (Track B M3). **Next designated slice:** Pass 5b (world graph editor) or Tier 3/4 polish.

---

## Progress snapshot (April 16, 2026)

Status legend: ✅ done · 🟡 partial · ⬜ not started

**Phase 3 — Schema extraction** ✅
- `tools/tile-schema.json` — 97 tiles with predicates (was hardcoded 77 → now live-tracked)
- `tools/card-manifest.json` — 120 cards, bucketed by suit
- `tools/enemy-manifest.json` — 27 enemies
- `tools/string-index.json` — 243 strings, 27 namespaces
- `extract-floors.js` rebuilds all four side-cars on run

**Tier 1 drawing tools** ✅
- Rect (drag + Shift for outline), Line (Bresenham), Fill (4-connected flood),
  Replace-all-of-type, Brush sizes 1/2/3/5, Paint with stroke-coalesced undo
- Bulk-undo: every tool writes a single `{type:'bulk'}` entry
- Drag-preview rendering (filled cells + dashed bounding rect for rect)
- Shortcuts P R N F X (edit mode only), `[` / `]` cycle brush size

**Tier 1 selection + clipboard** 🟡
- Lasso select, drag-to-move, ESC cancel / ENTER commit ✅
- Copy / Cut / Paste (in-memory `CLIPBOARD`, single bulk undo per stamp) ✅
- Paste tool with green ghost preview tracking cursor ✅
- Shortcuts Ctrl+C / Ctrl+X / Ctrl+V / `V`, `L` ✅
- **Cross-floor clipboard** ✅ — first-class workflow:
  - `CLIPBOARD` tracks `sourceFloorId` + `sourceFloorName`, set on every copy/cut
  - Clipboard status badge next to brush picker: miniature thumbnail + "W×H `floorId`"
  - Badge color-shifts from blue → amber when source floor ≠ current floor
  - Click badge to jump back to source floor
  - Paste on a different floor shows a "Pasted N×M from floor X" toast
  - Undo/redo honor per-floor stacks; pasting on floor B doesn't touch floor A's history
  - Smoke-tested end-to-end: see `/tmp/clipboard_sim.js` harness and the in-browser
    `window.__clipboardSmokeTest(srcId, dstId)` dev helper. All invariants verified:
    copy persists across switch, paste lands correctly, undo restores, A's stack untouched.
- Magic wand, select-by-tile, invert/grow/shrink, multi-rect-select ⬜

**Tier 1 history** ✅
- Undo (`Ctrl+Z` + button) ✅
- Redo (`Ctrl+Shift+Z` / `Ctrl+Y` + button) ✅ — every edit funnels through `pushUndo()` which
  clears the redo stack; `applyEntry(entry, 'undo'|'redo')` handles all four entry types
  (paint / bulk / resize / lasso-move). Paste entries store per-cell `newTile` for heterogeneous
  stamps; uniform ops keep a single `newTile` on the entry.
- Per-floor undo/redo stacks ✅ — `FLOOR_HISTORY[floorId] = {undo, redo, originalGrid}`. On
  `selectFloor`, the outgoing floor's stacks are parked under its ID and the incoming floor's
  stacks are restored (or initialized fresh).
- History panel, named checkpoints ⬜ — deferred to Tier 1 polish; not blocking.

**Tier 1 view** ⬜
- Minimap inset, jump-to-coords, bookmarks, measure tool, crosshair overlay,
  shortcut cheatsheet (`?`) — none started

**Tier 2 file integration (direct file write)** ✅
- Save button (Ctrl+S) + "Pick engine/…" directory-handle request
- Reads current `floor-blockout-<id>.js`, patches only the `var GRID = [...]` literal
  via regex, preserves the rest of the file (W/H, ROOMS, build(), etc.)
- Confirmation modal with color-coded unified diff (LCS-based, 3-line context hunks)
- Write via File System Access API when available; graceful fallback to Blob download
  when on `file://` or an unsupported browser
- Post-write: re-baselines `EDIT.originalGrid` so the dirty counter resets without
  clearing undo history — the designer can keep iterating and save again
- Verified end-to-end: real `floor-blockout-1-1.js` → mutated tile (2,2) → patched
  cleanly with valid JS output (Node sim in `/tmp/save_sim.js`)

**Tier 4 window-scene editor (first pass)** 🟡
- `isWindowLikeTile()` predicate honors the schema's `isWindow` flag and also matches
  `WINDOW_*`, `PORTHOLE`, `ARCH_DOORWAY` by name — 9 tile IDs surface as windows
- `#windows-panel` overlay (top-left of canvas) auto-lists every window tile on the
  current floor: tile swatch + `(x,y)` + tile name + green `●` marker when a scene
  already exists. Empty for floors without windows.
- Click any row to open the scene editor modal (`#scene-modal`). Sub-grid defaults to
  8×6, tiles default to EMPTY (0). Parent floor id inferred by stripping the last
  segment of the current floor id (e.g. `"1.1"` → `"1"`).
- Scene editor features:
  - Paint mode (click / drag) using the main editor's `EDIT.paintTile` — no separate
    tile picker, stays in sync with the main toolbar
  - Right-click erases to tile 0
  - Resize W/H buttons (1–24 range) preserve existing tiles, pad with EMPTY
  - "Jump to parent floor" button — switches the main view to the parent exterior
    so the designer can lasso + Ctrl+C a region, then returns via re-clicking the
    window row. Scene modal state (which window) is preserved across the jump.
  - "Stamp clipboard at (0,0)" — one-click paste from `CLIPBOARD` into the sub-grid,
    clipped to scene bounds. Shows toast with cell count.
  - "Clear scene" resets all cells to 0
  - "Download window-scenes.json" exports every scene across every floor as a
    sidecar JSON with `{floorId, at, tileId, parentFloorId, w, h, tiles}` per entry
- `selectFloor()` is wrapped so the windows panel rebuilds on every floor switch.
  Scene modal remains open if active (enables the parent-hop workflow).
- Dev smoke-test: `window.__windowSceneSmokeTest('1')` lists windows on floor 1.
- Not yet: engine consumption of `window-scenes.json`. `WindowSprites.buildSprites()`
  and `floorData.windowScenes` (vignette system) are orthogonal and unchanged. A
  follow-up will extend the engine to read `sceneGrid` per window for raycaster
  through-rendering. Scenes currently live in memory only (lost on reload) until
  a re-import loader is added.

---

This document is organized by **designer expectation tier** — not by implementation difficulty. Tier 1 is
"a working editor should obviously have this." Tier 4 is "this is specific to Dungeon Gleaner and
differentiates us from a generic tile editor." **Tier 6** is a separate axis — it's what the editor
needs to be drivable by an AI agent rather than a human at a mouse.

---

## Phase 3 — Schema extraction ✅ (shipped)

Was the immediate blocker before expanding the editor. The tool previously embedded a 77-entry
TILE_SCHEMA copy-pasted from `engine/tiles.js`. Every time `tiles.js` changed, the visualizer drifted.

- ✅ Parse `engine/tiles.js` in `extract-floors.js` and emit the schema into `tools/tile-schema.json` (84 tiles)
- ✅ Category, walkability, opacity, door/freeform/floating predicates extracted from source
- ✅ `isDoor()`, `isFreeform()`, `isFloating()`, `isWindow()`, `isTorch()`, `isHazard()` etc. captured
- ✅ `data/cards.json` → `tools/card-manifest.json` (120 cards, suit-bucketed)
- ✅ `data/enemies.json` → `tools/enemy-manifest.json` (27 enemies)
- ✅ `data/strings/en.js` → `tools/string-index.json` (243 strings, 27 namespaces)
- 🟡 Builder metadata (`shops`, `spawn`, `doorTargets`, `doorFaces`, `biome`) — emitted in `floor-data.json`
  but not yet surfaced as editable fields (belongs to Tier 3 metadata editor)

Next-tile drift is eliminated: adding a tile to `tiles.js` + re-running `extract-floors.js` lights it
up in the visualizer's tile picker automatically.

---

## Tier 1 — Table stakes for a tile editor

What a designer will look for in the first ten minutes and be confused if it's missing.

### Drawing tools

- ✅ **Rectangle fill** — drag a box, release to fill with the paint tile (Shift = outline mode)
- ✅ **Flood fill / bucket** — click a cell, fill all connected same-tile cells (4-connected)
- ✅ **Line tool** — click-drag to paint a straight line between two cells (Bresenham, 5000-cell cap)
- ✅ **Brush size** — 1×1, 2×2, 3×3, 5×5 square brushes (picker + `[` / `]` cycle)
- ✅ **Replace-all-of-type** — click a cell, one-click swap every instance of that tile ID floor-wide

### Selection improvements

- ⬜ **Magic wand** — select all contiguous tiles of the same type (for moving a whole room, a whole path)
- ⬜ **Select-by-tile** — select every instance of a tile ID, floor-wide
- ⬜ **Invert selection**, **shrink/grow** by N cells, **select all**
- ⬜ **Multi-rectangle selection** (shift+drag adds to selection)
- ✅ **Floating selection clipboard** — Copy / Cut / Paste shipped (in-memory, bulk-undo).
  `CLIPBOARD` persists across floor switches and is never reset by `selectFloor`.
- ✅ **Cross-floor copy-paste** — lasso or select a region on floor N, switch to floor N.N, paste the
  captured tile group onto the target grid at an arbitrary position. The clipboard survives floor
  switches. A persistent toolbar badge (miniature thumbnail + `W×H "floorId"`) shows what's on the
  clipboard; the badge shifts to an amber highlight when the source floor differs from the current
  floor, and clicking it jumps back to the source floor. A "Pasted N×M from floor X" toast fires on
  cross-floor stamps. Per-floor undo stacks mean the stamp writes to the destination floor's history
  without disturbing the source floor's. Smoke-tested via the `window.__clipboardSmokeTest()` dev
  helper and a standalone Node simulation (`/tmp/clipboard_sim.js`) — all invariants pass.
  This is the primary workflow for building window-scene exteriors: copy the street / trees /
  buildings from the parent exterior floor and paste them into the sub-grid outside a building's
  window on the interior floor, instead of recreating the exterior by hand. See also the Tier 4
  window-scene editor for the dedicated panel variant of this workflow.

### History

- ✅ **Redo** (Ctrl+Shift+Z / Ctrl+Y + button) — every edit clears redo; all four entry types replay
- ✅ **Per-floor undo/redo stacks** — `FLOOR_HISTORY` map keyed by floor ID, parked/restored on switch
- ⬜ **History panel** — scrollable list of operations with timestamps, click any entry to jump to that state
- ⬜ **Named checkpoints** — manual save points the designer labels ("before door rework")

### View

- ⬜ **Minimap** — small overview in a corner, click to jump, draggable viewport rect
- ⬜ **Jump to coordinates** — text input, tile-snap camera
- ⬜ **Bookmarks** — named camera positions per floor
- ⬜ **Measure tool** — click two cells, show grid distance and Manhattan distance
- ⬜ **Show cursor crosshair** across full row/column for alignment

### Keyboard discoverability

- ⬜ **Shortcut cheatsheet overlay** (press `?` to show) — current shortcut set: P R N F X L V, `[`/`]`,
  Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+Z, 0–9 quick-tiles, G / R / D / I / L (view toggles outside edit mode)
- ⬜ **Customizable shortcuts** (probably defer — vanilla keymap is fine for now)

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

*(Decision: keep the flat `grid[y][x]` and synthesize layers at display time. The engine's tile
predicates — `isDoor()`, `isFloating()`, `isFreeform()`, `isCrenellated()`, `isWindow()`,
`isTorch()` — already encode enough category information to bucket tiles into virtual layers. A
`categoryOf(tileId)` function derived from the Phase 3 schema extraction lets the editor render
per-layer visibility/opacity/lock toggles without touching the data format. The one limitation —
inability to stack e.g. a torch ON a wall — is already solved by the engine placing torches as
separate adjacent tiles, not stacked in the same cell.)*

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

### Validation ✅ (two passes — base + C6 expanded rules)

- ✅ **Walkability check** — BFS from spawn, flags unreachable walkable tiles (grouped into one
  issue, rendered with red/amber/blue border overlay and pulsing fill on the first cell)
- ✅ **Door contract validation** — doors without explicit `doorTargets` raise `door-fallback` info;
  `doorTargets` pointing to a non-existent floor raises `door-target-missing` error; target floor
  with no door tiles anywhere raises `no-return-door` warning (one-way transition)
- ✅ **Spawn validity** — missing / out-of-bounds / non-walkable spawn all flagged as errors
- ✅ **Missing required tiles** — depth-1 exterior floor with no ARCH_DOORWAY or door tile flagged
- ✅ **Validation modal** — two tabs (current floor / all floors), severity pills, click-to-jump,
  persistent highlight overlay, Esc / Close clears. Dev helper: `window.__validateSmokeTest('all')`.
- ✅ **C6 expanded rules** (April 2026): `door-no-target` (warn — every door/stair tile should have
  explicit doorTargets), `room-has-walls` (warn — room interiors should not contain WALL tiles),
  `offset-no-height` (info, browser only — tiles with tileHeightOffsets should have tileWallHeights).
  All three fire in the existing modal + CLI `report-validation`.
- ⬜ **Heatmaps**: distance from spawn, distance from nearest door, lighting coverage, line-of-sight
  from key tiles — deferred to a polish pass

### File integration

- ✅ **Direct file write** — Ctrl+S / Save button writes directly to `engine/floor-blockout-*.js`.
  Uses File System Access API (`showDirectoryPicker` + `createWritable`) when available, falls back
  to a Blob download on `file://` or in browsers that don't support the API. The patch regex targets
  only the `var GRID = [...]` literal so the rest of the file (W/H, ROOMS, build(), doorTargets)
  is preserved byte-for-byte.
- ✅ **Git-style diff preview panel** — confirmation modal shows a color-coded unified diff (LCS,
  3-line context hunks, red/green per-line backgrounds) before anything is written. Cancel / Download
  / Write to file are the three exit paths.
- ⬜ **Watch mode** — hot-reload `floor-data.json` on disk change
- ⬜ **Autosave** draft state to localStorage (CLAUDE.md rules out `localStorage` in artifacts — but
  this is a dev tool, not an artifact, so it's fair game)

---

## Tier 3 — The difference between a tool and a platform

### Per-floor metadata editor 🟡

All the fields around the grid — not just the grid itself.

- ⬜ **Rooms array editor** — draw a rect, name it, set `cx/cy`; optional tags (shop, bedroom, hall)
- ✅ **Door targets map editor** — Meta panel lists every door-like tile on the floor with a
  target-floor dropdown. `(fallback)` deletes the explicit entry. Per-row `→` jump button centers
  the camera on the door cell. Edits push to the per-floor undo stack (`type:'meta'`) and raise a
  `●` dirty marker in the panel header.
- ⬜ **Door faces editor** — click a door tile, pick exterior face direction (N/E/S/W)
- ⬜ **Shops array editor** — position + shop type
- ✅ **Spawn drag** — "Move" button in the Meta panel arms placement mode; next canvas click sets
  the new spawn. Cursor switches to crosshair while armed. Undo-tracked.
- ⬜ **Biome picker** — per-floor biome assignment affecting texture atlas and fog config
- ⬜ **Spatial contract inspector** — read-only view of the frozen `SpatialContract.*` for this floor depth

**File integration gap:** metadata edits are in-memory only. The save patcher currently only
rewrites the `var GRID` literal. The Meta panel's **Copy meta JSON** button copies a
`{floorId, spawn, doorTargets}` snippet to the clipboard so the designer can paste it into the
floor's `registerFloorBuilder` entry manually. Extending the patcher to rewrite `spawn:` and
`doorTargets:` inside the builder is a Tier 3 follow-up.

### Entity + decoration layer

The grid holds static tiles. Real level design needs dynamic content on top.

*(Decision: entities live in a parallel entities array, not in the grid. The grid keeps marker tiles
like SPAWN, SHOP, BONFIRE, CHEST — they tell the engine "an entity system should do something here."
The actual identity and properties (which NPC, what loot table, which enemy card ID) live in a
lightweight `entities` array alongside the grid in `floor-data.json`. The visualizer renders entities
as an overlay layer — one of the synthesized layers from the Layers decision above.)*

- **Entity palette** — NPCs, enemies (by card ID), loot spawns, trigger volumes, dialogue zones
- **Drag-drop entity placement** — not grid-snapped necessarily
- **Entity inspector** — properties panel for the selected entity
- **Link tool** — draw arrows between entities to express relationships (patrol path, trigger link)
- **Loot table picker** — click a CHEST, assign a loot table by ID

### 3D preview

This is the killer feature for DG specifically.

*(Decision: sibling iframe first, mini raycast deferred. Point an iframe at
`index.html?floor=<id>&camera=<x>,<y>,<dir>&editor=true` — the designer sees the exact rendered
output of the real engine, not an approximation. The mini raycast inset comes later as a lightweight
~200×150 preview for quick feedback without the iframe's full load time.)*

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
- **Cross-floor paste shortcut** — from the window-scene panel, a "Paste from…" button opens
  the parent exterior floor in a side-by-side view, lets the designer lasso the relevant region
  (the street outside the building, surrounding trees, neighboring structures), and pastes it
  directly into the window-scene sub-grid. This is the guided version of the Tier 1 cross-floor
  copy-paste — same clipboard mechanism, but with the source floor pre-selected and the paste
  target constrained to the window-scene bounds. The designer shouldn't have to eyeball which
  tiles sit outside a building's window; the panel should highlight the parent floor's tiles
  that align with the window's world-space position and facing direction.

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

## Tier 6 — Agent-facing toolkit

Tiers 1–4 treat the visualizer as a tool a human designer drives through the GUI. Tier 6 treats it
as a tool an **AI agent** drives programmatically. The GUI becomes a verification window; edits
flow through JSON-in / JSON-out primitives. Current tools like `paintCell`, `applyCellsToGrid`,
`setSpawn`, `setDoorTarget`, `runValidation`, `prepareSaveCurrentFloor` are all the right
primitives — they just aren't callable from outside the page's script context.

Structured as five passes, each dependent on the one before. The first pass unlocks everything
downstream. Each pass is small enough to ship independently; none requires rewriting existing
features.

### Pass 1 — Headless command surface ✅ (shipped v0.10)

Goal: the visualizer accepts and executes a structured command without a human click.

Two delivery modes share the same underlying command router so we don't fork the execution path:

- **In-page `window.BO` dispatch object.** Exposes `BO.run({action, ...args})` returning a
  `{ok, result, error}` shape. Every action maps to an existing internal function (e.g.
  `action:'paint'` → `applyCellsToGrid(cells, tile)`; `action:'setSpawn'` → `setSpawn(x, y)`).
  An agent driving the browser (Claude-in-Chrome, Puppeteer, etc.) calls `BO.run(...)` via
  `javascript_tool` / `page.evaluate` and reads the result.
- **Node CLI: `tools/blockout-cli.js`.** Same action vocabulary, but mutates
  `tools/floor-data.json` directly (or drives a headless Puppeteer session for actions that
  need canvas rendering). Commands:
  ```
  node tools/blockout-cli.js paint-rect --floor 2.1 --at 5,5 --size 3x3 --tile WALL
  node tools/blockout-cli.js set-spawn --floor 1.3.1 --at 4,8
  node tools/blockout-cli.js set-door-target --floor 2.2 --at 12,4 --target 2.2.1
  node tools/blockout-cli.js validate --scope all --out report.json
  node tools/blockout-cli.js save --floor 2.1
  ```

Initial action set (matches existing internal calls one-to-one):
`getFloor`, `listFloors`, `paint`, `paintRect`, `paintLine`, `floodFill`, `replaceAllOfType`,
`stampClipboard`, `resize`, `setSpawn`, `setDoorTarget`, `validate`, `save`.

Success criteria: an agent can create a 3-room floor end-to-end using only command calls, save
the result to `engine/floor-blockout-*.js`, and load it successfully in the game — with no human
interaction beyond the initial `request_access` prompt.

### Pass 2 — Perception tools ✅ (shipped v0.11)

Agents can't see a canvas. They need text-shaped observations of the world state.

- **`BO.renderAscii(floorId, viewport?)`** — returns the grid as a text block using schema glyphs
  (`.` floor, `#` wall, `D` door, `W` window, `·` empty, etc.). Optional viewport clips to a
  rect. Returns `{glyphs: "...", legend: [{glyph:'#', tileId:1, name:'WALL'}, ...]}` so the
  agent can round-trip glyphs back to tile IDs.
- **`BO.diffAscii(floorId, beforeSnapshot)`** — renders the grid as ASCII with `+`/`-`/` `
  markers at each cell that changed vs a prior snapshot. Use after each edit to self-verify.
- **`BO.captureFloor(floorId)`** — returns a base64 PNG of the current canvas view of the floor.
  For vision-capable agents. Uses existing `canvas.toDataURL()` — just needs to be wired to the
  command router.
- **`BO.describeCell(floorId, x, y)`** — returns the tooltip's data structurally: tile name, ID,
  category, walkability, opacity, room membership, door target, exterior-face direction,
  original tile (if modified). Same info as the hover tooltip, shaped for consumption.
- **`BO.reportValidation(scope)`** — wraps `runValidation()` so the agent gets structured
  feedback (`[{severity, kind, msg, cells, floorId}]`) after every edit without opening the modal.

### Pass 3 — Tile semantic lookup ⬜

Agents guess tile IDs wrong constantly. A query layer fixes this.

- **`BO.findTiles(query)`** — returns tile IDs matching a predicate query.
  ```
  BO.findTiles({ predicate:'isWindow' })       // all window tiles
  BO.findTiles({ category:'structure', walk:false })
  BO.findTiles({ namePattern:/^WALL/ })
  BO.findTiles({ biome:'coastal', role:'floor' })  // needs biome metadata, Tier 3 follow-up
  ```
- **`BO.tile(name)`** / **`BO.tileName(id)`** — case-insensitive lookup both ways.
- **`BO.tileSchema()`** — returns the full schema (same as `tools/tile-schema.json` but from
  the live in-memory copy, so edits to `tiles.js` picked up via `extract-floors` are reflected
  without reloading the visualizer).

### Pass 4 — Pattern / stamp library ✅ (shipped April 2026, v0.13)

Compose primitives into named operations so an agent can say "build a room" instead of enumerating
every cell. All mutations flow through the existing heterogeneous-bulk undo entry
(`{type:'bulk', cells:[{x,y,oldTile,newTile}], newTile:null}`) so Ctrl+Z rolls back an entire stamp
in one step.

- ✅ **`BO.stampRoom({ at, size, wallTile, floorTile })`** — rectangular room with walls on the
  perimeter, floor tile in the interior. Accepts tile names or numeric IDs.
- ✅ **`BO.stampCorridor({ from, to, width, floorTile, wallTile? })`** — Bresenham path with
  Manhattan-expanded width and optional wall decoration on the diagonal/orthogonal fringe.
- ✅ **`BO.stampTorchRing({ at, radius, step, torchTile })`** — torches evenly spaced around a
  square perimeter at `radius` with stride `step`.
- ✅ **`BO.saveStamp({ name, at, size })`** / **`BO.applyStamp({ name, at, rotate?, flipH?, flipV? })`** —
  capture a rectangle as a named grid slice in the in-memory registry; re-apply anywhere with
  any of 8 orthogonal orientations (0/90/180/270 × optional H/V flip).
- ✅ **`BO.listStamps()`** / **`BO.deleteStamp({name})`** — catalog management.
- ✅ **`BO.exportStamps()`** / **`BO.importStamps(dump, {merge?})`** — JSON round-trip for cross-
  session reuse and browser↔CLI interop. The CLI persists the same registry to
  `tools/stamps.json` automatically on every save/delete.
- ✅ **CLI mirror** in `tools/blockout-cli.js`: `stamp-room`, `stamp-corridor`,
  `stamp-torch-ring`, `save-stamp`, `apply-stamp`, `list-stamps`, `delete-stamp`.

Deferred to a later pass: ship default stamps derived from existing floors (building-corner-NE,
stall-6x4, pergola-run, cathedral-window, bonfire-nook). These should be generated by a separate
`tools/mine-stamps.js` script that crawls floor-data.json for recurring motifs rather than
hand-authored.

### Pass 0 — Modularization for agent crawlability ✅ (0.1–0.4 shipped 2026-04-14; 0.5 scaffolded; 0.6 deferred)

**Prerequisite for Pass 5b.** The blockout visualizer has grown to ~4,000 lines in a single
HTML file; `peek-workbench.html` is 7,643 and `boxforge.html` is 6,850. Practical agent context
budget is **1,500–2,000 lines / 50–80 KB per Read** before accuracy falls off. Adding the world
designer bridge on top of the current monolith pushes us well past 5,000 — every subsequent Pass 5b
phase starts with "re-read the whole file" and new bugs come from "I didn't see that helper six
sections up." Pass 0 fixes the substrate before we build on it. Scope: **~3 days**.

**Goals**
- Every primary dev-tool file readable in one pass.
- Agents use a module manifest (~40 lines) to pick the 1–2 files they need, never the whole set.
- `tools/` code-review-graph indexable so `semantic_search_nodes` / `query_graph` / `get_impact_radius`
  give useful answers on the dev-tool codebase.
- File-size budgets CI-enforced so regression is visible immediately.

**0.1 — Extract inline `<script>` from `blockout-visualizer.html` into `tools/js/bv-*.js`** (1½ days)

Mirror the engine's IIFE + load-layer pattern. Each module exposes a frozen global; load order
defined in the HTML via ordered `<script>` tags. Proposed split — each file target ≤ 800 lines:

```
tools/js/
  bv-tile-schema.js          # fallback TILE_SCHEMA + live schema loader
  bv-edit-state.js           # EDIT, selection, per-floor history
  bv-brush.js                # brush helpers, stroke accumulator
  bv-primitives.js           # paintRect, paintLine, floodFill, replaceAll
  bv-lasso.js                # lasso selection + marquee
  bv-clipboard.js            # copy/cut/paste, cross-floor clipboard
  bv-undo.js                 # pushUndo/applyEntry; stroke/bulk/meta types
  bv-validation.js           # walkability, door contracts, spawn, required tiles
  bv-save-patcher.js         # write back to engine/floor-blockout-*.js
  bv-render.js               # canvas draw loop, hover/highlight overlays
  bv-meta-editor.js          # Tier 3 spawn + doorTargets UI
  bv-window-scenes.js        # Tier 4 window-scene editor
  bv-bo-router.js            # BO.run({action,...}) — switch dispatcher, no logic
  bv-bo-perception.js        # Pass 2 renderAscii/diffAscii/describeCell/captureFloor
  bv-bo-tile-lookup.js       # Pass 3 tile/tileName/tileSchema/findTiles
  bv-bo-stamps.js            # Pass 4 parametric + named-stamp registry
  bv-bo-floor.js             # (Pass 5a) createFloor/setBiome/placeEntity
  bv-bo-world.js             # (Pass 5b) exportWorldGraph/applyWorldDiff bridge
```

`blockout-visualizer.html` shrinks to ~500 lines — markup, `<link>` to a new stylesheet, and an
ordered list of `<script src>` tags with a comment per layer.

**0.2 — Extract inline `<style>` into `tools/css/blockout-visualizer.css`** (½ day)

Two-page skim instead of sixty. Grouped with a table-of-contents header comment.

**0.3 — Split `blockout-cli.js` into `tools/cli/`** (½ day)

Currently 806 lines. Pass 5b's world-graph commands push it past 1,200. Split now:

```
tools/blockout-cli.js        # thin dispatcher (~100 lines); requires cli/*.js
tools/cli/
  shared.js                  # loadFloors, saveFloors, resolveTile, parseArgs, fail
  commands-paint.js          # Pass 1: paint, paint-rect, paint-line, flood-fill, replace
  commands-meta.js           # set-spawn, set-door-target, resize, list-floors, get-floor
  commands-perception.js     # Pass 2: render-ascii, describe-cell, diff-ascii
  commands-validation.js     # report-validation
  commands-tile-lookup.js    # Pass 3: tile, tile-name, tile-schema, find-tiles
  commands-stamps.js         # Pass 4: stamp-room/corridor/torch-ring, save/apply/list/delete-stamp
  commands-floor.js          # (Pass 5a) create-floor, set-biome, place-entity
  commands-world.js          # (Pass 5b) export-world-graph, apply-world-diff
```

Each command file 200–400 lines. Dispatcher registers via
`Object.assign(COMMANDS, require('./cli/commands-stamps'))`. Per-file `node --check` smoke-testable.

**0.4 — Module manifest (`tools/js/MODULES.md`)** (2 hours)

One-line-per-file inventory so agents pick modules before reading code. Template:

```
bv-bo-router.js        exports: BO.run; switch dispatcher, zero logic
                       depends on: bv-bo-perception, bv-bo-tile-lookup, bv-bo-stamps,
                                   bv-bo-floor, bv-bo-world
bv-bo-stamps.js        exports: stampRoom, stampCorridor, stampTorchRing, saveStamp,
                                applyStamp, listStamps, deleteStamp, exportStamps, importStamps
                       Pass 4; heterogeneous-bulk undo; in-memory stamp registry
                       depends on: bv-edit-state, bv-undo
bv-edit-state.js       exports: EDIT, FLOOR_HISTORY, getCurrentFloor, setCurrentFloor
                       per-floor undo/redo stacks, lasso state, clipboard ref
                       depends on: (none)
...
```

Linked from top of `BO-V README.md` under a new "Module map" section.

**0.5 — `tools/` code-review-graph** (2 hours)

Run `python -m code_review_graph build` rooted at `tools/` (separate DB from the game-root and
`raycast.js-master/` graphs). The `.claude/settings.json` auto-routes MCP queries based on cwd
per CLAUDE.md's "When working in that subdirectory, the graph MCP server will serve its graph
instead of the main Dungeon Gleaner graph" pattern. Verify with:
- `semantic_search_nodes` — "find all functions named `paint*`" returns the 4 primitives.
- `query_graph` — "callers of `pushUndo`" returns every Pass-1-through-4 mutation path.
- `get_impact_radius` — "what breaks if I change `resolveTile`?" returns the router + all
  stamp commands.

None of these work meaningfully on the current monolith — the builder produces one giant node
per file. The split is the prerequisite.

**0.6 — File-size budgets + CI check** (2 hours)

Add `scripts/check-file-sizes.sh` (and `.ps1`) run from CI:

```
max-html-lines:        500    # markup + script tags only
max-js-module-lines:   800    # typical engine/ IIFE size
max-cli-command-lines: 400    # one conceptual unit per file
exempt:                       # tracked tech debt, split when next edited
  - tools/peek-workbench.html
  - tools/boxforge.html
```

Fails CI on regression. Soft fence — easy to raise the number — but override frequency becomes a
visible maintenance signal.

**Deferred (tracked tech debt, not blocking Pass 5):**
- `peek-workbench.html` (7,643 lines) — split on next substantive edit.
- `boxforge.html` (6,850 lines) — split on next substantive edit.
- `engine/texture-atlas.js` (6,419 lines), `engine/menu-faces.js` (4,720) — game-side, separate
  roadmap item. The existing Layer-2 raycaster extraction (`docs/RAYCASTER_EXTRACTION_ROADMAP.md`)
  is the model.

**What this unlocks**

- Pass 5b bridge (`bv-bo-world.js` + `tools/js/wd-bridge.js`) lands as two new files, zero
  re-edits to the 4,000-line visualizer.
- Pass 5a's `createFloor` / `setBiome` / entities work lands as `bv-bo-floor.js` (new) without
  bloating any existing module past its budget.
- The world designer (`tools/world-designer.html`) can import *only* what it needs through the
  postMessage bridge, never the whole editor UI.
- Agent-driven work on dev tools stops starting with "re-read the whole file."

---

### Pass 5a — Floor semantics primitives ⬜

The highest-leverage *single-floor* tool. One call takes an agent from zero to "a valid floor
exists." Stays vanilla — no new runtime deps, ships inside `blockout-visualizer.html` and
mirrored in the CLI. Scope: **3–4 days**.

- **`BO.createFloor({ id, depth, name, biome, template? })`** — consults `Biome Plan.html`,
  picks appropriate tiles for the biome, seeds a spawn, wires parent door targets back per
  floor-ID convention, and generates the skeleton `engine/floor-blockout-*.js` with a valid
  `registerFloorBuilder` entry. Optional `template` parameter picks a starter layout
  ("single-room", "two-room-corridor", "cellar-3x3-grid", etc.).
- **`BO.setBiome(floorId, biomeId)`** — swap a floor's biome; auto-substitute biome-equivalent
  tiles (coastal stone → desert sandstone, etc.). Requires biome-tile mapping, defined in a
  new `tools/biome-map.json` side-car.
- **`BO.placeEntity(floorId, {type, at, props})`** — writes to the parallel entities array
  (Tier 3 decision) without touching the grid. Types: `npc`, `enemy`, `loot`, `trigger`.
- **`BO.gitSnapshot(label)`** / **`BO.gitDiff()`** — thin wrappers around `git add`/`git diff`
  for `tools/floor-data.json` + `engine/floor-blockout-*.js`. Lets an agent session produce a
  reviewable PR rather than a mystery diff on main. Not strictly necessary but closes the
  review loop cleanly.

Deliverables:
1. `tools/biome-map.json` — biome → {wallTile, floorTile, ceilingTile, accentTiles[], torchTile,
   breakableSet[]}. Seeded from `docs/Biome Plan.html` v5.
2. `tools/templates/` — floor-shape starter JSON (`single-room.json`, `two-room-corridor.json`,
   `cellar-3x3-grid.json`, etc.) reusable by `createFloor`.
3. Entities array normalized to `floor.entities: [{id, type, at:{x,y}, props}]` in
   `floor-data.json`; extraction pass updated in `extract-floors.js`.
4. Save patcher extended to emit a `registerFloorBuilder` skeleton + write `engine/floor-blockout-<id>.js`.

### Pass 5c — Scaffold-on-save + parent wiring ✅ (shipped April 2026)

The companion to Pass 5a for the **write-back** half of the loop. When an agent (or the
world-designer handoff) births a floor that has no `engine/floor-blockout-<id>.js` yet, the
save patcher now scaffolds it from in-memory state, wires the parent's `doorTargets`, and
paints the DOOR tile on the parent grid — all from one Ctrl+S / `{action:'save'}`.

**Shipped in `tools/js/bv-save-patcher.js`:**

- **`scaffoldFloorBlockoutSource(floorId, floor)`** — generates a full IIFE matching the
  hand-authored `floor-blockout-*.js` convention (`var W/H`, labeled `GRID` rows, `SPAWN`,
  `ROOMS` / `DOOR_TARGETS` / `SHOPS` / `ENTITIES`, `build()` returning the standard shape,
  trailing `FloorManager.registerFloorBuilder`). Called on save when the target file doesn't
  exist yet.
- **`_prepareParentDoorPatch(parentId, doorCoord, childId)`** — reads the parent file via
  FS handle or fetch, merges `doorTargets` via `patchDoorTargetsInSource`, stamps a DOOR tile
  on a parent grid clone, chains `patchGridInSource`. Mutates the in-memory `FLOORS[parentId]`
  (grid + doorTargets) so the live view stays in sync. Returns a patch record that rides in
  `SAVE_PENDING.secondary`.
- **Multi-file save modal** — when a pending-floor spec is present, the confirm-diff modal
  stacks two diff sections: "★ NEW FILE · floor-blockout-X.js" and "↳ PARENT WIRING ·
  floor-blockout-P.js (doorTargets merge + DOOR tile @ x,y)". Title reads "Commit new floor
  — 2 files". Cancel / Download / Write route both files.
- **Clipboard-copied `<script>` tag** — after a successful scaffold write, the
  `<script src="engine/floor-blockout-X.js"></script>` line lands in `navigator.clipboard`.
  A delayed reminder toast surfaces the paste hint. Only manual step left is inserting the
  line into `index.html` at the correct Layer-3 position.
- **Live render refresh** — if the parent happens to be the currently-viewed floor, `draw()`
  fires after the secondary patch so the newly-stamped DOOR tile shows up without a reload.
- **Pending-pool cleanup** — `_clearPendingSpec(pendingFloorId)` drops the
  `sessionStorage['pendingFloorPool']` entry so the world-designer node transitions from
  amber "pending" back to a normal node on next reload.
- **Fallback download** — if the FS handle write fails or isn't granted, both files fall
  through to blob-downloads and the toast flags the miss.

**World-designer side (`tools/js/world-designer.js`):**

- `＋ New Floor` button opens a modal (parent dropdown, floor ID with live validation,
  biome dropdown, W/H, door-coord).
- Submit writes a spec to `sessionStorage['pendingFloorPool'][floorId]` and renders a
  dashed amber node on the graph.
- "Open in BO-V" action promotes the spec to `sessionStorage['pendingFloorSpec']` and
  opens the visualizer, which consumes it at boot via `createFloor` and surfaces a
  "NEW FLOOR" banner. Ctrl+S from there triggers the Pass 5c commit flow above.

**Net effect:** spinning up a new floor is now *graph-click → modal-submit → paint in BO-V
→ Ctrl+S → paste script tag*. No manual IIFE authoring, no hand-merging of parent
doorTargets, no forgotten DOOR tile on the parent grid.

### Pass 5d — Agent feedback closeouts ✅ (shipped 2026-04-15, Track C)

Scoped from `tools/BO-V agent feedback.md` (Floor 3.1.1 field report, April 2026). The
agent authored 3.1.1 raw rather than via the CLI because the toolchain still has five
concrete friction points. This pass closes all five. Scope: **3–4 days**.

**Blockers identified:**

1. **No `--dry-run` on mutating CLI commands.** Every `paint-rect` / `stamp-room` / `set-spawn`
   writes `floor-data.json` immediately. A 20×20 hand-designed floor needs commit-then-revert
   loops to iterate.
2. **Canonical state diverges.** Hand-authored `engine/floor-blockout-*.js` is the runtime
   source; CLI operates on `tools/floor-data.json`. No documented round-trip means any CLI
   edit lands in a JSON the engine doesn't read for hand-authored floors.
3. **No per-command `--help`.** Arg grammar (`--name` vs `--ref`, coordinate order, tile-ID
   vs tile-name) isn't discoverable without reading the module source.
4. **Stamp library is generic.** `single-room`, `two-room-corridor`, `cellar-3x3-grid` don't
   cover biome-specific primitives (`TUNNEL_RIB` corridor runs, `PORTHOLE_OCEAN` window
   pairs, `TUNNEL_WALL` alcove flanks) that the submarine-base biome demanded.
5. **`render-ascii` reads only `floor-data.json`.** Can't inspect a hand-authored IIFE
   floor before loading it in-harness.

**Deliverables (each maps to a blocker):**

1. **`--dry-run` on every mutating action** (browser + CLI). Returns the ASCII diff the
   command *would* produce, without touching `floor-data.json` or the grid. Implement as a
   shared pre-flight path in `bv-bo-router.js` / `cli/commands-paint.js`; `dryRun:true` short-
   circuits after `diffAscii` and skips the apply step. Lands as a top-level flag: `--dry-run`
   on the CLI, `{action:'paintRect', dryRun:true, ...}` in the browser. Every mutator gets it.
2. **`bo ingest` / `bo emit` IIFE round-trip.**
   - `bo ingest --from engine/floor-blockout-<id>.js` — parses the IIFE via the existing
     `extract-floors.js` VM sandbox, merges the result into `floor-data.json` as a normal
     floor entry. Leaves the engine file untouched.
   - `bo emit --as iife --floor <id> [--out <path>]` — reuses `scaffoldFloorBlockoutSource`
     from `bv-save-patcher.js` (refactored into a shared `tools/cli/emit-iife.js`) to write
     a fresh IIFE from `floor-data.json`. Overwrites `engine/floor-blockout-<id>.js` if
     `--overwrite` is passed; otherwise writes to `--out` or stdout.
   - One source of truth: agents can CLI-edit against JSON, then `bo emit` to refresh the
     engine file. Pass 5c's save patcher already does the reverse for browser-driven edits;
     this pass makes the CLI symmetric.
3. **`bo help <command>` printing arg grammar + one worked example.** Store per-command
   metadata (description, args, example) in a `CMD_META` table next to the dispatch table in
   each `cli/commands-*.js`. `bo help` with no args lists commands; `bo help paint-rect`
   prints its block. Ships as part of `cli/commands-help.js`. Add a matching
   `window.BO.help(action)` in the browser that returns the same payload as JSON.
4. **Biome-specific stamp expansion** — honor the agent's three asks verbatim:
   - `stamp-tunnel-corridor --len N --width W [--rib-tile TUNNEL_RIB] [--floor-tile ...]`
     — N-long corridor with ribbed flanks, mouths that taper from `W` to 1.
   - `stamp-porthole-wall --side L|R --span N [--tile PORTHOLE_OCEAN]` — row of portholes
     cut into an existing wall run, spaced to preserve jamb masonry between panes.
   - `stamp-alcove-flank --count N [--tile TUNNEL_WALL]` — symmetric alcove pairs framing
     a centerline; `--count` controls pair count.
   Each exists as a parametric stamp in `bv-bo-stamps.js` + `cli/commands-stamps.js`, named
   so they compose cleanly with the existing `stampRoom` / `stampCorridor` / `stampTorchRing`
   vocabulary. Ship with a three-entry starter `tools/stamps.json` registry so agents don't
   need to reinvent them.
5. **IIFE-aware `render-ascii`.** When the target floor isn't in the loaded
   `floor-data.json`, fall back to the `bo ingest` path internally — parse the engine file
   on demand, render its grid, don't persist the ingest. Agent gets the ASCII view it wants
   without a pre-step.

**Stretch (if timeline allows):**

- **`bo validate` expanded checklist** — explicit rules for: spawn walkable, every
  `STAIRS_*` / `DOOR*` has a `doorTargets` entry, room rects contain no wall tiles, every
  freeform-tile depth matches the contract's `tileWallHeights` table. The first three are
  partially covered today; the fourth is net-new and closes the agent's "right now I eyeball
  all four of those" note.
- **Deprecate the hand-authored vs JSON split** — once `bo emit` / `bo ingest` is stable,
  update `BO-V README.md` Workflow section to recommend a single JSON-first pipeline where
  `bo emit` is the only path that writes IIFE. Hand-authored floors become a legacy case.

**Dependencies:** Pass 0 (modularization) is NOT strictly required here — the CLI already
splits into `tools/cli/commands-*.js`. But landing Pass 0 first makes the browser-side work
cleaner because `bv-bo-router.js` and `bv-bo-stamps.js` would be freestanding files rather
than sections of `blockout-visualizer.html`. Reasonable order: Pass 5d first if we want the
agent feedback addressed before Pass 0's refactor churn; otherwise swap.

**Exit criteria:**

- Agent re-attempts the 3.1.1 floor build via the CLI and reports it was faster than raw.
- `node tools/blockout-cli.js --dry-run paint-rect ...` never mutates `floor-data.json`.
- `bo ingest` on an arbitrary hand-authored floor produces a `floor-data.json` entry that
  round-trips via `bo emit` byte-identical (modulo comment whitespace).
- `bo help stamp-tunnel-corridor` prints args + a worked `--len 12 --width 3` example.

**Shipped status (Track C, 2026-04-13 – 2026-04-15):** All five blockers closed plus the
stretch `bo validate` expansion (C6). Implementation landed across `tools/cli/commands-*.js`
(17 modules) and `tools/js/bv-*.js` (26 modules). See `tools/short-roadmap.md` Track C for
per-slice details. The stretch item (`bo validate` expanded checklist) shipped as C6 with
door-no-target, room-has-walls, and offset-no-height (browser-only) rules.

### Pass 5b — World graph editor (portal port) ⬜

Port the EyesOnly jsPlumb-based world designer into `tools/` and point it at Dungeon Gleaner's
schema. The graph becomes a **view** over `floor-data.json` with edit operations that fan out to
the existing Pass 1/5a primitives — not a second source of truth. Scope: **~1.5 weeks**, shipped in
six phases so we can land value incrementally.

**Relaxed rule (dev-tool-only):** `tools/` may pull in dev-time dependencies (vendored or
`node_modules/`) as long as the webOS build whitelist in `scripts/build-webos.*` never copies them
into the ship bundle. The game itself (`engine/`, `index.html`, `data/`, `assets/`) stays vanilla
and offline-capable. See "Design constraints for Tier 6" below.

**Scaffold already in place** (copied from `EyesOnly/public/portal/` — April 2026):
- `tools/world-designer.html`, `tools/unified-designer.html`
- `tools/js/{world-designer,unified-designer,unified-data-manager}.js`
- `tools/css/{asset-designer,map-designer,unified-designer}.css`
- `tools/world-engine/{worlds,floors}/` (placeholder sample `test-world.json`)

The scaffold is currently a verbatim copy — still references Eyes node types, the cdnjs jsPlumb
URL, and Eyes' flat floor model. The phases below replace each of those.

**Phase 5b.0 — Vendor + scaffold cleanup** ✅ (shipped 2026-04-16)

- Vendored jsPlumb Community Edition 2.15.6 into `tools/vendor/jsplumb/` (MIT, ~216 KB JS +
  ~16 KB CSS). HTML already referenced the local path; the CDN URL was already removed.
- `tools/floor-data.js` sidecar (auto-generated by `extract-floors.js`) exposes
  `window.FLOOR_DATA` so the world designer works under `file://` without CORS.
- `tools/js/world-designer.js` (956 lines) was already a DG-native rewrite — not an Eyes
  diff. Supports depth-typed nodes (d1/d2/d3), ghost nodes (proc-gen + planned), pending
  nodes (Pass 5c new-floor modal), edge reciprocity checks, biome-map + tile-schema loaders,
  layout persistence, and the `sessionStorage['pendingFloorSpec']` handoff to BO-V.
- Build-webos whitelist and `.gitignore` deferred (tracked alongside Pass 0.6 CI checks).

**Phase 5b.1 — Read-only viewer** ✅ (shipped 2026-04-16, merged into scaffold)

The read-only viewer shipped as part of `js/world-designer.js` (956 lines). All planned items
landed:
- Reads `floor-data.json` via the `floor-data.js` sidecar (`window.FLOOR_DATA`); falls back
  to `fetch()` when served over HTTP.
- One node per floor (21 floors), depth-colored (d1 green, d2 blue, d3 purple).
- One directed edge per `doorTargets` entry. Non-reciprocal edges render red dashed + warning
  count in the sidebar summary.
- Auto-layout by branch (X) and depth (Y); draggable nodes with grid snap.
- Layout downloads to `tools/world-layout.json` via Save Layout button; reloads on next boot.
- Ghost nodes (proc-gen slots + planned dangling refs) synthesized from `procGenChildren[]`
  and unresolved `doorTargets`.
- Pending nodes (Pass 5c new-floor modal) with `sessionStorage['pendingFloorPool']` persistence.
- Inspector shows floor metadata, door targets with clickable jump links, spawn, rooms, entities.
- Success criterion met: 21 floors + edges visible, non-reciprocal edges flagged red.

**Phase 5b.2 — Bridge to BO.run** ✅ (shipped 2026-04-16)

Architecture: iframe postMessage bridge. Three files changed/created:

- **`bv-bo-router.js`** — added `window.addEventListener('message', ...)` listener at the end
  of the IIFE. Protocol: inbound `{_bo:true, id, cmd}` → dispatches `BO.run(cmd)` → outbound
  `{_bo:true, id, result}`. The `_bo` flag prevents collisions with other postMessage traffic;
  `id` enables promise correlation.
- **`js/wd-bo-bridge.js`** (new, 135 lines) — promise-based wrapper. `WDBridge.init()` creates
  a hidden iframe pointing at `blockout-visualizer.html`. `WDBridge.run({action, ...})` returns
  a `Promise<result>`. Convenience methods: `.validate(scope)`, `.listFloors()`, `.getFloor(id)`.
  10-second timeout per call; `.reload()` destroys + recreates the iframe.
- **`world-designer.html`** — added `<script src="js/wd-bo-bridge.js">` before world-designer.js,
  added "Validate All" header button, added CSS for validation badges (`.dg-val-badge`,
  `.dg-val-err`, `.dg-val-warn`).
- **`js/world-designer.js`** — `boot()` calls `WDBridge.init()` + dims the Validate button
  until bridge is ready. "Validate All" button calls `WDBridge.validate('all')` and overlays
  per-node badges (error count + severity outline). Reload also reloads the bridge iframe.
  Inspector shows validation issues when a node with issues is selected. `DG_WORLD` debug
  global exposes `runBridgeValidation()` and `validationIssues()`.
  
Note: the roadmap spec said "All reads route through BO.run" — we preserved the direct
`floor-data.js` sidecar path for floor data (faster, works under `file://`) and added the
bridge for validation only. Phase 5b.3 edit-mode mutations will route through the bridge.

**Phase 5b.3 — Edit mode** ✅ (shipped 2026-04-16)

- New Floor modal now routes through `WDBridge.run({action:'createFloor'})` when the bridge is
  ready. Falls back to pending-pool creation (original behavior) if bridge is unavailable or errors.
  Reciprocal doorTarget on the parent is also set via bridge when a door coord is specified.
- **Door contract modal**: right-click → "Add Door Connection…" opens a dialog with from/to floor
  selects, coordinate fields for both sides, and a reciprocal checkbox. OK calls
  `WDBridge.run({action:'setDoorTarget'})` for both directions (when reciprocal is checked).
  Validates coords against floor grid dimensions.
- **Delete floor modal**: right-click → "Delete Floor…" opens confirmation with cascade mode select
  (orphan children vs. delete subtree). Routes through
  `WDBridge.run({action:'deleteFloor'})` — a new primitive added to `bv-bo-floor.js`. Cleans up
  dangling doorTargets in surviving floors. Pending floors are deleted from the local pool directly.
  Ghost nodes cannot be deleted (must remove the parent reference instead).
- **`deleteFloor` BO action** (new, `bv-bo-floor.js`): supports `cascade:'orphan'` (default) and
  `cascade:'delete'` (recursive subtree). Returns `{deleted:[], orphaned:[]}`. Scrubs doorTargets
  from surviving floors that pointed at deleted floors.
- **Right-click context menu** on any node (authored, ghost, or pending): three actions —
  "Open in Blockout Editor" (opens `blockout-visualizer.html?floor=<id>` in new tab),
  "Add Door Connection…", and "Delete Floor…".
- All three node factories (`makeNode`, `makeGhostNode`, `makePendingNode`) now attach
  `contextmenu` event handlers.
- `DG_WORLD` debug global extended with `openInBlockoutEditor()`, `openDoorContractModal()`,
  `openDeleteModal()`.

**Phase 5b.4 — Diff-apply + agent API** ✅ (shipped 2026-04-16)

- **`BO.run({action:'exportWorldGraph'})`** — returns `{nodes, edges, summary}`. Each node carries
  id, biome, gridW/H, depth, type, parent, spawn, entity/room/door counts. Each edge carries
  from, to, fromCoord, reciprocal flag, type. Summary has floor/edge counts, non-reciprocal count,
  depth breakdown.
- **`BO.run({action:'applyWorldDiff', nodes, edges, deletes, biomes, validate})`** — transaction
  semantics: Phase 1 validates all inputs (missing fields, duplicate floor IDs, etc.) and returns
  early with `{applied:false, errors:[]}` if any fail. Phase 2 snapshots via `_snapshotAll()`.
  Phase 3 applies in order: deletes → nodes (createFloor) → biomes (setBiome) → edges
  (setDoorTarget, with reciprocal support). On any error, rolls back via `_restoreAll()` and
  returns `{applied:false, error, partial}`. Optional `validate:true` runs post-apply validation.
- **`bv-bo-world.js`** (new, ~250 lines) — browser-side IIFE registering both actions via
  `window.BO._register()`. Loads after `bv-bo-floor.js` in `blockout-visualizer.html`.
- **CLI mirror**: `commands-world.js` (new, ~250 lines) adds `export-world-graph` (read-only,
  stdout JSON) and `apply-world-diff --input diff.json` (validates, applies, saves, supports
  `--dry-run`). Wired into `blockout-cli.js` command registry.
- World-level undo: browser-side `applyWorldDiff` uses `_snapshotAll()` / `_restoreAll()` for
  atomic rollback on error. The existing per-floor undo stacks are preserved for fine-grained
  undo of individual tile edits made by the fanned-out primitives.

**Phase 5b.5 — Polish** ✅ (shipped 2026-04-16)

- **Biome-tinted node backgrounds**: `biomeTintStyle()` reads `biome-map.json` palette `wallDark`
  at 40% opacity as a `linear-gradient` overlay on the depth base color, plus `wallLight` as the
  border tint. Every authored node gets a unique color fingerprint from its biome.
- **Validation overlay**: already shipped in 5b.2 (red/yellow outline, badge counts, inspector
  detail). 5b.5 inherits it.
- **Subgraph zoom**: right-click → "Zoom into Subtree" dims all nodes/edges outside the selected
  floor's subtree (opacity 0.25, pointer-events disabled). "Zoom Out" header button resets to
  full view. State tracked via `_zoomRoot`.
- **Node metadata surface**: `metaSummary()` renders entity/room/door counts as a compact fourth
  line in the node body (e.g. "3 ent · 2 rm · 4 dr"). `.dg-node-meta` CSS class in green-tint.
- **Export to PNG**: `exportToPng()` renders the graph to an offscreen `<canvas>` — grid background,
  bezier edge lines (color-coded by type, dashed for non-reciprocal), rounded-rect nodes with
  ID/biome/size labels. Downloads as `world-graph-<timestamp>.png`. Bounding box auto-calculated
  from node positions with 40px padding.

**Deferred to later passes:**
- Drag-to-reorganize entire subgraphs (move floor 2.2 + 2.2.1 + 2.2.2 as a unit).
- Procgen recipe nodes — now promoted to Pass 6 (next up).

### Pass 6 — Procedural generation + live preview 🟡 (in progress)

With Pass 5b complete, the world graph + `applyWorldDiff` provide the structural foundation
procgen needs: create floors, wire edges, and validate the result — all transactionally. Pass 6
builds the generation layer on top.

**Phase 6.1 — Recipe schema + BSP generator + CLI/browser wiring** ✅ (shipped 2026-04-16)

- **Recipe JSON schema** (`tools/recipes/recipe.schema.json`): tunable knobs for biome, faction
  (mss/pinkerton/jesuit/bprd/neutral), grid size, strategy type, room count/size ranges, corridor
  style (straight/winding/l-bend/random), corridor width, extra loop-back fraction, entity
  densities (torches, breakables, traps, chests, corpses, enemy budget), door placement
  (entry/exit wall, boss gate), and RNG seed for deterministic output.
- **Three strategy archetypes** shape generated topology post-BSP:
  - `cobweb` — long 1-wide corridors with branch stubs for spider web deployment chokepoints.
  - `combat` — expanded rooms with alcove ambush nooks, wide corridors, sightline-friendly.
  - `pressure-wash` — winding self-crossing loops that reward/punish route planning (hose kinks).
  - `mixed` — balanced blend of all three at 1/3 weight each.
- **`tools/procgen.js`** (~600 lines, Node): BSP room carving, Prim's MST corridor linking, strategy
  decorators, entity placement (torches on room perimeters, breakables from biome set, traps in
  corridors, chests against walls, corpses, enemy spawn list). Deterministic via xorshift32 RNG.
  Also usable as a library: `require('./procgen').generate(recipe, {seed})`.
- **Three starter recipes**: `cobweb-cellar.json`, `pressure-wash-catacomb.json`, `combat-depths.json`.
- **CLI**: `bo procgen --recipe <path> [--floor <id>] [--seed N] [--ascii]` for preview or inject.
  `bo list-recipes` enumerates `tools/recipes/`. Wired into `blockout-cli.js` dispatcher.
- **Browser**: `bv-bo-procgen.js` registers `procgen`, `listRecipes`, `procgenPreview` BO actions.
  `procgen` with `floorId` creates the floor and paints the full grid via existing BO primitives.

**Phase 6.2 — Strategy formulas + recipe tuning** ⬜ (next)

- Refine cobweb strategy: corridor length distribution, T-junction density, dead-end depth budgets.
- Refine pressure-wash strategy: loop circumference targets, guaranteed Hamiltonian-ish sweep path.
- Refine combat strategy: room aspect ratio constraints, pillar placement, patrol route analysis.
- Balance entity densities per biome × strategy combination.
- Playtest-driven iteration: generate → play → adjust knobs → regenerate.

**Phase 6.3 — World designer recipe node UI** ✅ (shipped 2026-04-17)

- **Recipe node type** in world designer — teal-themed solid nodes (`dg-node-recipe`), distinct from
  ghost/pending/authored. `state.recipes` pool persisted via sessionStorage (`recipePool` key).
- **Recipe editor modal** — full form UI for all recipe schema knobs: id, title, parent floor, biome,
  faction, strategy (with weight), grid size, rooms (count range), corridors (style/width/extra loops),
  entities (torch/breakable/trap density, chest/enemy ranges), doors (entry/exit wall, boss gate),
  timer section (budget/sentinelGrace/heroArchetype — for fetch strategy), and RNG seed.
- **Recipe inspector panel** — displays all knobs organized by category with Expand/Edit/Discard buttons.
- **"Expand" button** — converts recipe → pending floor via WDBridge `procgen` action (if bridge ready)
  or direct conversion (stashes full recipe in pending metadata for later BO-V use).
- **Recipe edges** — dashed teal lines from parent floor to recipe node (`dg-edge-recipe`).
- **Context menu** — "Expand Recipe (generate)" action for recipe nodes.
- **Full lifecycle** — create, edit (pre-fill modal from existing recipe), discard (with confirm),
  delete (via delete modal). `isIdTaken`, `autoLayout`, `resolvePositions`, `suggestChildId` all
  recipe-aware. `DG_WORLD` debug global extended.
- ✅ **Shipped 2026-04-17:** Multi-floor recipe expansion — `expansion` schema knobs
  (`floorCount`, `idPattern`, `lastFloorExit`, `ramp`), `bo bake-multi` CLI command,
  world designer expand button creates N pending sibling floors with auto-wired edges,
  per-level difficulty ramp (enemies, traps, breakables, chests, torches), cross-floor
  door target resolution (`__parent__`/`__child__` → real floor IDs).
- ⬜ **Deferred:** Preview thumbnail via `procgenPreview` action. Phase 6.4 stretch.

**Phase 6.4 — Live preview + analytics (stretch)** ⬜

- **Live preview pane** — embedded mini raycaster view next to the node inspector. Select a floor,
  see it rendered from its spawn point, walk around with arrow keys. Uses the actual game's
  raycaster loaded as a module — requires a small refactor to let `Raycaster` init without
  `ScreenManager`/`Game`.
- **Playtest record/replay** — instrument the game to log `(floorId, x, y, dir, t)` tuples; replay
  them as a heatmap overlay on the world graph. Great for post-launch "which floors did players
  actually visit" analytics.
- **Difficulty curve preview** — plot enemy power / loot value per floor along the player's
  likely path through the graph; flag spikes and plateaus.

### Design constraints for Tier 6

- **Ship bundle stays vanilla.** `engine/`, `index.html`, `data/`, and `assets/` must work with
  zero build step and no runtime network calls — the webOS app is packaged as-is. Passes 1–5a
  honor this strictly.
- **Dev tools may take dev deps.** Starting with Pass 5b, `tools/` may pull in vendored or
  `node_modules/` dependencies (jsPlumb, test runners, procgen libs). A `scripts/build-webos.*`
  whitelist enforces that the ship bundle never includes `tools/`, `node_modules/`, or
  `vendor/`. The whitelist is CI-enforced.
- **GUI remains the source of truth for verification.** Every agent-callable action should be
  observable in the GUI — an agent calls `paintRect`, the grid repaints, a human watching the
  browser sees the change. This is the spec contract: if the GUI shows it, the agent did it.
- **Single source of truth: `floor-data.json`.** The world designer is a *view* + *diff source*,
  never state. Import computes the graph from disk; export fans out to Pass 1/5a primitives.
  No graph-exclusive data.
- **Undo/redo parity.** Every agent action flows through `pushUndo()` the same as a GUI click.
  A human can review an agent's work and `Ctrl+Z` individual steps. Pass 5b batches world-level
  edits so Ctrl+Z undoes an entire changeset.
- **Validation is the default feedback loop.** Pass 1's router should optionally re-run
  validation after each mutation and include the result in the `{ok, result, validation}`
  response shape. Default off (fast path); opt in via `{postValidate:true}`. Pass 5b's diff-apply
  always validates before committing.

---

## Tier 5 — Aspirational / post-jam

Things that would be lovely but aren't shipping before Winter 2026 webOS launch. Note: procedural
generation has graduated from this list into Pass 6 (active).

*Last reviewed: 2026-04-17. Relevance notes for Winter 2026 webOS launch.*

- **Procedural + handcrafted hybrid** — hand-place the entry + boss rooms, let the editor fill the
  middle with procgen, preview the result. *Mostly addressed:* Phase 6.3 recipe nodes let you
  define procgen blueprints alongside authored floors; Phase 6.1 BSP generator fills the middle.
  The remaining gap is the pinned-cell-aware generation (procgen respecting hand-placed anchor
  tiles) — promote if sprint dungeons need it.
- **Multi-floor view** — render the full world graph as a 3D stack of floors. *Low priority for
  webOS.* The 2D world designer graph (Pass 5b) covers the navigation use case. A 3D stack
  visualization is a "wow" demo feature, not a production tool need.
- **Collaborative editing** — multiple designers on the same floor. *Not needed.* DG is a solo/duo
  project. Drop from the list.
- **Playtesting instrumentation** — replay player paths from analytics, see heatmaps of actual
  player movement. *High value for webOS launch QA.* Promoted to Phase 6.4 stretch. Needs the
  game to log `(floorId, x, y, dir, t)` tuples first — a ~50-line instrumentation pass in
  `engine/game.js`.
- **Accessibility check** — validate against WCAG-adjacent rules: contrast between walkable and
  non-walkable, color-blind-safe tile palette, glyph readability. *Relevant for webOS
  certification.* LG's webOS app review may flag contrast issues. Consider a light-touch pass
  (palette contrast audit, not full WCAG machinery).
- **i18n preview** — swap `data/strings/en.js` for other locales to check UI overflow. *Relevant
  only if DG ships localized.* Currently English-only. Defer unless localization is scoped.

---

## Suggested implementation order

Assuming the current jam timeline (post-jam cleanup through Winter 2026 launch):

1. ✅ **Phase 3 (schema extraction)** — done. Unlocked everything downstream.
2. ✅ **Tier 1 drawing tools** — rect, flood fill, line, brush size, replace-all-of-type — all shipped.
3. 🟡 **Tier 1 selection + history + cross-floor clipboard** — mostly done.
   - ✅ Copy / Cut / Paste clipboard with bulk undo + ghost preview
   - ✅ Redo + per-floor undo/redo stacks (`FLOOR_HISTORY` parks per-floor state on switch)
   - ✅ Cross-floor clipboard persistence (code-verified)
   - ⬜ Magic wand, select-by-tile, invert, grow/shrink (nice-to-have polish)
   - ⬜ History panel + named checkpoints (deferred — core history already works)
4. ✅ **Direct file write** (Tier 2 file integration) — shipped. Save button (Ctrl+S) with
   confirmation diff modal, File System Access API + download fallback, patches only the GRID
   literal so the rest of the floor file is preserved.
5. 🟡 **Tier 4 window-scene editor** — first pass shipped (detect + panel + sub-grid editor +
   clipboard stamp + parent jump + JSON export). Still needs: engine consumption (raycaster
   reads `sceneGrid`), JSON re-import loader (rehydrate on reload), side-by-side "paste from
   parent" view, facing/sightline alignment preview, auto-inherit tiles on first open.
6. ✅ **Tier 2 validation** — shipped. Walkability BFS, door contract sanity (explicit + cross-floor
   target exists + reciprocity), spawn validity, depth-1 required-tile check. Modal with two tabs,
   severity pills, click-to-jump + red/amber/blue overlay. Heatmaps + line-of-sight still ⬜.
7. 🟡 **Tier 3 metadata editor** — spawn drag + door-target dropdowns shipped with undo; JSON
   clipboard export for paste-into-builder workflow. Still ⬜: rooms array editor, door faces,
   shops, biome picker, and extending the save patcher to rewrite `spawn:` / `doorTargets:` in
   the builder (no more manual paste).
8. ⬜ **Tier 4 tile height offset editor** — 1–2 days.
9. ⬜ **Tier 2 layers** — significant refactor. Save for when the compositional needs are clear.
10. ⬜ **Tier 3 3D preview** — defer until the editor is otherwise mature; then it becomes the wow feature.

### Tier 6 passes (agent-facing toolkit)

11. ✅ **Pass 1 — Headless command surface.** `window.BO.run()` + `tools/blockout-cli.js`. Thin
    dispatch over existing internal functions (`paintCell`, `applyCellsToGrid`, `setSpawn`,
    `setDoorTarget`, `runValidation`, `prepareSaveCurrentFloor`). Unlocks all downstream Tier 6
    work. Action set shipped: `listFloors`, `getFloor`, `selectFloor`, `paint`, `paintRect`,
    `paintLine`, `floodFill`, `replaceAllOfType`, `resize`, `setSpawn`, `setDoorTarget`,
    `stampClipboard`, `validate`, `save`, `undo`, `redo`, `describe`. CLI mirrors the same
    vocabulary over `tools/floor-data.json`.
12. ✅ **Pass 2 — Perception tools.** Shipped: `renderAscii` (glyph grid + legend + viewport
    clip), `diffAscii` (compare to a prior `getFloor` snapshot, returns annotated diff grid +
    changes array), `describeCell` (structured tooltip payload with rooms / door target /
    exterior face / wasTile), `reportValidation` (validate alias matching Pass 2 naming), and
    `captureFloor` (base64 PNG via `canvas.toDataURL`). All five mirrored in the Node CLI
    except `captureFloor` (no canvas in CLI).
13. ✅ **Pass 3 — Tile semantic lookup.** Shipped: `tile(name)`, `tileName(id)`,
    `tileSchema(nameOrId?)`, `findTiles(query)` with AND-semantics filter (`name` substring
    or `/regex/flags`, `category`, `glyph`, `walk`, `opaque`, `hazard`, + all `is*` flags).
    Both as router actions and as direct `window.BO.*` helpers, mirrored in the CLI.
14. ✅ **Pass 4 — Pattern / stamp library.** Shipped: parametric stamps (`stampRoom`,
    `stampCorridor`, `stampTorchRing`) and the named registry (`saveStamp`, `applyStamp` with
    rotate 0/90/180/270 + flipH/flipV, `listStamps`, `deleteStamp`, `exportStamps`,
    `importStamps`). CLI persists the registry to `tools/stamps.json`; browser keeps it
    in-memory and round-trips via `exportStamps` / `importStamps`. Heterogeneous-bulk undo
    makes every stamp a single Ctrl+Z step. Default stamp mining (building-corner-NE etc.)
    deferred to a later `tools/mine-stamps.js` pass.
15. ✅ **Pass 0 — Modularization for agent crawlability (shipped 2026-04-14).** 0.1: 26
    `tools/js/bv-*.js` IIFEs extracted, HTML shell ≤ 483 lines. 0.2: CSS extracted to
    `tools/css/blockout-visualizer.css`. 0.3: CLI split into 17 `tools/cli/*.js` modules.
    0.4: `tools/js/MODULES.md` manifest written. 0.5: `tools/` code-review-graph scaffolded
    (DB exists, full indexing deferred). 0.6: file-size budgets CI check not started (tracked
    tech debt).
16. ✅ **Pass 5a — Floor semantics primitives (shipped).** `createFloor({id, biome, template})`,
    `setBiome`, `placeEntity`. Ships in `tools/js/bv-bo-floor.js` + `tools/cli/commands-floor.js`
    with `tools/biome-map.json` + `tools/templates/` seeded. `gitSnapshot` / `gitDiff` deferred.
17. ✅ **Pass 5c — Scaffold-on-save + parent wiring (shipped).** `scaffoldFloorBlockoutSource`
    + `_prepareParentDoorPatch` + multi-file save modal. Closes the world-designer → BO-V
    pending-floor handoff via `sessionStorage['pendingFloorPool']`. Ctrl+S now writes the new
    engine file, merges parent `doorTargets`, paints the DOOR tile on the parent grid, and
    copies the `<script>` tag to the clipboard for `index.html` paste.
18. ✅ **Pass 5d — Agent feedback closeouts (shipped 2026-04-15, Track C).** All five blockers
    closed: `--dry-run` (C1), `bo ingest`/`bo emit` (C2), `bo help` (C3), biome stamps (C4),
    IIFE-aware `render-ascii` (C5). Stretch `bo validate` expanded checklist shipped as C6
    (door-no-target, room-has-walls, offset-no-height). See `tools/short-roadmap.md`.
19. **Pass 5b — World graph editor (portal port).** ✅ All phases (5b.0–5b.5) shipped 2026-04-16.
    Vendored jsPlumb 2.15.6; `js/world-designer.js` (~1500 lines) renders 21 floors + edges +
    ghost/pending nodes with full edit mode, agent API, biome tinting, subgraph zoom, PNG export.
    `bv-bo-world.js` adds `exportWorldGraph` + `applyWorldDiff` with transaction/rollback.
    `cli/commands-world.js` mirrors both as CLI commands. **Pass 5b complete.**
20. 🟡 **Pass 6 — Procedural generation.** Phase 6.1 shipped 2026-04-16: recipe schema, BSP
    generator (`tools/procgen.js`), three strategy archetypes (cobweb/combat/pressure-wash),
    three starter recipes, CLI `bo procgen`/`bo list-recipes`, browser `procgen` BO action.
    Phase 6.3 shipped 2026-04-17: recipe node UI in world designer (teal nodes, form modal,
    inspector, expand/edit/discard lifecycle, sessionStorage persistence). Recipe schema also
    extended with `fetch` strategy + `timer` knobs (DOC-113).
    Next: Phase 6.2 (strategy formula tuning), 6.4 (live preview + analytics, stretch).

**Recommended next step:** ✅ **Done (2026-04-14).** The save patcher (`tools/js/bv-save-patcher.js`)
now rewrites `spawn:` and `doorTargets:` inside the `registerFloorBuilder` block in addition to the
grid. `patchSpawnInSource` targets the `var SPAWN = { x, y, dir };` literal; `patchDoorTargetsInSource`
handles both the inline `doorTargets: { ... }` object on the builder return and the scaffold
`var DOOR_TARGETS = { ... };` form, preserving single-quoted JS-string convention and sorting keys by
(y, x) for stable diffs. All three patches are chained in `prepareSaveCurrentFloor` so Meta-panel edits
(spawn position/direction, door destinations) now persist on Ctrl+S without clipboard-paste. Verified
via `outputs/patcher_sim.js` with four cases: inline doorTargets, scaffold var, missing blocks (no-op),
and full chain + VM parse.

**Next recommended step:** Phase 6.2 — strategy formula tuning, or DOC-113 Phase A (fetch
strategy decorator). Phase 6.3 (recipe node UI) shipped 2026-04-17, so the tooling chrome is
complete. Two parallel tracks are now open:

- **Phase 6.2** — refine the three existing strategy decorators (cobweb corridor-length
  distribution, pressure-wash loop circumference, combat room aspect ratios). Iterative loop:
  generate → play → adjust knobs → regenerate.
- **DOC-113 Phase A** — implement the fourth strategy decorator (`_applyFetchStrategy` in
  `tools/procgen.js`): BSP tree maze with zero extra connections, dead-end decoys, objective at
  deepest leaf, secondary exit in non-critical-path leaf room. The recipe schema knobs (`timer`,
  `entities.decoyCount`, `entities.secondaryExit`) are already in place.

Either can proceed independently. Phase A unlocks the sprint dungeon game loop (Phases B–E).

**Also open (lower priority):**
- Pass 0.6 — file-size budget CI check (tracked tech debt, low urgency).
- Pass 5a stretch — `gitSnapshot` / `gitDiff` (deferred, not blocking).
- Tier 4 — window-scene engine consumption (raycaster reads `sceneGrid`).
- Tier 2 — heatmaps (distance from spawn, lighting coverage).
- Tier 3 polish — rooms array editor, biome picker, save-patcher for full metadata.
- Tier 4 — tile height offset editor (1–2 days when needed).
- Quest system — DOC-107 Phases 2–4 (see `docs/QUEST_SYSTEM_ROADMAP.md`).
- Sprint dungeon runtime — DOC-113 Phases B–E: quest data, timer runtime, hero pursuit, polish.
- Phase 6.3 deferred items — `procgenPreview` thumbnail (multi-floor expansion shipped 2026-04-17).

Items that are probably **never worth it** for DG's scope: collaborative editing, history tree
with branching, customizable shortcuts. A small team building one game doesn't need those.

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

## Resolved decisions (April 2026 planning session)

These were the open questions from the original roadmap. Decisions recorded here for reference.

### 1. Layered grid format vs. flat grid with synthesized layers

**Decision: Keep flat `grid[y][x]`, synthesize layers at display time.**

The entire engine is built around `grid[y][x]` as a single tile-ID. The raycaster, `FloorManager`,
`extract-floors.js`, the `_testGetBuilders()` pipeline, `SpatialContract`, `Lighting`, `Minimap` —
everything indexes into a flat 2D array. Design Principle #2 says *"The grid literal is the source
of truth."*

The tile system already encodes enough category information to synthesize layers: `isDoor()`,
`isFloating()`, `isFreeform()`, `isCrenellated()`, `isWindow()`, `isTorch()`. The visualizer builds
a `categoryOf(tileId)` function from the Phase 3 schema extraction and renders virtual layers as
view-only overlays with per-layer visibility/opacity/lock toggles.

The one limitation — inability to stack (e.g. torch ON a wall) — is already solved by the engine's
approach: wall tiles are opaque and torches are separate adjacent tiles. The engine doesn't stack
tiles in the same cell; the editor shouldn't pretend it does.

### 2. Entity placement: grid meta-tiles vs. parallel array

**Decision: Parallel entities array, separate from the grid.**

Entities are already completely separate from the grid in the engine:
- `EnemyAI.spawn()` / `EnemyAI.spawnEnemies()` places enemies at runtime
- `WorldItems.placeFloorItems()` places collectibles at runtime
- `npc-system.js` manages NPCs with their own position/state
- `CorpseRegistry`, `CobwebSystem`, `TorchState`, `BonfireSprites`, `DumpTruckSpawner` — all
  runtime overlay systems

Grid tiles like SPAWN, SHOP, BONFIRE, CHEST are markers that tell the engine "an entity system
should do something here." The actual entities (which NPC, what loot table, which enemy card ID)
are metadata that doesn't fit in a single integer tile ID.

The editor introduces a lightweight `entities` array alongside the grid in `floor-data.json`.
This is additive — it doesn't touch the existing grid format. The visualizer renders entities as
an overlay layer (one of the synthesized layers from Decision #1).

### 3. Mini raycast engine vs. sibling iframe

**Decision: Sibling iframe first, mini raycast deferred to Tier 3+.**

The full raycaster is deeply coupled to `SpatialContract`, `TextureAtlas`, `DoorSprites`,
`WindowSprites`, `Lighting`, `Skybox`, `arch-peek.js`, freeform rendering, floating tile passes,
crenel silhouettes. Bundling a mini version that handles all of this correctly would be a multi-week
project that drifts from the real engine's output.

A sibling iframe approach:
- Point at `index.html?floor=<id>&camera=<x>,<y>,<dir>&editor=true`
- Add a minimal `editor=true` query-param mode that skips splash/title, loads the target floor,
  positions the camera, and disables gameplay
- The editor sends `postMessage` updates when the grid changes; the iframe re-renders
- The designer sees the *exact* rendered output, not an approximation

This aligns with Design Principles #3 and #1. The Tier 3 mini raycast comes later as a lightweight
~200×150 preview for quick feedback without the iframe's full load time.

### 4. Undo across floor switches

**Decision: Per-floor undo stacks keyed by floor ID, preserved across switches.**

Maintain a `Map<floorId, undoStack[]>` instead of a single global stack. On floor switch, park the
current stack under the outgoing floor ID, restore the incoming floor's stack. Each stack has a
configurable max depth (e.g. 200 operations) to bound memory. Named checkpoints (from Tier 1
History) are per-floor as well.

Cross-floor operations (e.g. editing a `doorTarget` that affects two floors) record an entry in
both stacks with a shared operation ID, so undoing on either floor undoes both halves.

### 5. Parse cards.json + strings/en.js during schema extraction

**Decision: Yes — emit as three separate schema sections.**

Phase 3 schema extraction will:
1. Parse `tiles.js` → tile schema with all predicates (mandatory, loaded immediately)
2. Parse `cards.json` → card manifest with id, name, emoji, rarity, type (lazy-loaded enrichment)
3. Parse `strings/en.js` → string index for entity/shop/NPC display name resolution (lazy-loaded)

Three separate keys in `floor-data.json` (or split files) so the visualizer can load tiles-only
for the basic editor and lazy-load cards + strings when entity/metadata panels open.

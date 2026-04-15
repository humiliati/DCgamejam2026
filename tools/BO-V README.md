# Blockout Visualizer

Canvas-based map editor for Dungeon Gleaner's ASCII blockout grids.
Loads floor data from `floor-data.json` (extracted by `extract-floors.js`)
and renders the post-builder grid — what the player actually sees.

Current version: **v0.14** (April 2026). Full Tier 1 drawing + selection +
history, Tier 2 direct file write **and validation** (walkability, door
contracts, spawn, required tiles) — `Ctrl+S` now patches **`GRID`,
`SPAWN`, and `doorTargets`** in one pass, **Tier 3 per-floor metadata
editor** (spawn drag-place, door target dropdowns, JSON snippet export),
a Tier 4 window-scene editor first pass, a built-in **help modal**
(`?` / F1) with 8 tabs, and **Tier 6 Passes 1 + 2 + 3 + 4** —
the headless `window.BO.run({action,…})` command surface, the matching
`tools/blockout-cli.js` Node wrapper, the perception toolkit
(`renderAscii`, `diffAscii`, `describeCell`, `reportValidation`,
`captureFloor`), **tile semantic lookup** (`tile`, `tileName`,
`tileSchema`, `findTiles`) so agents can resolve tile names without
rummaging through `tile-schema.json` by hand, and now a **stamp
library** — parametric stamps (`stampRoom`, `stampCorridor`,
`stampTorchRing`) plus a named registry (`saveStamp`, `applyStamp`,
`listStamps`, `deleteStamp`, `exportStamps`, `importStamps`) with a
`tools/stamps.json` sidecar for cross-session reuse and CLI/browser
interop. See
`BLOCKOUT_VISUALIZER_ROADMAPv2.md` for the full feature plan and
`tools/short-roadmap.md` for the active pass ordering.

## What this tool is / isn't

**Is:** a grid-cutting editor for *existing* floor blockouts. Load a
floor → paint / rect / line / bucket / lasso / stamp → validate → save
back to `engine/floor-blockout-<id>.js`. Same flow works for a delegated
engineer at the mouse and for an AI agent via `window.BO.run({...})` or
`tools/blockout-cli.js`.

**Is also:** the edit surface for spawn and door-target metadata. The
Meta panel (`M`) plus `Ctrl+S` is the canonical way to fix
`door-target-missing` / `no-return-door` issues that validation surfaces.

**Isn't:** a world-designer. Creating a brand-new floor — picking a
biome, wiring the new node into the floor-ID tree, fixing which doors
on which neighbors point at it — belongs in the **world-designer** tool
(upstream of BO-V). The planned handoff: world-designer births a floor
node with biome defaults, dimensions, pre-stamped required tiles, and
pinned door targets, then opens BO-V on that seeded grid so the
designer (or agent) can just cut the layout. Until that handoff lands,
use the "Workflow: creating a new floor" section below as a manual
stop-gap.

**Also isn't:** a level-logic editor. Enemy placement, loot tables,
card drops, quest wiring, NPC dialogue all live in their own data
files. BO-V only owns the tile grid + spawn + doorTargets.

## Quick start

```
cd <project-root>
node tools/extract-floors.js         # rebuilds tools/*.json side-cars
python -m http.server 8080           # serve locally (fetch needs HTTP)
```
Open `http://localhost:8080/tools/blockout-visualizer.html`.

If the side-cars are missing, the visualizer falls back to an embedded
legacy schema and shows a warning.

### What `extract-floors.js` emits

| File | Contents |
|------|----------|
| `tools/floor-data.json` | Every floor's post-builder grid + metadata (rooms, doors, doorTargets, spawn, biome) |
| `tools/tile-schema.json` | All 84 tiles with name, color, glyph, category, walkability, opacity, and predicates (`isDoor`, `isFreeform`, `isWindow`, `isTorch`, `isFloating`, etc.) |
| `tools/card-manifest.json` | 120 cards, bucketed by suit |
| `tools/enemy-manifest.json` | 27 enemies |
| `tools/string-index.json` | 243 strings across 27 namespaces |

Re-run it any time `engine/tiles.js`, `data/cards.json`, `data/enemies.json`,
or `data/strings/en.js` change. Re-running is also how new tiles appear in
the picker — there is no hardcoded tile list in the editor anymore.

## View controls

| Action | Input |
|--------|-------|
| Pan | Left-click drag (view mode), Shift+drag (edit mode), middle-click drag |
| Zoom | Scroll wheel (zooms toward cursor) |
| Fit to screen | `F` key |
| Toggle grid lines | `G` key |
| Toggle room overlays | `R` key (view mode) |
| Toggle door overlays | `D` key |
| Toggle tile IDs / glyphs | `I` key |
| Toggle legend panel | `L` key (view mode only) |
| Open help modal | `?` or `F1` (also the `?` button on the toolbar) |

The floor selector dropdown lists every extracted floor, indented by depth.
Exterior floors (`"0"`, `"1"`, `"2"`) are top-level; interiors (`"1.1"`,
`"2.2"`) are indented one level; dungeons (`"2.2.1"`) two levels.

## Editing

Press `E` (or click **Edit**) to toggle edit mode. The toolbar exposes tool
buttons, the brush-size picker, undo/redo, save, the dirty-count display,
and the copy/paste clipboard badge. A tile picker bar appears at the bottom
of the canvas with every tile grouped by category.

### Tools

Switch tools via the toolbar buttons or keyboard:

| Tool | Shortcut | Behavior |
|------|----------|----------|
| Paint | `P` | Click / drag to paint single cells with the current brush. Stroke = one undo step. |
| Rectangle | `R` | Drag to fill a rect. Hold `Shift` for outline-only. |
| Line | `N` | Drag for a Bresenham line (5000-cell cap). |
| Bucket (flood fill) | `F` | Fill all 4-connected same-tile cells. |
| Replace-all | `X` | Click a cell — every instance of that tile ID on the floor becomes the paint tile. |
| Lasso (select) | `L` in edit mode | Drag rect → select. Drag inside = move. Enter/Esc commit/cancel. |
| Paste | `V` | Shows a green ghost of the clipboard at the cursor; click to stamp. |

Every tool funnels into a single bulk undo entry per gesture.

### Brush sizes

`1×1`, `2×2`, `3×3`, `5×5` squares. Cycle with `[` and `]` or click the
brush picker. Brush size affects Paint, Rectangle, and Line.

### Quick-select tiles

Number keys `0–9` map to frequently-used tiles while in edit mode:

```
0 → EMPTY (0)       5 → ROAD (32)
1 → WALL (1)        6 → PATH (33)
2 → DOOR (2)        7 → GRASS (34)
3 → TREE (21)       8 → FENCE (35)
4 → SHRUB (22)      9 → PILLAR (10)
```

Right-click any cell to eyedropper-pick its tile into the brush.

### Selection & clipboard

The lasso tool has a persistent **in-memory clipboard** shared across
tools and across floors:

| Action | Input |
|--------|-------|
| Copy selection | `Ctrl+C` |
| Cut selection (fills with resize-fill tile) | `Ctrl+X` |
| Paste at cursor | `Ctrl+V` or `V` |
| Commit / cancel floating selection | `Enter` / `Esc` |

The clipboard **survives floor switches**. A badge next to the brush
picker shows the clipboard contents as a mini thumbnail + `W×H "floorId"`.
The badge turns amber when the source floor differs from the current
floor. Clicking the badge jumps back to the source floor.

Cross-floor paste is the primary workflow for building window-scene
exteriors — copy part of the parent exterior, switch to the interior, and
stamp it into the window-scene sub-grid (see the window-scene editor
below).

### History

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` or the Undo button |
| Redo | `Ctrl+Shift+Z` / `Ctrl+Y` or the Redo button |
| Revert all changes on this floor | Revert button (with confirmation) |

Each floor has its own undo / redo stack. Switching floors parks the
outgoing stacks under the floor id and restores the incoming floor's
history. Pasting on floor B does not pollute floor A's history.

### Grid resize

A resize bar appears under the toolbar in edit mode:

| Button | Effect |
|--------|--------|
| `-L` / `+L` | Remove / add column on the left |
| `+R` / `-R` | Add / remove column on the right |
| `-T` / `+T` | Remove / add row on top |
| `+B` / `-B` | Add / remove row on the bottom |

The **Fill tile** dropdown sets what new cells contain. Each resize is one
undo step.

## Saving

### Direct file write (preferred)

| Action | Shortcut |
|--------|----------|
| Save current floor | `Ctrl+S` or the Save button |

The first save prompts you to pick your `engine/` directory via the File
System Access API. The editor then reads the current
`floor-blockout-<id>.js` and patches three regions via regex:

- the `var GRID = [...]` literal (plus `W`/`H` if dimensions changed),
- the `SPAWN = { x, y }` block (if the Meta panel moved spawn),
- the `doorTargets` map inside the registered builder (if any door
  target row changed — including the `(fallback)` delete case).

Everything else — `ROOMS`, `build()` body, auxiliary consts, comments,
`registerFloorBuilder` wiring — is preserved byte-for-byte. A
color-coded unified diff renders in a modal before writing with three
exit paths: **Cancel**, **Download instead**, **Write to file**.

On `file://` or in browsers that don't support the File System Access API,
the editor falls back to a Blob download of the patched file.

After a successful save, the dirty counter resets without clearing the
undo chain, so you can keep iterating.

### Clipboard export (legacy)

Still available in the toolbar:

- **Copy Full** — the whole grid as a JS array literal, ready to paste
  into a floor builder.
- **Copy Diff** — only changed cells; unchanged cells render as `..` and
  unchanged rows collapse to a comment. Good for code review.

## Overlays

| Overlay | Toggle | Look |
|---------|--------|------|
| Room boxes | `R` (view mode) | Yellow dashed rectangles with optional center marker |
| Door targets | `D` | Red diamonds labeled with destination floor |
| Spawn marker | always on | Magenta circle |
| Entry / exit / stairs | always on | Colored borders from the floor's `doors` object |
| Dirty cells | always on in edit mode | Red border on any cell that differs from the loaded grid |
| Tile IDs / glyphs | `I` | Per-cell text overlay |
| Legend panel | `L` (view mode) | Swatch + name list, click to set paint tile |

## Tooltip

Hover any cell to see tile name, ID, category, walkability, opacity, room
membership, door target, and exterior-face direction. In edit mode,
modified cells also show the original tile they replaced.

## Window-scene editor (Tier 4)

When the current floor contains any window-like tile (any tile with the
`isWindow` predicate, plus `PORTHOLE` and `ARCH_DOORWAY`), a **Windows**
panel appears in the top-left of the canvas. Each row shows a tile swatch,
the window's `(x, y)` coordinates, and the tile name. A green `●`
indicates a scene has already been authored for that window.

Click any row to open the **scene editor modal**:

- An 8×6 sub-grid canvas (resizable to any dimensions from 1 to 24)
  representing what's visible beyond that window.
- **Paint / right-click erase** using the main editor's current brush tile
  — no separate picker; change brushes in the main toolbar.
- **W− W+ H− H+** buttons to resize the scene (preserves existing tiles,
  pads with EMPTY).
- **Jump to parent floor** — switches the main view to the inferred
  parent (e.g. `"1.1"` → `"1"`) while keeping the scene modal bound. Lasso
  + `Ctrl+C` on the parent, then return (re-click the window row) and
  **Stamp clipboard at (0,0)** to paste the region into the sub-grid.
- **Clear scene** — reset all cells to EMPTY.
- **Download window-scenes.json** — dumps every scene across every floor
  as a sidecar JSON with `{floorId, at, tileId, parentFloorId, w, h,
  tiles}` per entry. The engine does not yet consume this file; the
  sidecar is the designer-facing export until raycaster support lands.

Scenes currently live in memory only (lost on reload). Re-import is
planned.

## Validation

Press the **Validate** button in the toolbar (or it turns red/amber after
a run to flag severity). The modal offers two tabs:

- **Current floor** — runs all per-floor checks against the floor in view.
- **All floors** — runs per-floor checks against every floor in
  `floor-data.json` plus cross-floor referential checks.

Per-floor checks:

| Check | Severity | What it catches |
|-------|----------|-----------------|
| `spawn-missing` | err | Floor has no `spawn` (and isn't floor `"0"`'s legacy fallback) |
| `spawn-oob` | err | Spawn coords fall outside the grid dimensions |
| `spawn-blocked` | err | Spawn lands on a non-walkable tile |
| `unreachable` | warn | Walkable cells that a BFS from spawn can't reach (grouped) |
| `door-fallback` | info | Door tile has no explicit `doorTargets` entry (engine uses parent/child convention) |
| `exterior-no-entry` | warn | Depth-1 exterior floor has no ARCH_DOORWAY or door tile |

Cross-floor checks:

| Check | Severity | What it catches |
|-------|----------|-----------------|
| `door-target-missing` | err | `doorTargets` entry points to a floor that isn't in `FLOORS` |
| `no-return-door` | warn | Target floor has no door tiles — one-way transition |

Results are sorted by severity then floor. Click any row to jump the
camera to the flagged cell and paint a red/amber/blue border over the
issue region; the first cell also pulses with a translucent fill.
`Esc` or the **Close** button clears the overlay.

## Metadata editor (Tier 3)

Press the **Meta** button (or `M`) to toggle the metadata panel on the
top-right of the canvas. The panel lists:

- **Spawn** — current `(x, y)` coords plus a **Move** button. Clicking
  **Move** arms spawn placement mode; the cursor switches to crosshair
  and your next click anywhere on the grid sets the new spawn.
- **Door targets** — one row per door-like tile on the floor with a
  target-floor dropdown. `(fallback)` at the top of the list deletes
  the explicit entry so the engine falls back to parent/child
  convention. `→` button next to each row centers the camera on that
  door.

Every metadata edit (spawn move, door target change) pushes onto the
existing per-floor undo stack with a new `type: 'meta'` entry, so
`Ctrl+Z` / `Ctrl+Shift+Z` roll back spawn and door-target changes the
same way as paint operations.

Panel actions:

| Button | Effect |
|--------|--------|
| **Copy meta JSON** | Copies `{floorId, spawn, doorTargets}` as JSON to the clipboard — useful for reviews, diffs, or pasting into a non-standard builder shape. `Ctrl+S` already rewrites `SPAWN` and `doorTargets` in `engine/floor-blockout-*.js` directly, so the manual paste is no longer the default path. |
| **Revert meta** | Re-fetches `floor-data.json` and restores this floor's spawn + doorTargets to disk state. Grid edits are NOT affected. |

A dirty indicator (`●`) appears in the panel header when any unsaved
metadata edits exist on the current floor. Switching floors preserves
edits in memory — the per-floor dirty count persists until revert or a
full reload.

**Workflow for door-target fixes flagged by validation:**

1. Run **Validate** — a `door-target-missing` or `no-return-door` issue
   surfaces in the report.
2. Click the row to jump to the door cell.
3. Press `M` to open the metadata panel; the door is listed with its
   current (broken) target.
4. Pick the correct floor from the dropdown.
5. `Ctrl+S` — the save diff shows the `doorTargets` block patch alongside
   any grid edits. Confirm and write.

(Legacy path: **Copy meta JSON** → paste into the floor's
`registerFloorBuilder` entry — still works for non-standard shapes.)

## In-tool help

Click the **`?`** button in the toolbar (or press `?` / `F1`) for the
built-in help modal. Eight tabs, each mirroring a section of this
README:

| Tab | Contents |
|-----|----------|
| Controls | Pan / zoom / tool shortcuts / brush sizes / quick-select tiles |
| Overlays | Room, door, dirty, legend, tile-ID toggles |
| Save | `Ctrl+S` flow, what the patcher rewrites, fallback download |
| Validate | Per-floor + cross-floor checks, severity colors |
| Meta | Spawn drag-place, door-target dropdown, dirty indicator |
| Agent API | `window.BO.run`, perception tools, stamp library cheat sheet |
| Workflows | Edit-existing / author-window-scene / fix-door-targets |
| New floor | The planned world-designer → BO-V seed-payload handoff |

Close with **Close**, `Esc`, or click outside the modal. The modal is
keyboard-dismissable even while edit mode is active; typing into any
input/textarea swallows the `?` shortcut so it doesn't collide with
tile-picker search or rename fields.

The info bar at the bottom of the window also shows a live **Dirty:**
cell that mirrors the toolbar's edit-count (red when dirty, grey when
clean) and a persistent "Press ? for help" hint pinned to the right
edge.

## Agent API (Tier 6 Pass 1)

The visualizer exposes a headless command router so an AI agent
(Claude-in-Chrome, Puppeteer, etc.) can drive it without a human at
the mouse. Every action maps one-to-one to an existing editor
primitive, so agent edits land in the same undo stack, validation
loop, and dirty-count display as human edits.

### In-page: `window.BO.run({ action, ... })`

Returns `{ ok, action, result }` on success or `{ ok:false, error, action }`
on failure. Any command accepts an optional `postValidate:'current'|'all'`
that appends a validation report to the response.

```js
// Inspect state
window.BO.actions
// → ['describe','floodFill','getFloor','listFloors','paint','paintLine',
//    'paintRect','redo','replaceAllOfType','resize','save','selectFloor',
//    'setDoorTarget','setSpawn','stampClipboard','undo','validate']

window.BO.run({ action:'listFloors' })
window.BO.run({ action:'selectFloor', floor:'1.3.1' })
window.BO.run({ action:'paintRect', at:{x:2,y:2}, size:{w:4,h:3}, tile:'WALL' })
window.BO.run({ action:'paintLine', from:{x:0,y:0}, to:{x:9,y:9}, tile:'PATH' })
window.BO.run({ action:'floodFill', at:{x:5,y:5}, tile:'GRASS' })
window.BO.run({ action:'setSpawn', at:{x:4,y:8} })
window.BO.run({ action:'setDoorTarget', at:{x:12,y:4}, target:'2.2.1' })
window.BO.run({ action:'validate', scope:'all' })

// Optional post-validation piggyback:
window.BO.run({ action:'paintRect', at:{x:0,y:0}, size:{w:1,h:1},
                tile:'DOOR', postValidate:'current' })
```

Tile references accept either numeric IDs or case-insensitive schema
names (`'WALL'`, `'DOOR'`, `'ROAD'` …). Any missing `floor` field
targets the currently-loaded floor.

### Perception tools (Pass 2)

Agents without vision need text-shaped observations. Every mutation
action can be paired with one of these to verify the result.

```js
// Render the floor as ASCII glyphs with a reverse-lookup legend.
window.BO.run({ action:'renderAscii', floor:'1.3.1',
                viewport:{x:0,y:0,w:40,h:20} })
// → { glyphs:'#####\n#...#\n...', legend:[{glyph:'#',tileId:1,name:'WALL'},...] }

// Compare the current grid to a prior snapshot.
var before = window.BO.run({ action:'getFloor', floor:'1.3.1' }).result;
// ...make edits...
window.BO.run({ action:'diffAscii', floor:'1.3.1', before: before })
// → { diff:'...D..\n.....', changes:[{x:3,y:0,before:0,after:2}], changeCount:1 }

// Tooltip payload for a specific cell.
window.BO.run({ action:'describeCell', floor:'1.3.1', at:{x:5,y:5} })
// → { tileId, name, glyph, walk, opaque, doorTarget, exteriorFace,
//     rooms:[...], isSpawn, wasTile:{...}|null }

// Validation report without opening the modal.
window.BO.run({ action:'reportValidation', scope:'all' })

// base64 PNG for vision-capable agents.
window.BO.run({ action:'captureFloor', floor:'1.3.1' })
// → { dataUrl:'data:image/png;base64,...', width, height, format }
```

### Tile semantic lookup (Pass 3)

Agents don't need to memorize tile IDs. Every paint/mutation action
already accepts a name, but these helpers expose the schema directly —
useful for "what are all the doors?" or "what category is tile 27?"
style queries.

```js
// Name → id (or id → id if it's already numeric). Throws on unknown.
window.BO.tile('WALL')                // → 1
window.BO.run({ action:'tile', name:'WALL' })   // → { ok:true, result:1 }

// id → canonical name.
window.BO.tileName(1)                 // → 'WALL'

// Full schema entry (id + all flags).
window.BO.tileSchema('WALL')
// → { id:1, name:'WALL', category:'structure', glyph:'#', walk:false,
//     opq:true, isDoor:false, ... }
window.BO.tileSchema()                // → entire table as sorted array

// Filter tiles by predicate. AND semantics; omit a field to ignore it.
window.BO.findTiles({ isDoor: true })
// → [{id:2,name:'DOOR',...}, {id:3,name:'DOOR_BACK',...}, ...]

window.BO.findTiles({ category:'light', walk:false })
window.BO.findTiles({ name:'/TORCH/' })    // regex name match
window.BO.findTiles({ name:'WINDOW', isOpaque:false })
```

Supported filters: `name` (substring or `/regex/flags`), `category` /
`cat`, `glyph`, `walk`, `opaque`, `hazard`, `isDoor`, `isFreeform`,
`isFloating`, `isCrenellated`, `isFloatingMoss`, `isFloatingLid`,
`isFloatingBackFace`, `isWindow`, `isTorch`.

### Stamp library (Pass 4)

Two layers: **parametric stamps** generate geometry from parameters,
and a **named stamp registry** persists freeform grid slices for
reuse. All mutations flow through the normal heterogeneous-bulk undo
(`{type:'bulk', cells:[...], newTile:null}`) so Ctrl+Z rolls the whole
stamp back in one step.

```js
// Parametric stamps — walls + floor interior, corridor between two
// points, or a ring of torches around a center.
window.BO.run({ action:'stampRoom', at:{x:4,y:4}, size:{x:6,y:5},
                wallTile:'WALL', floorTile:0 })
window.BO.run({ action:'stampCorridor', from:{x:2,y:2}, to:{x:18,y:10},
                width:2, floorTile:0, wallTile:'WALL' })
window.BO.run({ action:'stampTorchRing', at:{x:10,y:10}, radius:3,
                step:2, torchTile:'TORCH_LIT' })

// Named registry — capture a rectangle and re-apply with rotate/flip.
window.BO.run({ action:'saveStamp', name:'shrine',
                at:{x:4,y:4}, size:{x:6,y:5} })
window.BO.listStamps()
// → [{ name:'shrine', w:6, h:5, sourceFloor:'1.3.1' }]
window.BO.run({ action:'applyStamp', name:'shrine',
                at:{x:20,y:12}, rotate:90, flipH:false })
window.BO.run({ action:'deleteStamp', name:'shrine' })

// Cross-session interop — export/import the registry as JSON.
var dump = window.BO.exportStamps()
window.BO.importStamps(dump, { merge:true })
```

In-browser stamps live in memory for the page session. The CLI
persists them to `tools/stamps.json`; use `exportStamps` /
`importStamps` to round-trip between browser and CLI.

### Node CLI: `tools/blockout-cli.js`

The same action vocabulary, but mutating `tools/floor-data.json`
directly. Useful for batch edits, CI scripts, and agents that can't
keep a browser open.

```
node tools/blockout-cli.js list-floors
node tools/blockout-cli.js paint-rect --floor 2.1 --at 5,5 --size 3x3 --tile WALL
node tools/blockout-cli.js paint-line --floor 1 --from 0,0 --to 9,9 --tile PATH
node tools/blockout-cli.js flood-fill --floor 1 --at 5,5 --tile GRASS
node tools/blockout-cli.js set-spawn  --floor 1.3.1 --at 4,8
node tools/blockout-cli.js set-door-target --floor 2.2 --at 12,4 --target 2.2.1
node tools/blockout-cli.js validate --scope all --out report.json
node tools/blockout-cli.js describe

# Pass 2 — perception tools (no mutation):
node tools/blockout-cli.js render-ascii  --floor 1.3.1 --viewport 0,0,40x20
node tools/blockout-cli.js describe-cell --floor 1.3.1 --at 5,5
node tools/blockout-cli.js diff-ascii    --floor 1.3.1 --before snapshot.json
node tools/blockout-cli.js report-validation --scope all

# Pass 3 — tile semantic lookup (no mutation):
node tools/blockout-cli.js tile         --name WALL          # → 1
node tools/blockout-cli.js tile-name    --id 1               # → WALL
node tools/blockout-cli.js tile-schema  --name WALL          # → {id,name,glyph,...}
node tools/blockout-cli.js find-tiles   --isDoor true
node tools/blockout-cli.js find-tiles   --name '/TORCH/'
node tools/blockout-cli.js find-tiles   --category light --walk false

# Pass 4 — stamps (mutates floor-data.json; registry in tools/stamps.json):
node tools/blockout-cli.js stamp-room      --floor 2.2.1 --at 2,2  --size 6x5 \
                                           --wall-tile WALL --floor-tile 0
node tools/blockout-cli.js stamp-corridor  --floor 1     --from 2,2 --to 18,10 \
                                           --width 2 --floor-tile 0 --wall-tile WALL
node tools/blockout-cli.js stamp-torch-ring --floor 2.2.1 --at 10,10 --radius 3 --step 2
node tools/blockout-cli.js save-stamp      --floor 2.2.1 --name shrine --at 2,2 --size 6x5
node tools/blockout-cli.js list-stamps
node tools/blockout-cli.js apply-stamp     --floor 2.2.2 --name shrine --at 10,10 \
                                           --rotate 90 --flip-h
node tools/blockout-cli.js delete-stamp    --name shrine
```

Every command prints a JSON result to stdout. `validate` exits 2 if
any `err`-severity issues are found.

Limitation: the CLI does NOT rewrite `engine/floor-blockout-*.js`
(that requires the browser's File System Access API). Use
`window.BO.run({action:'save'})` or the visualizer's Save button for
the round-trip back to engine source.

## Dev helpers

Open the browser console while the visualizer is running:

```js
__clipboardSmokeTest('1', '1.3.1')   // copy on floor 1, paste on 1.3.1, undo
__windowSceneSmokeTest('1')          // list all window tiles on floor 1
__validateSmokeTest('all')           // run all-floors validation, log top 8
__metaSmokeTest()                    // list doors + spawn for current floor
__boSmokeTest('1.3.1')               // selectFloor + paintRect + validate + undo roundtrip
```

## Workflows for AI agents

Three canonical entry points, matching the tool's three execution
modes. Pick the one that fits the agent's environment:

| Mode | Entry point | When to use |
|------|-------------|-------------|
| In-browser (DOM access) | `window.BO.run({action, ...})` | The agent drives the live editor (Claude-in-Chrome, Puppeteer, browser extension). Edits land in the real undo stack; `Ctrl+S` or `{action:'save'}` writes back to `engine/`. |
| Headless Node | `tools/blockout-cli.js <action> [flags]` | Batch edits, CI scripts, agents without a browser. Mutates `tools/floor-data.json` and the stamp registry at `tools/stamps.json`. Cannot rewrite `engine/floor-blockout-*.js` — round-trip via the browser. |
| Perception-only | `renderAscii` / `diffAscii` / `describeCell` / `reportValidation` / `captureFloor` | Before every mutation, agents without vision should snapshot with `getFloor`, make an edit, then `diffAscii` against the snapshot to verify. Pair with `reportValidation` to catch broken door targets + unreachable walkable regions. |

**Recommended loop for a delegated slice** (e.g. "rebuild floor 2 to
48×32" or "wire door at (5,3) to floor 2.2.2"):

1. `listFloors` → confirm the target floor exists and matches the
   planned ID.
2. `getFloor` → snapshot. Keep the result — it's the `before:` for
   `diffAscii`.
3. `renderAscii` with a modest viewport → read what's actually on disk
   today.
4. Plan edits against the tile schema via `findTiles({isDoor:true})` /
   `tileSchema('WALL')` — never hardcode numeric tile IDs in agent
   scripts.
5. Mutate via `paintRect` / `paintLine` / `floodFill` / `stampRoom` /
   `applyStamp` / `setSpawn` / `setDoorTarget`. Every mutation is one
   undo step.
6. `diffAscii` against the snapshot → confirm the change matches
   intent.
7. `reportValidation` (or append `postValidate:'current'` to the last
   mutation) → must be clean of `err`-severity issues before save.
8. `{action:'save'}` (browser only) or hand off to a human for the
   File-System-Access-API save.

See the help modal's **Agent API** and **Workflows** tabs for the
short-form version.

## Workflow: editing an existing floor

1. Run `node tools/extract-floors.js` to refresh the side-cars
2. Open the visualizer, select the floor
3. Press `E` to enter edit mode
4. Paint / rect / line / bucket / lasso / replace as needed
5. `Ctrl+S` → pick your `engine/` dir (first time only) → confirm diff →
   Write to file
6. Re-run the game — the change is live

For code review of larger edits, **Copy Diff** still works and shows a
compact per-cell delta.

## Workflow: creating a new floor

**Planned model (post world-designer):** floor birth happens in the
world-designer — pick the node in the floor-ID tree, pick a biome, pin
which neighbor doors target it, set dimensions from the biome defaults.
World-designer scaffolds `engine/floor-blockout-<id>.js` with the
required tiles pre-stamped (entry door, spawn, the pinned doorTargets
entries) and opens BO-V on the seeded grid. BO-V's job is then just to
cut the layout.

**Manual stop-gap** until that handoff ships (use this for Floor 2
rebuild, Floor 3 creation, and any one-offs):

1. Pick an existing floor of similar size as a starting point
2. Use the resize controls to adjust dimensions
3. Paint / lasso / bucket / stamp the new layout
4. Set spawn and pin door targets via the Meta panel (`M`)
5. **Copy Full** → paste into a new `floor-blockout-*.js` file
6. Register with `FloorManager.registerFloorBuilder('ID', builderFn)`
7. Add the `<script>` tag to `index.html` at the correct layer
8. Re-run `extract-floors.js` so the new floor appears in the
   visualizer dropdown next time
9. Re-open BO-V on the new floor and run **Validate → All floors** to
   catch broken cross-references in neighbors

See `tools/short-roadmap.md` for the pass that will promote step 5-8
into the world-designer seed-payload flow.

## Workflow: authoring a window scene

1. Select the interior floor that has windows (depth 2, e.g. `"1.1"` Coral
   Bazaar)
2. Click any row in the **Windows** panel to open the scene editor
3. Click **Jump to parent floor** — lands on `"1"` The Promenade
4. Press `L` for lasso, drag a selection over the street/buildings visible
   from that window, `Ctrl+C`
5. Re-click the same window row (the panel reappears on the parent since
   the parent has facades as windows too — or navigate back to the
   interior and re-click)
6. Click **Stamp clipboard at (0,0)**
7. Paint over any cells that need adjustment
8. Click **Download window-scenes.json** to export

## File structure

```
tools/
  blockout-visualizer.html         — the editor (this tool)
  BO-V README.md                   — this file
  BLOCKOUT_VISUALIZER_ROADMAPv2.md — feature roadmap
  extract-floors.js                — Node script that rebuilds the side-cars
  blockout-cli.js                  — Node CLI for agent-driven edits (Tier 6 Pass 1)
  floor-data.json                  — every floor's post-builder grid
  tile-schema.json                 — 84 tiles with predicates
  card-manifest.json               — 120 cards
  enemy-manifest.json              — 27 enemies
  string-index.json                — 243 strings
  blockout-visualizer examples/
    floor0whole.md                 — example Copy Full output
    floor0gap.md                   — example Copy Diff output
```

## Dependencies

None at runtime. The tile schema, card list, enemy list, and string index
all load from the `tools/*.json` side-cars via `fetch()`. The visualizer
is a single self-contained HTML file with no external libraries.

`extract-floors.js` requires Node.js (uses the `vm` module to sandbox the
engine files while it collects floor grids and predicates).

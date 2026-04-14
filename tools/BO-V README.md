# Blockout Visualizer

Canvas-based map editor for Dungeon Gleaner's ASCII blockout grids.
Loads floor data from `floor-data.json` (extracted by `extract-floors.js`)
and renders the post-builder grid — what the player actually sees.

## Quick start

```
cd <project-root>
node tools/extract-floors.js        # extracts all floor grids → tools/floor-data.json
python -m http.server 8080           # serve locally (fetch needs HTTP)
```
Open `http://localhost:8080/tools/blockout-visualizer.html`.

If `floor-data.json` is missing, the visualizer shows instructions.

## View controls

| Action | Input |
|--------|-------|
| Pan | Left-click drag (view mode), Shift+drag (edit mode), middle-click drag |
| Zoom | Scroll wheel (zooms toward cursor) |
| Fit to screen | `F` key |
| Toggle grid lines | `G` key |
| Toggle room overlays | `R` key |
| Toggle door overlays | `D` key |
| Toggle tile IDs / glyphs | `I` key |
| Toggle legend panel | `L` key (view mode only) |

The floor selector dropdown in the toolbar lists all extracted floors, indented by depth.
Exterior floors (`"0"`, `"1"`, `"2"`) are top-level; interiors (`"1.1"`, `"2.2"`) are
indented one level; dungeons (`"2.2.1"`) are indented two levels.

## Editing

Press `E` (or click the Edit button) to toggle edit mode. The toolbar shows
the current paint tile, edit count, undo, and revert controls.

### Paint tool (default)

| Action | Input |
|--------|-------|
| Paint a cell | Left-click |
| Paint stroke | Left-click and drag |
| Eyedropper (pick tile from grid) | Right-click |
| Select tile from picker bar | Click any tile swatch at the bottom |
| Select tile from legend | Click any row in the legend panel |
| Quick-select tile (0–9) | Number keys (mapped below) |
| Undo last stroke | Ctrl+Z |
| Revert all changes | Click Revert (with confirmation) |

Quick-select number key mapping:

```
0 → EMPTY (0)       5 → ROAD (32)
1 → WALL (1)        6 → PATH (33)
2 → DOOR (2)        7 → GRASS (34)
3 → TREE (21)       8 → FENCE (35)
4 → SHRUB (22)      9 → PILLAR (10)
```

### Tile picker

The bottom bar shows all 77 tile types grouped by category. This is always
the full tile vocabulary — not filtered by floor type — so you can place
exterior tiles on interior floors (e.g., building a window scene showing
the outside) or dungeon tiles on exterior floors.

Categories: Floor, Terrain, Nature, Structure, Doors/Stairs, Freeform,
Floating/Roof, Furnishing, Interactive, Hazard, Lighting, Infrastructure,
Creature, Economy, Meta.

### Lasso tool

Press `L` (in edit mode) or click the Lasso button to switch to lasso mode.

| Action | Input |
|--------|-------|
| Select region | Left-click and drag a rectangle |
| Move selection | Click inside selection, drag to new position |
| Commit (stamp) floating tiles | Press Enter, or Escape, or click outside |
| Cancel selection | Escape (no floating tiles) |
| Switch back to paint | Press `L` again or click Lasso button |

When you drag a selection to a new position, the source area is filled
with the current resize fill tile (configurable in the resize bar).
The moved tiles appear semi-transparent until committed.

Undo (`Ctrl+Z`) reverts the entire lasso move as one operation.

### Grid resize

When edit mode is active, a resize bar appears below the toolbar.

| Button | Effect |
|--------|--------|
| `-L` / `+L` | Remove / add column on the left edge |
| `+R` / `-R` | Add / remove column on the right edge |
| `-T` / `+T` | Remove / add row at the top |
| `+B` / `-B` | Add / remove row at the bottom |

The **Fill tile** dropdown sets what new cells contain (default: EMPTY).
Common choices: WALL for perimeter expansion, GRASS for exterior padding,
ROAD for extending paths.

Each resize operation is one undo step.

## Clipboard export

Two export buttons are always visible in the toolbar:

### Copy Full

Copies the entire grid as a JavaScript array literal matching the codebase
style, ready to paste into `floor-manager.js` or a `floor-blockout-*.js`
builder:

```js
// Floor "0" — The Approach (50x36)
    [1,1,21,21,21, ...], // 0
    [1,1,21,65,65, ...], // 1
    ...
```

### Copy Diff

Copies only the changes relative to the grid as it was when the floor was
loaded. Unchanged cells appear as `..` placeholders. Unchanged rows collapse
to a comment:

```
// Floor "0" DIFF — 12 cells changed
// ".." = unchanged, numbers = new value
    // row 0 — unchanged
    [..,..,..,65,65,65, ...], // 1  (3 changed)
    // row 2 — unchanged
    ...
```

This format is useful for code review — you can see exactly which cells a
designer touched without wading through the full 50×36 grid.

If the grid was resized, new rows show as `(NEW ROW)` in the diff.

## Overlays

The visualizer renders several overlays on top of the tile grid:

**Room boxes** (yellow dashed): Shows the `rooms` array from the floor
builder. Each room is a rectangle with optional center marker.

**Door targets** (red diamonds): Shows which floor each door tile connects
to, reading from the `doorTargets` map.

**Spawn marker** (magenta circle): The player start position.

**Entry/Exit/Stairs markers** (colored borders): Shows door entry, door
exit, stairs down, and stairs up positions from the `doors` object.

**Dirty cells** (red border): Any cell that differs from the original grid
gets a red highlight, visible in both paint and view mode.

## Tooltip

Hover any cell to see its tile name, ID, category, walkability, opacity,
room membership, door target, and exterior face direction. In edit mode,
modified cells also show the original tile they replaced.

## Workflow: editing an existing floor

1. Run `node tools/extract-floors.js` to refresh `floor-data.json`
2. Open the visualizer, select the floor
3. Press `E` to enter edit mode
4. Paint, lasso-move, or resize as needed
5. Click **Copy Full** to get the complete grid
6. Paste into the floor's builder function (replacing the grid literal)
7. Guard or remove any builder decoration code that would double-apply

For code review, use **Copy Diff** instead — it shows only what changed.

## Workflow: creating a new floor

1. Pick an existing floor of similar size as a starting point
2. Use the resize controls to adjust dimensions
3. Paint the new layout
4. Copy Full → paste into a new `floor-blockout-*.js` file
5. Register with `FloorManager.registerFloorBuilder('ID', builderFn)`
6. Add the `<script>` tag to `index.html` at the correct layer

## File structure

```
tools/
  blockout-visualizer.html    — the editor (this tool)
  extract-floors.js           — Node script that extracts floor grids
  floor-data.json             — extracted floor data (generated, not committed)
  blockout-visualizer examples/
    floor0whole.md            — example Copy Full output
    floor0gap.md              — example Copy Diff output
```

## Dependencies

None at runtime. The tile schema is embedded in the HTML file. Floor data
comes from `floor-data.json` via `fetch()`. The visualizer is a single
self-contained HTML file with no external libraries.

`extract-floors.js` requires Node.js (uses `vm` module to sandbox the
engine files).

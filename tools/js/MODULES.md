# tools/js/ — Module Manifest (Pass 0.4)

Authoritative map of the Blockout Visualizer (`tools/blockout-visualizer.html`) JS
modules, their load order, what they expose, and what they depend on. Pass 0.1
extracted 21 inline `<script>` sections into `bv-*.js` modules; Pass 0.2 stamp
library added; this doc is the index so future contributors can navigate
without re-reading the HTML.

**Loading model** — plain `<script src>` tags in `blockout-visualizer.html`.
Load order *is* the dependency graph: a module can only reference globals
defined by files loaded earlier. No ES modules, no bundler. Every module is an
IIFE that attaches to a single named global.

## Load order (as it appears in `blockout-visualizer.html`)

| # | File | LOC | Global(s) | Depends on |
|---|------|-----|-----------|------------|
| 01 | `bv-tile-schema.js` | 103 | `TILE_SCHEMA`, `CAT_ORDER`, `CAT_LABELS` | — |
| 02 | `bv-floor-data.js` | 67 | `FLOORS`, `currentFloor`, `currentFloorId`, `loadAllFloors`, `loadTileSchema` | 01; calls `populateFloorSelect` (17) on load |
| 03 | `bv-edit-state.js` | 202 | `EDIT`, `pushHistory`, `applyEntry`, `updateEditUI` | 01, 02 |
| 04 | `bv-brush.js` | 77 | `brushCells` | 03 |
| 05 | `bv-primitives.js` | 101 | `cellsInRect`, `cellsInLine`, `floodFillCells`, `replaceAllCells` | — |
| 06 | `bv-grid-resize.js` | 196 | `resizeFloor`, `shiftFloorMetadata` (SENTINEL dirty-seed) | 03, 02 |
| 07 | `bv-lasso.js` | 117 | `LASSO` state, lasso event handlers | 03, 15 |
| 08 | `bv-clipboard.js` | 179 | `CLIPBOARD`, `copySelection`, `cutSelection`, `pasteAt`, `updateClipboardBadge` | 03, 07 |
| 09 | `bv-save-patcher.js` | 234 | save-to-file modal + File System Access API writer | 02, 03 |
| 10 | `bv-clipboard-utils.js` | 93 | `copyFullGrid`, `copyDiff` | 03 |
| 11 | `bv-render.js` | 214 | `draw`, canvas + overlay render | 01–10 |
| 12 | `bv-interaction.js` | 234 | pan/zoom/hover/paint/lasso input wiring | 03, 07, 08, 11 |
| 13 | `bv-tile-picker.js` | 47 | `openTilePicker` | 01, 03 |
| 14 | `bv-legend.js` | 43 | `renderLegend`, toggle | 01 |
| 15 | `bv-floor-selection.js` | 96 | `populateFloorSelect`, `selectFloor` | 02, 03, 11 |
| 16 | `bv-toolbar.js` | 228 | toolbar buttons + keyboard shortcuts, `selectTool`, `__clipboardSmokeTest` | 03, 08, 11 |
| 17 | `bv-scenes.js` | 346 | Tier 4 window-scene editor modal | 01, 02, 11, 16 |
| 18 | `bv-validation.js` | 371 | `VALIDATE`, `runValidation`, `__validateSmokeTest` | 01, 02 |
| 19 | `bv-meta-editor.js` | 392 | Tier 3 metadata panel (spawn/doors/rooms), monkey-patches `applyEntry`/`updateCursor`/`selectFloor` | 03, 15, 11 |
| 20 | `bv-ui-tooltip.js` | 101 | hover tooltips (self-contained IIFE) | 11 |
| 21 | `bv-bo-router.js` | 846 | `window.BO` agent-facing API; ACTIONS closure (router/perception/tile-lookup/stamps) | 01–10, 15, 18 |
| 22 | `bv-stamp-library.js` | 273 | `STAMP_LIB` (localStorage `bv.stamps.v1`) — injects `★ Stamps` toolbar button | 08, 16 |
| 23 | `bv-verb-nodes.js` | 847 | `VN` verb-node stamper (render layer + template stamper + faction palette + export to `data/verb-nodes.json`). Monkey-patches `draw` and `selectFloor`; injects `🛠 Nodes` toolbar button. Consumes sidecars `window.VERB_NODES_DATA` (`../data/verb-nodes.js`) and `window.VERB_NODE_TEMPLATES` (`verb-node-templates.js`) — both loaded in `blockout-visualizer.html` before this module. | 01, 02, 03, 09, 11, 12, 15, 16, sidecars |

Inline `<script>` in `blockout-visualizer.html` after the 23 modules: just
`__validateSmokeTest` thin wrapper + `loadAllFloors()` kickoff. All other
bodies were removed in Pass 0.1 cleanup.

## Non-blockout modules (separate entry points)

| File | LOC | Purpose |
|------|-----|---------|
| `unified-data-manager.js` | 42 | Shared data layer for unified designer |
| `unified-designer.js` | 14 | Thin unified designer bootstrap |
| `world-designer.js` | 694 | Standalone world/biome designer (separate HTML entry) |

## Node CLI (tools/cli/ — split Pass 0.3)

The Node-side agent CLI lives under `tools/cli/` and is dispatched from the
99-line `tools/blockout-cli.js`. See `tools/cli/shared.js` for helpers.

| File | LOC | Commands |
|------|-----|----------|
| `cli/shared.js` | 202 | helpers: args, paths, loadFloors/saveFloors, loadSchema, primitives, rotations |
| `cli/commands-meta.js` | 78 | `list-floors`, `get-floor`, `resize`, `set-spawn`, `set-door-target` |
| `cli/commands-paint.js` | 60 | `paint`, `paint-rect`, `paint-line`, `flood-fill`, `replace` |
| `cli/commands-perception.js` | 114 | `render-ascii`, `describe-cell`, `diff-ascii` |
| `cli/commands-validation.js` | 76 | `validate`, `report-validation` (alias) |
| `cli/commands-tile-lookup.js` | 99 | `tile`, `tile-name`, `tile-schema`, `find-tiles` |
| `cli/commands-stamps.js` | 155 | `stamp-room`, `stamp-corridor`, `stamp-torch-ring`, `save-stamp`, `apply-stamp`, `list-stamps`, `delete-stamp` |
| `blockout-cli.js` | 99 | dispatcher — Object.assigns command modules, defines `describe` in-place |

## CSS modules

| File | LOC | Owner |
|------|-----|-------|
| `css/blockout-visualizer.css` | 433 | Blockout visualizer (extracted Pass 0.2) |
| `css/asset-designer.css` | 482 | Asset designer (separate entry) |
| `css/map-designer.css` | 548 | Map designer (separate entry) |
| `css/unified-designer.css` | 46 | Unified designer |

## Adding a new `bv-*` module

1. Create `tools/js/bv-yourmodule.js` using the IIFE + single named global pattern.
2. Insert the `<script src>` tag in `blockout-visualizer.html` at the correct
   position — before anything that references the global, after everything it
   depends on. Prefer end-of-list for UI panels that only read data.
3. Only reference globals defined by files higher in the table above.
4. Add a row to the Load-order table above with LOC (from `wc -l`), exported
   global(s), and upstream dependencies.
5. If the module monkey-patches an earlier function (see `bv-meta-editor.js`),
   note it in the Global(s) column — load-order regressions silently break
   these.

## Pass 0 substrate status

- **0.1** — 21 inline scripts extracted to modules. ✅
- **0.2** — Inline `<style>` extracted to `css/blockout-visualizer.css`. ✅
- **0.3** — `tools/blockout-cli.js` split into `tools/cli/` (806 → 99 LOC dispatcher). ✅
- **0.4** — This manifest. ✅
- **0.5** — `tools/`-scoped code-review-graph. Pending.
- **0.6** — File-size budgets + CI check. Pending.

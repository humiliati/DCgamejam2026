# BoxForge v2.0

**CSS 3D Box Geometry Editor** — a zero-dependency, single-file visual tool for designing animated 3D box compositions using pure CSS transforms.

BoxForge was built for [Dungeon Gleaner](https://github.com/) (DC Game Jam 2026) to design the peek-window UI elements that appear when the player interacts with doors, chests, torches, and other dungeon objects. It generates production CSS that renders entirely in the browser with no canvas, no WebGL, and no JavaScript at runtime.

## What it does

BoxForge lets you build a 3D box out of CSS-transformed faces (back, left, right, top, bottom, front, lid), then compose additional elements on top of it — glowing light sources with emoji children, animated orbs, rotating pyramids — all driven by a three-phase animation system (Idle / Hover / Activated).

The editor runs at 60fps in the browser. Everything you see in the viewport is live CSS, not a simulation.

### Core features

- **Box shell** — width, height, half-depth sliders with perspective and rotation camera controls
- **Centered pane model (v2)** — all panes are centered in the body div via `left`/`top` CSS; `ox`/`oy` offsets represent displacement from face-center, not from body origin
- **Lid mechanics (two-layer architecture)** — lids use a wrapper div for face positioning (body-center origin) and an inner div for hinge animation (hinge-edge origin), allowing lids to respond correctly to shell dimension changes
- **Glow sources** — up to 5+ radial gradient light sources, each independently positioned and rotated in 3D space, with optional glow children (emoji sprites with per-phase size, opacity, and transform)
- **Orb composer** — pure-CSS sphere built from ring/slice geometry, with per-phase palette, size, speed, and state (unlit, ember, lit)
- **Pyramid composer** — three-face CSS pyramid with per-phase color triads and glow halos
- **Three-phase animation** — every property can vary across Phase 1 (Idle), Phase 2 (Hover), and Phase 3 (Activated), with per-phase toggle buttons in the top bar; intensity-scaled keyframes (squish, bounce, poke) with configurable percentage
- **Compose bar** — toggle orb and pyramid visibility per phase; orb-only and pyramid-primary modes dim the box to feature the composed element
- **Export CSS** — one-click export of the complete CSS for the current project, ready to paste into a stylesheet
- **Preview Export** — generates a standalone test HTML page with the exported CSS, phase buttons, and hover/click interaction, then opens it in a new browser tab for visual gap-checking against the editor
- **Resource monitor** — live FPS counter, scene DOM node count, and pane tally

### Project persistence

- **Save JSON** — serialize the full editor state (shell, colors, panes, glows, orb, pyramid, phase animations, mode flags) to a `.boxforge.json` file
- **Load JSON** — restore any saved project from file; v1 saves auto-migrate to the v2 centered pane model on load
- **Save as Template** — snapshot the current editor state as a named template stored in localStorage
- **Delete user templates** — hover the x button on any user-created template to remove it

### Shipped templates

BoxForge ships with 15 built-in templates:

| Template | Description |
|----------|-------------|
| **Splash Cube** | Default 200x200 box with pink accent lid — the starter template |
| **Chest** | 510x193 treasure chest with hinged top lid (135° open, 25° hover), 5 glow sources, and backpack emoji child |
| **Bookshelf** | 299x303 open-front shelf with top shelf pane, multicolor glow (green/pink/blue/red), and book emoji child |
| **Single Door** | Stone door frame with a single hinged front door panel |
| **Double Doors** | Stone frame with left and right swinging doors |
| **Crate** | Simple wooden storage crate with top lid |
| **Torch** | Wall-mounted torch bracket (no orb) |
| **Torch (box)** | Torch variant with visible box frame and glow sources |
| **Corpse** | Dungeon corpse container with subtle glow |
| **Locked Door** | Reinforced door with lock indicator |
| **Boss Door + Orb** | Ornate boss door with animated orb glow |
| **Torch + Orb** | Torch bracket with full orb flame composition |
| **Orb** | Standalone animated sphere (orb-only mode) with smoke/ember/fire phases |
| **Pyramid** | Standalone rotating pyramid (pyramid-primary mode) with tri-color glow |
| **Torch Peek** | Full composition — wall-mounted torch bracket with orb flame + pyramid ember + glow sources |

## Quick start

Open `boxforge.html` in any modern browser. No server, no install, no build step.

```
your-browser boxforge.html
```

That's it. The entire application is a single HTML file (~5,200 lines) with inline CSS and JavaScript.

## File manifest

```
tools/
  boxforge.html          Main editor (canonical copy)
  peek-workbench.html    Development copy (identical to boxforge.html)
  orb-component.html     Standalone orb playground — isolated ring/slice sphere editor
  chest.test.html        Export gap-check page for the Chest template
  bookshelf.test.html    Export gap-check page for the Bookshelf template
  README.md              This file
  LICENSE                MIT license
```

`peek-workbench.html` is the development-time filename used during the jam. `boxforge.html` is the release name. They are kept in sync via `cp peek-workbench.html boxforge.html`.

`orb-component.html` is a standalone tool for experimenting with the CSS orb (sphere) geometry in isolation, outside the full BoxForge editor. It has its own ring count, slice count, palette, and animation controls.

`*.test.html` files are static export gap-check pages — each one contains the CSS export for a specific template pasted into a minimal test harness with phase buttons and hover/click interaction. They're used to verify that the exported CSS renders identically to the live editor. The Preview Export button in the editor generates these automatically for any template.

## Architecture

BoxForge is a single IIFE (Immediately Invoked Function Expression) with no external dependencies. The code is organized into these sections:

1. **CSS** (~300 lines) — all styles are in a single `<style>` block
2. **HTML** (~460 lines) — sidebar controls, viewport, compose bar, export area
3. **JavaScript** (~4,400 lines) — the IIFE containing:
   - Factory functions (`makePane`, `makeGlow`, `makeOrbPhase`, `makePyrPhase`)
   - State management (shell, colors, panes, glows, orbConfig, pyramidConfig, phaseAnims)
   - Template registry (15 built-in snapshots + localStorage user templates)
   - DOM rendering (pane list, glow list, orb/pyramid sections, compose bar)
   - 3D viewport rendering (CSS transform composition, centered pane model, two-layer lid architecture)
   - Serialization (`serializeProject` / `loadProject`) with v1→v2 migration
   - Export (`generateExportCSS`) and preview generation (`generatePreviewHTML`, `generatePhaseKeyframesCSS`)
   - Init sequence (snapshot built-ins, load first template, start render loop)

### The `.boxforge.json` format

```json
{
  "_format": "boxforge",
  "_version": 2,
  "shell":         { "bw": 200, "bh": 200, "bd": 100, "persp": 800, "rx": -25, "ry": 20 },
  "colors":        { "cDark": "...", "cLight": "...", "cFloor": "...", "cCeil": "...", "cGlow": "..." },
  "panes":         [ { "id": 1, "name": "Back", "face": "back", ... } ],
  "glows":         [ { "id": 1, "name": "Floor glow", ... } ],
  "orbConfig":     { "p1": { ... }, "p2": { ... }, "p3": { ... } },
  "pyramidConfig": { "p1": { ... }, "p2": { ... }, "p3": { ... } },
  "phaseAnims":    { "p1": { ... }, "p2": { ... }, "p3": { ... } },
  "phaseMode":     "box",
  "orbOnly":       false,
  "pyrPrimary":    false,
  "currentState":  "p1"
}
```

**v2 migration**: v1 saves (where `_version` is missing or < 2) stored pane `ox`/`oy` values relative to the body origin (0,0). v2 stores them relative to the face center. On load, `_migrateCentering()` subtracts `(W - pw)/2` from ox and `(H - ph)/2` from oy to convert v1 offsets to v2 semantics. This is transparent to users — old saves just work.

### Two-layer lid architecture

Lids in CSS 3D need two separate `transform-origin` values: one for face positioning (rotation around the box center) and one for hinge animation (rotation around the hinge edge). Since CSS only allows one `transform-origin` per element, BoxForge splits each lid into two nested elements:

- **Wrapper** (`.box3d-lid-wrap`) — positioned on the target face using the same face-transform math as structural panes. `transform-origin` defaults to center, which aligns with the body center for correct face rotation.
- **Inner pane** (`.box3d-lid`) — the visible surface. `transform-origin` is set to the hinge edge (e.g., `center 0px` for top-hinged). The hinge open/hover transforms are applied here.

This separation means lids respond correctly when shell dimensions change — the wrapper recalculates face position while the inner pane maintains its hinge behavior.

### Public API

BoxForge exposes a minimal API on `window.BoxForge` for scripting and testing:

```js
window.BoxForge.serialize()   // → full project state object
window.BoxForge.load(data)    // ← restore from project state object
```

## Browser support

Tested in Chromium-based browsers (Chrome, Brave, Edge). Requires CSS 3D transforms, CSS custom properties, and `preserve-3d`. No polyfills needed for any modern browser.

## Target platform

BoxForge was built to produce CSS for **Dungeon Gleaner**, which targets the LG Content Store as a webOS TV app driven by the Magic Remote. The generated CSS is designed to render cleanly on the webOS Chromium runtime (Chrome 87+).

## License

MIT — see [LICENSE](LICENSE).

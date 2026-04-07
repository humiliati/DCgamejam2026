# CSS 3D Box Geometry Editor — Product Roadmap

**Product name (working):** BoxForge
**Origin:** Peek Box Workbench v2 (Dungeon Gleaner game jam tool)
**Current state:** 1,580-line single-file HTML tool, zero dependencies, fully functional
**Goal:** Ship a polished, standalone, open-source CSS 3D box geometry editor that any team using `preserve-3d` boxes can drop into their workflow

---

## Current Capabilities (What We Have)

- Interactive 3D viewport with CSS `preserve-3d` rendering
- Box shell controls: width, height, depth, perspective, rotateX/Y
- Multi-pane system: structural faces (auto-sized from shell) + custom panes (lids, decor)
- Per-pane properties: dimensions, offsets, face assignment, color, opacity, texture
- Lid system: 8 hinge types (top/bottom/left/right + 4 slide directions), open angle, hover angle
- Multi-lid support (double doors, split panels)
- Snap grid: 9-point anchor alignment, toggleable for snap-then-tune workflow
- Arrow-key nudging: 1px or 10px (Shift) for precise offset tuning
- Click-to-revert: click any slider label to reset to template default; dirty state highlighted
- Structural pane dimension lock: width/height inputs disabled when driven by shell
- Horizon line: perspective-aware reference line, toggleable
- 8 built-in templates (Splash Cube, Chest, Single/Double Door, Crate, Torch, Corpse, Locked)
- Pane text/labels with 4 direction modes and configurable font size
- Per-pane wiring notes (free-form, exported as CSS comments)
- Full CSS export: variant class, custom properties, structural faces, lid states (closed/hover/open), wiring notes, label assignments
- Display toggles: labels, wireframe, glow, horizon, spin
- State bar: closed / hover / opened preview

---

## Vision

A tool that lets designers and front-end developers visually author CSS 3D box components — dialog boxes, card flips, product viewers, game UI panels, interactive menus — and export production-ready CSS. No framework dependency, no build step, no learning curve beyond "open the HTML file."

---

## Roadmap — Now / Next / Later

### NOW — Ship It (v1.0 release)

The tool works. The goal here is to strip project-specific content, add documentation, and package for distribution.

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 1 | **Extract templates to JSON sidecar** | S | Move `TEMPLATES` object → `boxforge-templates.json`. Tool loads via `fetch()` with inline fallback. Teams ship their own template file. |
| 2 | **Extract textures/materials to config** | S | Move texture `<optgroup>` lists and `getTextureBg()` patterns → `boxforge-materials.json`. Generic materials ship by default; game/biome/narrative sets become optional packs. |
| 3 | **Strip project-specific vocabulary** | XS | Remove Dungeon Gleaner references: biome tag dropdown options, `BoxAnim.create()` placeholder, floor/biome names. Replace with generic equivalents. |
| 4 | **Rename to BoxForge** | XS | File rename, title bar, export comments, version string. |
| 5 | **Write README.md** | M | What it is, screenshot/GIF, how to open, how to use (template → edit → export → paste), how to add custom templates, how to add custom materials, browser support, license. |
| 6 | **Add import/load from CSS** | M | Paste exported CSS back into the tool to reload a variant for editing. Regex parser extracts dimensions, transforms, custom properties. Closes the round-trip loop. |
| 7 | **Add JSON save/load** | S | Export full editor state (shell + colors + panes array) as JSON. Load JSON to restore. More reliable than CSS re-import for exact fidelity. |
| 8 | **License selection** | XS | Choose license (MIT recommended for adoption). Add LICENSE file and header comment in source. |
| 9 | **Create GitHub repo** | XS | `boxforge/` with `index.html`, `README.md`, `LICENSE`, `templates/default.json`, `materials/default.json`, screenshot assets. |

**Milestone:** v1.0 — a generic, documented, self-contained tool anyone can clone and use.

### NEXT — Make It Great (v1.x polish)

Features that elevate it from "useful tool" to "tool people recommend."

| # | Item | Effort | Depends On | Notes |
|---|------|--------|------------|-------|
| 10 | **Drag panes in viewport** | L | — | Unproject mouse coordinates through the perspective + rotation matrix to compute ox/oy deltas. Needs a 4×4 CSS matrix decomposition or a simplified 2D projection approximation. The hard part is making drag feel stable across all rx/ry angles. |
| 11 | **Pane resize by edge-dragging** | L | #10 | Drag a pane edge to resize pw/ph. Requires hit-testing pane edges in projected space. |
| 12 | **Drag-and-drop pane reordering** | S | — | Reorder panes in the sidebar list via drag-and-drop. Affects render order (painter's algorithm). |
| 13 | **Undo/redo** | M | — | Command stack tracking shell, colors, and panes mutations. Ctrl+Z / Ctrl+Shift+Z. Critical for creative tools — every action should be reversible. |
| 14 | **Multiple material preview modes** | S | #2 | Toggle between CSS pattern preview, flat color, checkerboard (UV debug), numbered faces. |
| 15 | **Animation timeline** | L | — | Keyframe editor for lid open/close sequences. Preview multi-step animations (door creaks open 30°, pauses, swings to 90°). Export as CSS `@keyframes`. |
| 16 | **Responsive preview** | S | — | Scale the viewport to simulate the box at different container sizes. Useful for responsive layouts where the box component needs to flex. |
| 17 | **Dark/light theme toggle** | XS | — | Currently dark-only. Add a light theme for designers who work in light environments. |
| 18 | **Keyboard shortcut sheet** | XS | — | Modal or overlay listing all shortcuts (arrow nudge, Shift+arrow, Escape to deselect, etc.). |

**Milestone:** v1.5 — undo/redo, viewport drag, and animation timeline make it a real design tool.

### LATER — Platform & Ecosystem (v2.0+)

Bigger bets that expand the audience or enable new workflows.

| # | Item | Effort | Depends On | Notes |
|---|------|--------|------------|-------|
| 19 | **Component library export** | L | #6, #7 | Export a variant not just as CSS but as a complete web component (`<box-3d variant="chest">`) or React/Vue component with props for open state, label text, and callbacks. |
| 20 | **Template marketplace / community gallery** | L | #9, #2 | User-submitted template packs. Browse, preview, one-click load. Could be a static GitHub Pages site that indexes JSON template files from community repos. |
| 21 | **Figma plugin** | XL | #7 | Import a Figma frame's dimensions and colors as a starting box, or export the 3D preview as an SVG snapshot back into Figma. Requires Figma Plugin API. |
| 22 | **VS Code extension** | L | #7 | Side panel that renders the 3D preview live as you edit CSS. Detects `.box3d-wrap` rules and offers "Open in BoxForge." |
| 23 | **Collaborative editing** | XL | #7 | Real-time multi-user editing via WebRTC or a lightweight signaling server. Two designers tuning the same box simultaneously. |
| 24 | **Three.js / WebGL preview mode** | L | — | Toggle between CSS 3D (pixel-accurate to what ships) and WebGL (smooth orbit camera, real lighting, shadows). WebGL mode is for presentation; CSS mode is for accuracy. |
| 25 | **Accessibility pass** | M | — | Full keyboard navigation of all controls, ARIA labels on the snap grid and pane list, screen reader announcements for state changes, high-contrast mode. |

**Milestone:** v2.0 — a platform with community templates, framework export, and editor integrations.

---

## Dependency Map

```
#1 Templates JSON ──┐
#2 Materials JSON ──┤
#3 Strip specifics ─┤
#4 Rename ──────────┼──→ #9 GitHub repo ──→ #20 Community gallery
#5 README ──────────┤                   ──→ #22 VS Code extension
#8 License ─────────┘

#6 CSS import ──────┬──→ #19 Component export
#7 JSON save/load ──┤──→ #21 Figma plugin
                    ├──→ #22 VS Code extension
                    └──→ #23 Collaborative editing

#10 Viewport drag ──→ #11 Edge resize

#13 Undo/redo (independent, high priority)
#15 Animation timeline (independent, high effort)
#25 Accessibility (independent, should start early)
```

---

## Effort Key

| Size | Meaning | Approximate time (solo dev) |
|------|---------|----------------------------|
| XS | < 1 hour | Rename, config tweak, copy change |
| S | 1–4 hours | JSON extraction, simple UI feature |
| M | 4–12 hours | README, import parser, undo system |
| L | 1–3 days | Viewport drag, animation timeline, component export |
| XL | 1–2 weeks | Figma plugin, collaborative editing |

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Viewport drag feels jittery at steep rx/ry angles | Users abandon drag, stick to sliders | Build a simplified projection model; clamp drag sensitivity at steep angles; keep sliders as primary, drag as accelerator |
| CSS 3D has browser rendering inconsistencies | Exported CSS looks different in Safari vs Chrome | Test export output in all major browsers; document known quirks in README; consider adding vendor-prefix export option |
| Animation timeline scope creep | Delays v1.5 significantly | Timebox to single-axis keyframes first (open angle over time); multi-property animation is v2 |
| Low adoption without framework integration | Tool stays niche | Prioritize #19 (component export) in v2; React/Vue wrapper vastly expands audience |
| Accessibility debt compounds | Becomes expensive to retrofit | Start #25 incrementally — add ARIA to each new feature as it ships, don't defer to a single big pass |

---

## What's NOT on the Roadmap

These are explicitly out of scope to keep the product focused:

- **3D modeling / mesh editing** — this is a CSS box tool, not Blender
- **Image/texture asset management** — materials are CSS patterns or user-provided classes, not bitmap pipelines
- **Server-side rendering** — the tool runs in the browser, exports static CSS
- **Monetization features** — keep it open source; adoption is the goal
- **Mobile editor** — desktop-first; the control surface doesn't shrink gracefully to touch

---

## Success Metrics

| Metric | v1.0 target | v1.5 target | v2.0 target |
|--------|-------------|-------------|-------------|
| GitHub stars | 50 | 250 | 1,000 |
| Template packs contributed | 0 (built-in only) | 3 community packs | 15+ |
| Weekly unique cloners | 10 | 50 | 200 |
| Framework integrations | 0 | 0 | 2 (React, Vue) |
| Open issues (bugs) | < 5 | < 10 | < 15 |

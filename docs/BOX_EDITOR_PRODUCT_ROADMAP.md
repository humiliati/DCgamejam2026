# CSS 3D Box Geometry Editor — Product Roadmap

**Product name (working):** BoxForge
**Origin:** Peek Box Workbench v2 (Dungeon Gleaner game jam tool)
**Current state:** 3,665-line single-file HTML tool, zero dependencies, fully functional
**Goal:** Ship a polished, standalone, open-source CSS 3D box geometry editor that any team using `preserve-3d` boxes can drop into their workflow
**Last updated:** 2026-04-07

---

## Current Capabilities (What We Have)

### Core box editor
- Interactive 3D viewport with CSS `preserve-3d` rendering
- Box shell controls: width, height, depth, perspective, rotateX/Y
- Multi-pane system: structural faces (auto-sized from shell) + custom panes (lids, decor)
- Per-pane properties: dimensions, offsets, face assignment, color, opacity, texture, biome tag
- Lid system: 8 hinge types (top/bottom/left/right + 4 slide directions), open angle, hover angle
- Multi-lid support (double doors, split panels)
- Snap grid: 9-point anchor alignment, toggleable for snap-then-tune workflow
- Arrow-key nudging: 1px or 10px (Shift) for precise offset tuning
- Click-to-revert: click any slider label to reset to template default; dirty state highlighted (box, orb, AND pyramid sliders)
- Structural pane dimension lock: width/height inputs disabled when driven by shell
- Pane text/labels with 4 direction modes and configurable font size
- Per-pane wiring notes (free-form, exported as CSS comments)
- 8+ pane texture presets (wood, brick, stone, iron, concrete, grid, cathedral, boss variants)

### Compose system (multi-element stacking)
- **Orb (CSS geodesic sphere):** N rings × N slices of `border-radius:50%` circles with `rotateY()` transforms. Per-phase config (p1/p2/p3) for size, speed, rings, slices, palette (7 presets: fire/ember/ice/poison/arcane/holy/smoke), state (lit/ember/unlit), anchor x/y/z. Save/Drop In clipboard for reuse across templates.
- **Pyramid (CSS 3D tetrahedron):** 4 triangular faces with `clip-path: polygon()` and `conic-gradient` fills. Per-phase config for width, height (independent stretch), spread angle (face hinge at apex, 0–90°), speed, 3 face colors, glow color, anchor x/y/z. Shared: spinning toggle, shape (triangle/diamond/pentagon/arrow), invert.
- **Glow sources (independent section):** Radial gradient blobs with color, alpha, size, blur, position x/y/z, rotation x/y, spin animation x/y, shape (circle/ellipse). Managed as a list with add/remove/select. Own sidebar section — accessible in ALL modes (box, orb-only, pyramid-primary).
- Compose bar: Add Orb / Drop Saved Orb / Add Triangle / Remove Orb / Remove Triangle / Phase Mode toggle (orb-origin vs box-origin)
- Mode system: orb-only mode (start from orb, wrap box around it), pyr-primary mode (pyramid template, box controls dimmed), normal box+compose mode

### Phase system
- 3 states: Phase 1 (Idle/Closed), Phase 2 (Hover), Phase 3 (Activated/Open)
- State bar toggles active phase — all per-phase sliders update on switch
- Phase mode toggle: orb-origin (smoke → ember → flame) vs box-origin (resource-savvy idle states)
- Per-phase animations: 6 toggle buttons in Display sidebar — squish, bounce, poke, spin, tilt, glow
- Phase anims are per-phase exportable properties, not just view helpers

### Display & view
- Horizon line: perspective-aware reference, toggleable
- Display section split: View Only helpers (Labels, Wireframe, Horizon) vs Phase Anims (per-phase, exports)
- State bar: Phase 1 / Phase 2 / Phase 3 preview with semantic labels

### Templates
- 4 built-in templates: Chest, Boss Door + Orb, Pyramid, Torch Peek
- Each template configures shell, panes, colors, orb, pyramid, phaseAnims in one click

### Export
- Full CSS export with custom properties, structural faces, lid states (closed/hover/open)
- Per-phase orb export: size, speed, rings, slices, x, y, z, palette, state as CSS vars
- Per-phase pyramid export: width, height, spread, speed, colors, glow, face transforms with `calc()` + CSS vars
- Glow sources export: dimensions, position, radial-gradient, blur, rotation, spin keyframes
- Decor panes export: position, transform, color, opacity, border-radius, spin
- Phase animations export: per-phase active toggle list
- Wiring notes and label assignments as CSS comments

---

## Vision

A tool that lets designers and front-end developers visually author CSS 3D box components — dialog boxes, card flips, product viewers, game UI panels, interactive menus — and export production-ready CSS. No framework dependency, no build step, no learning curve beyond "open the HTML file."

---

## Roadmap — Now / Next / Later

### NOW — Ship It (v1.0 release)

The tool works. The compose system (orb, pyramid, glow) and per-phase config are fully functional. The goal is to strip project-specific content, add documentation, and package for distribution.

| # | Item | Effort | Status | Notes |
|---|------|--------|--------|-------|
| 1 | **Extract templates to JSON sidecar** | S | TODO | Move `TEMPLATES` object → `boxforge-templates.json`. Tool loads via `fetch()` with inline fallback. Templates now include orb, pyramid, glow, and phaseAnims config — the JSON schema must capture all compose elements. |
| 2 | **Extract textures/materials to config** | S | TODO | Move texture `<optgroup>` lists and `getTextureBg()` patterns → `boxforge-materials.json`. Generic materials ship by default; game/biome/narrative sets become optional packs. |
| 3 | **Strip project-specific vocabulary** | XS | TODO | Remove Dungeon Gleaner references: biome tag dropdown options (Cedar Street, Promenade, Harbor, etc.), faction texture names, `BoxAnim.create()` placeholder wiring text. Replace with generic equivalents. |
| 4 | **Rename to BoxForge** | XS | TODO | File rename (`peek-workbench.html` → `index.html`), title bar, export comments, version string. |
| 5 | **Write README.md** | M | TODO | What it is, screenshot/GIF, how to open, how to use (template → edit → export → paste), compose system overview (orb/pyramid/glow), phase system, how to add custom templates, browser support, license. |
| 6 | **Add import/load from CSS** | M | DEFER to v1.x | Complex now that export includes orb/pyramid/glow CSS vars. JSON save/load (#7) is the primary round-trip mechanism for v1.0. |
| 7 | **Add JSON save/load** | S | TODO | Export full editor state (shell + colors + panes + orbConfig + pyramidConfig + glows + phaseAnims + phaseMode) as JSON. Load JSON to restore. This is the primary save mechanism. |
| 8 | **License selection** | XS | TODO | MIT recommended for adoption. Add LICENSE file and header comment in source. |
| 9 | **Create GitHub repo** | XS | TODO | `boxforge/` with `index.html`, `README.md`, `LICENSE`, `templates/default.json`, `materials/default.json`, screenshot assets. |

**Milestone:** v1.0 — a generic, documented, self-contained tool anyone can clone and use.

### NEXT — Make It Great (v1.x polish)

Features that elevate it from "useful tool" to "tool people recommend."

| # | Item | Effort | Depends On | Notes |
|---|------|--------|------------|-------|
| 6 | **Add import/load from CSS** | M | — | Deferred from v1.0. Paste exported CSS to reload a variant. Must now parse orb/pyramid/glow CSS vars in addition to box geometry. |
| 10 | **Drag panes in viewport** | L | — | Unproject mouse coordinates through the perspective + rotation matrix to compute ox/oy deltas. Needs a 4×4 CSS matrix decomposition or a simplified 2D projection approximation. The hard part is making drag feel stable across all rx/ry angles. |
| 11 | **Pane resize by edge-dragging** | L | #10 | Drag a pane edge to resize pw/ph. Requires hit-testing pane edges in projected space. |
| 12 | **Drag-and-drop pane reordering** | S | — | Reorder panes in the sidebar list via drag-and-drop. Affects render order (painter's algorithm). |
| 13 | **Undo/redo** | M | — | Command stack tracking shell, colors, panes, orbConfig, pyramidConfig, glows, and phaseAnims mutations. Ctrl+Z / Ctrl+Shift+Z. Critical for creative tools — every action should be reversible. |
| 14 | **Multiple material preview modes** | S | #2 | Toggle between CSS pattern preview, flat color, checkerboard (UV debug), numbered faces. |
| 15 | **Animation timeline** | L | — | Keyframe editor for lid open/close sequences. Preview multi-step animations (door creaks open 30°, pauses, swings to 90°). Export as CSS `@keyframes`. |
| 16 | **Responsive preview** | S | — | Scale the viewport to simulate the box at different container sizes. Useful for responsive layouts where the box component needs to flex. |
| 17 | **Dark/light theme toggle** | XS | — | Currently dark-only. Add a light theme for designers who work in light environments. |
| 18 | **Keyboard shortcut sheet** | XS | — | Modal or overlay listing all shortcuts (arrow nudge, Shift+arrow, Escape to deselect, etc.). |
| 26 | **Aura/Corona compose item** | M | — | Multi-layer `box-shadow` halo (outer glow + inset shadows) with pulse keyframe. Based on celestial body pattern from CSS_TO_USE.md. Distinct from glow sources (which are positioned radial-gradient blobs). |
| 27 | **Ring/Torus compose item** | S | — | Flat CSS ring (`border-radius:50%` with hollow center). Per-phase size, thickness, color, rotation, spin. High composability with orb/pyramid. |
| 28 | **Particle field compose item** | M | — | N small divs with seeded random positions, sizes, and animation delays. Floating dust, ember sparks, magic particles. Per-phase count, spread, speed, color, size range. |
| 29 | **Text label compose item** | S | — | Standalone floating 3D text (not attached to a pane). Font, size, color, text-shadow glow, position x/y/z. Useful for "RARE", item names, damage numbers. |

**Milestone:** v1.5 — undo/redo, viewport drag, new compose items, and animation timeline make it a real design tool.

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
#7 JSON save/load ──┤
#8 License ─────────┘

#6 CSS import ──────┬──→ #19 Component export
#7 JSON save/load ──┤──→ #21 Figma plugin
                    ├──→ #22 VS Code extension
                    └──→ #23 Collaborative editing

#10 Viewport drag ──→ #11 Edge resize

#13 Undo/redo (independent, high priority)
#15 Animation timeline (independent, high effort)
#25 Accessibility (independent, should start early)

#26 Aura ──┐
#27 Ring ──┤── compose items (independent, extend compose system)
#28 Particles ─┤
#29 Text label ┘
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

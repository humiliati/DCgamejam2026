# Peek Workbench — Scope & Status

Last updated: 2026-04-07

## Current state

`tools/peek-workbench.html` is a self-contained CSS 3D box geometry editor (~3550 lines). It composes peek overlays — the animated containers the game renders when the player inspects world objects (chests, doors, torches, quest items).

### What works today

**Box shell**: width/height/depth sliders, 6-face rendering, snap grid, arrow nudge. Sliders have click-to-revert dirty labels (gold = modified, click label to reset to template default).

**Panes**: arbitrary rectangular panels attached to any face, with hinge animation (open/close angle), hover angle, border radius, label text, structural sizing. Full click-to-revert.

**Glow sources**: radial gradient blobs with color, alpha, size, blur, position (x/y/z), rotation (rotX/rotY), spin animation (spinX/spinY), shape (circle/ellipse). Managed as a list with add/remove/select. Lives inside `#panes-section` (the `box-section` container).

**Orb (CSS sphere)**: geodesic sphere built from N rings × N slices of `border-radius:50%` circles with `rotateY()` transforms. Per-phase config (p1/p2/p3) for size, speed, rings, slices, palette, state, anchor x/y/z. Save/Drop In clipboard. Compose integration: orb-only mode (start from orb, wrap box around it) and box+orb mode (start from box, add orb).

**Pyramid (CSS tetrahedron)**: 4 triangular faces with `clip-path: polygon()` and `conic-gradient` fills. Per-phase config for width, height, spread (face hinge angle at apex), speed, 3 colors, glow color, anchor x/y/z. Shared properties: spinning, shape (triangle/diamond/pentagon/arrow), invert. Compose integration: add/remove triangle.

**Phase system**: 3 states (P1 Idle / P2 Hover / P3 Activated). State bar toggles the active phase. Phase mode toggle (orb-origin vs box-origin) changes the semantic labels. Per-phase animations: squish, bounce, poke, spin, tilt, glow — 6 toggle buttons in the Display sidebar section.

**Templates**: 4 presets (Chest, Boss Door + Orb, Pyramid, Torch Peek) that configure shell, panes, colors, orb, pyramid, and phaseAnims in one click.

**Export**: CSS output with box geometry, pane transforms, glow sources, orb config, pyramid config, phase animations.

**Display helpers** (view-only, not exported): Labels, Wireframe, Horizon line.

### Known bugs to patch now

1. **Pyramid sliders have no reset-to-default labels.** The box shell sliders use the `resettable` / `is-dirty` label system to show when a value has been modified (gold text) and allow click-to-revert. Pyramid sliders have plain labels. Need `updatePyrDirtyLabels()` and a click-to-revert handler for `#pyr-section .cr label`.

2. **Glow locked out in pyr-primary mode.** The glow system (Add Glow button, glow list, glow properties) lives inside `#panes-section.box-section`. The CSS rule `.pyr-primary-mode .box-section { opacity: 0.25; pointer-events: none; }` kills it. Fix: extract glow into its own section outside `box-section`, or add a CSS override that keeps glow accessible in pyr-primary mode.

---

## Pass 1 — Structural fix: glow/shadow as independent compose item

The glow system is currently nested inside the Panes section header, sharing the `box-section` class. This is architecturally wrong — glows aren't panes, they aren't box-specific, and they should compose with pyramids and orbs independently.

**Proposed change**: pull glow out of `#panes-section` into its own `#glow-section` with its own section head ("Glow Sources"). The section should:
- NOT have the `box-section` class
- Be visible in all modes (box, orb-only, pyr-primary)
- Keep the existing add/remove/select/properties UI
- Appear in the sidebar between Panes and Display

This also means the Compose bar should eventually offer "+ Add Glow" as a compose action alongside Add Orb and Add Triangle, but the existing Add Glow button in the section head works fine for now.

---

## Pass 2 — New compose shapes

The compose system currently supports: Box (shell), Panes, Orb, Pyramid, Glow. What else would a designer working with CSS 3D every day expect?

### High-value additions

**Ring / Torus** — a flat CSS ring (`border-radius: 50%` with transparent center via `clip-path` or nested circles). Per-phase size, thickness, color, rotation, spin. A ring orbiting a pyramid or floating around an orb is a classic HUD/inventory element. Implementation: single div with `border` and `border-radius:50%`, or two concentric circles. Simpler than orb (no geodesic math), high visual payoff.

**Disc / Plate** — flat circular platform. Similar to ring but solid. Shadow catcher, base plate, coin face. `border-radius:50%` with gradient fill, `rotateX()` to tilt. Per-phase size, tilt, color, height offset.

**Particle field** — N small divs with randomized positions, sizes, and animation delays. Floating dust motes, ember sparks, magic particles. Each particle: `border-radius:50%`, small size (2-6px), absolute position within a container, `@keyframes` float/drift. Per-phase: count, spread radius, speed, color, size range. Would need a seeded RNG for reproducible layouts (we have SeededRNG in the game engine but this is a standalone tool — can use a simple LCG).

**Aura / Corona** — the celestial body pattern from `docs/CSS_TO_USE.md`. Multiple layered `box-shadow` (both inset and outer) on a `border-radius:50%` div, with a `shadowPulse` keyframe that animates the shadow spread/blur between two states. This is the "background glow" the user asked about. Per-phase: shadow layers (inner glow color, outer glow color, pulse spread range), size, pulse speed. Different from the existing glow system (which uses positioned radial-gradient blobs) — this is an on-element multi-shadow halo.

**Text label / Badge** — floating text in 3D space. Already partially exists as pane labels, but a standalone text element that isn't attached to a pane face would be useful for "RARE", "NEW", damage numbers, item names. `font-family`, `font-size`, `color`, `text-shadow` for glow, position x/y/z, rotation.

### Medium-value additions

**Marquee / Scroll** — CSS `marquee`-style horizontal text scroll. Retro boardwalk aesthetic. Implementable with `@keyframes` translateX animation on a text container with `overflow:hidden` parent. Per-phase: text content, speed, direction, color, font size. Fits the retrofuturism theme.

**Wire frame** — visible edges of the box rendered as thin lines. Already exists as a Display toggle (Wireframe checkbox), but making it a per-phase exportable compose item with edge color, thickness, and opacity would give designers edge-glow effects.

**Shield / Hex** — regular polygon shapes (hexagon, octagon) via `clip-path: polygon()`. Same rendering approach as pyramid faces but flat (single div, no 3D fold). Useful for status badges, frame elements, HUD chrome.

### Realistic capacity

The compose system can comfortably hold **8-10 item types** before the sidebar becomes unwieldy. Current count: 5 (box, panes, orb, pyramid, glow). Adding ring, aura, particles, and text/badge would bring it to 9, which is the sweet spot. Each additional type needs: data model, per-phase config, sidebar section with sliders, render function, export serialization, compose bar add/remove buttons, and template integration.

The sidebar already scrolls, so vertical space isn't a hard constraint. The real limit is cognitive load — a designer needs to grok the full compose stack at a glance. Grouping helps: "Structure" (box, panes), "Objects" (orb, pyramid, ring), "Effects" (glow, aura, particles), "Labels" (text, marquee).

---

## Pass 3 — Celestial body reverse-engineering

`docs/CSS_TO_USE.md` lines 945-1095 contain a fire orb / sun celestial body. The key technique:

```css
.section-banner-sun {
  border-radius: 50%;
  animation: sunRotate 30s linear infinite, shadowPulse 5s ease-in-out infinite;
  box-shadow:
    0px 0px 40px 20px RGBA(255, 140, 0, 0.8),          /* outer corona */
    -5px 0px 10px 1px #ffb453 inset,                     /* inner highlight left */
    15px 2px 40px 20px #bb6d01c5 inset,                  /* inner mass right */
    -24px -2px 50px 25px #ffa265c2 inset,                /* inner mass left */
    150px 0px 80px 35px #c55f00aa inset;                  /* deep interior glow */
}

@keyframes shadowPulse {
  0%, 100% { box-shadow: /* tighter shadows */ }
  50%      { box-shadow: /* wider shadows with higher spread */ }
}
```

This is a **multi-layer box-shadow halo** — 1 outer glow + 4 inset shadows creating internal luminance variation, animated between two shadow states to pulse. The star elements around it use a `twinkling` opacity keyframe.

**Mapping to workbench**: this would be the "Aura" compose item. A single `border-radius:50%` div with:
- N shadow layers (each: color, x-offset, y-offset, blur, spread, inset flag)
- Pulse animation toggling between two shadow states
- Per-phase: layer colors, spread multiplier, pulse speed
- The orb's geodesic sphere could sit INSIDE the aura div, giving us the fire-orb-on-starfield look

This is distinct from the existing glow sources (which are separate positioned divs with `radial-gradient` + `filter:blur`). The aura lives ON the element as `box-shadow`, which means it tracks the element's position and rotation automatically.

---

## Patch checklist (immediate)

- [ ] Add `updatePyrDirtyLabels()` + click-to-revert for pyramid sliders
- [ ] Extract glow out of `#panes-section` OR add CSS override for pyr-primary mode
- [ ] Verify sidebar overlap fix is solid (the `height:auto` on Display `.cr`)

## Next compose items (priority order)

1. Aura / Corona (celestial body box-shadow halo) — highest visual impact, reference implementation exists
2. Ring / Torus — simple implementation, high composability with orb/pyramid
3. Particle field — medium complexity, high visual payoff for torch/magic peeks
4. Text label — simple, practical for item/status peeks

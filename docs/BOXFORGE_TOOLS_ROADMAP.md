# BoxForge Tools Roadmap

**Status**: Active — items 1–5 complete, items 6–8 in planning  
**File**: `tools/peek-workbench.html` (7,074 lines as of 2026-04-09)  
**Canonical copy**: `tools/boxforge.html` (kept in sync via `cp`)  
**Format version**: v3 (added peekType, jsHandoffModule, P4 phase data)

---

## Completed Work

### 1. Fix Snap-To Buttons — DONE

Neighbor-aware snap implemented. `getNeighbors(p)` collects all panes on the same face; `snapOffset(anchor, p)` searches for the nearest candidate edge within `SNAP_THRESHOLD` (50px) across both axes. For each anchor direction (left/right/top/bottom/center), it checks neighbor right-edge, left-edge, and center alignment, picking the closest match. Falls back to face-edge alignment when no neighbor is within threshold.

Implementation details (lines ~2944–3068):
- `getPaneRect(p)` — returns `{ left, right, top, bottom, cx, cy, w, h }` in face-local coords
- `getNeighbors(p)` — filters panes sharing the same face, excludes self
- `snapOffset(anchor, p)` — per-axis nearest-edge search with threshold gating
- Horizontal: left-snap checks neighbor right-edges + left-edges (flush align); right-snap mirrors; center-snap checks neighbor centers
- Vertical: same pattern (top→neighbor bottoms/tops, bottom→neighbor tops/bottoms, center→neighbor centers)
- Returns `{ ox, oy }` rounded to integer

Cross-face seam snapping (left-face right-edge ↔ back-face left-edge) remains out of scope.

### 2. Peek Type Selector + Constraint Enforcement — DONE (April 8, 2026)

Dropdown in the sidebar header with 8 options:

| Value | Label | Active Phases |
|---|---|---|
| `none` | — No Classification — | P1+P2+P3 |
| `full` | Full Peek | P1+P2+P3 |
| `action` | Action Peek | P2+P3 |
| `step-on` | Micro Step-On | P1+P2 |
| `face-passive` | Micro Face-To · Passive | P1 |
| `face-self` | Micro Face-To · Clicky | P1+P2+P3+P4 |
| `face-js` | Micro Face-To · JS Handoff | P1→P2→[JS]→P4 |
| `gated` | Context-Gated | P1+P2+P3 |

Constraint enforcement: `PEEK_PHASE_MAP` defines per-type phase states (`active`, `disabled`, `handoff`). `updatePhaseLabels()` applies type-aware button text via `PEEK_PHASE_LABELS` and CSS classes (`phase-disabled` greys out + blocks pointer, `phase-handoff` shows italic teal + `⟨JS⟩` suffix). Selecting a peek type that disables the current phase auto-snaps to the first available phase.

Badge: colored chip next to dropdown shows classification at a glance.

### 3. P4 Phase Support — DONE (April 8, 2026)

Fourth phase button added to the state bar. `phaseAnims` extended to include `p4` with all 6 animation channels (squish, bounce, poke, spin, tilt, glow). Phase accessor functions (`activePhaseAnims()`, `activePyrPhase()`, `activeOrbPhase()`) handle P4 with fallback to P1 data when P4 config is missing (backward compat with v2 files).

Orb and pyramid configs extended with `p4` phase entries. Export CSS emits `.phase4` selectors. Export preview handles phase '4'. Undo/redo snapshots include P4 data.

### 4. JS Handoff Tag + Reverse Playback Model — DONE (April 8, 2026)

When peek type is `face-js`:
- P3 button shows `[JS HANDOFF]` label with italic teal styling and `⟨JS⟩` suffix
- JS Module text field appears below the peek type dropdown (`#js-handoff-row`)
- `jsHandoffModule` string stored in project data (e.g. "SoupKitchen", "PressureWash")
- Export CSS header includes `peekType: face-js` and `jsHandoff: <module>` metadata
- Serialization: v3 format includes `peekType` and `jsHandoffModule` fields

Phase sequence for JS handoff variants:
```
ENTRY:  P1 (entry anim) → P2 (anticipation) → P3 [JS TAG: blank, minigame takes over]
EXIT:   P4 (exit transition) → P2 reverse → P1 reverse
```

Reverse playback is documented in the model but not yet implemented as a runtime preview feature — the Play Sequence button (§6 below) will handle this.

---

### 5. Export Pipeline Bugs — DONE (verified 2026-04-09)

All six issues from `docs/BOXFORGE_AUDIT.md` (2026-04-07) are resolved in the current codebase:

| # | Bug | Fix Location |
|---|---|---|
| 5a | Structural panes missing `opacity` | Line 5037: alpha < 100 check |
| 5b | Structural panes missing `biomeTag` + `labelText` | Lines 5028-5029: comment header |
| 5c | Lid panes missing `background` | Line 5073: `getTextureBg(p)` |
| 5d | Lid panes missing `opacity` | Line 5074: alpha < 100 check |
| 5e | Extra pane spin missing `@keyframes` | Lines 5120-5126: block emitted |
| 5f | Wiring notes never exported | Lines 5040, 5078, 5117 (per-pane) + 5359-5368 (summary) |

Cosmetic issues also resolved:
- Glow `shape` in dirty-label revert list (line 6116: `.concat(['color', 'shape'])`)
- Shell color input `isColor` guard (lines 2387-2388)

---

## Planned Work

### 6. Play Sequence Button — Priority: High

Auto-cycles through phases at configurable timing so the designer sees the full animation as a player would.

Requirements:
- "Play Sequence" button in the state bar area
- Per-phase dwell time sliders (default: P1=300ms, P2=150ms, P3=hold, P4=300ms)
- Forward sequence: P1→P2→P3→P4 (skipping disabled phases per peek type)
- Reverse sequence: P3→P2→P1 (or P4→P2→P1 for JS handoff)
- **JS handoff preview**: P1→P2→[HANDOFF PLACEHOLDER 1s]→P4→P2→P1 with a visual gap/marker for the JS portion
- Loop toggle: repeat sequence continuously
- Stop button to return to manual phase selection

The orb, pyramid, and phase animation states all need to transition smoothly — not just snap between phases. This means either CSS transition injection or JS-driven interpolation between phase configs.

### 7. Lasso / Multi-Select Tool — Priority: High (depends on DataModel extract)

Currently BoxForge supports one selected pane at a time (`selectedPaneId`).

**Data model change:**
```javascript
// Replace single selection with set-based:
var selectedPaneIds = new Set();
var _primaryPaneId = null;  // anchor pane for property panel display
// Compat shim: get selectedPaneId() { return _primaryPaneId; }
```

**Phase A — Multi-select state**
- `selectedPaneIds: Set<number>`
- Shift+click toggles pane in/out of set
- Clicking empty space clears selection
- All existing `selectedPaneId` reads get compat shim

**Phase B — Marquee selection**
- Mousedown on viewport starts a semi-transparent selection rectangle overlay
- Mousemove resizes it
- Mouseup: hit-test all `.pane3d` elements via `getBoundingClientRect()` against marquee
- Overlapping panes join the selection set

**Phase C — Group operations**
- Arrow keys: nudge all selected panes by same delta
- Delete key: remove all selected non-structural panes
- Property panel: show shared properties with "mixed" indicator when values differ
- Snap: snap selection group as a unit (maintain relative offsets)

**Phase D — Clipboard**
- Ctrl+C: serialize selected panes to JSON on clipboard
- Ctrl+V: paste at current face with offset to avoid exact overlap

**UI additions:**
- Selection count badge in pane list header: "3 selected"
- Blue tint on selected pane DOM elements (alongside existing yellow `.selected` outline)
- "Select All on Face" button or Ctrl+A behavior

### 8. Pane-to-Box Conversion — DONE (April 9, 2026)

Promote an existing pane into a **nested sub-box** whose dimensions match the pane. The sub-box has its own 6 faces, its own glows, and its vertices are "glued" to the parent box's geometry at the connection seam.

**Why this matters:** Dungeon Gleaner's world items (chests, bookshelves, crates, wardrobes) are CSS 3D boxes. A wardrobe is a bookshelf-box welded to a door-box. A chest-of-drawers is a chest-box with 3 drawer-boxes glued to the front. Without pane-to-box, composite objects require manual assembly from loose panes.

**Data model — nested boxes:**
```javascript
makePane({
  ...existing props...,
  childBox: null   // or a full box descriptor:
  // childBox: {
  //   shell: { bw, bh, bd, ... },
  //   panes: [...],
  //   glows: [...],
  //   glueEdges: ['top','left','right','bottom']
  // }
});
```

**"Glue" semantics:**
- Child box face at the glue seam is hidden (no z-fighting)
- Moving parent pane moves child box with it
- Resizing parent pane resizes the glued face to match
- Snap-to treats glued edges as immovable constraints

**Phase A — Promote pane to box**
- Right-click or button: "Convert to Box"
- Creates childBox with shell.bw = pane pw, shell.bh = pane ph, shell.bd = user-specified depth
- 6 default structural panes; back face (glued to parent) hidden
- Parent pane becomes a portal rendering the child box

**Phase B — Glue constraint system**
- `glueEdges` array on child box
- Resize propagation: parent pw change → child bw change
- Position propagation: parent ox/oy/oz → child box moves
- Constraint solver runs after any property change

**Phase C — Recursive nesting**
- Child box panes can themselves be promoted
- Depth limit: 3 levels (mirrors game floor hierarchy)
- Render traverses tree: parent → child → grandchild

**Phase D — Flatten / Detach**
- "Detach" extracts child box into standalone template
- "Flatten" merges child panes back into parent as extra panes

---

## Deferred Work

### 9. Revolution Presets (Pyramid Spread + Spin Tuning)

Documented in `BOXFORGE_NEXT_STEPS.md` §11.1. Preset buttons that configure pyramid spread + spin speed for crank/pump/fan animations in one click:

| Preset | Spread | Spin Speed | Use Case |
|---|---|---|---|
| Slow Crank Idle | 10–15° | 2–3s/rev | Lazy windmill |
| Active Cranking | 8–12° | 0.5–1s/rev | Fast fan from player input |
| Pump Handle | 20–25° | Variable | Asymmetric oscillation |
| Pressure Nozzle | 5–8° | 0.3s/rev | Tight spiral, high-pressure jet |
| Ladle Stir | 15–20° | 1.5–2s/rev | Medium fan with colour shift |
| Bellows Pump | 25–30° | Variable | Wide spread, ember burst |

Also includes speed ramp curve / `tapSpeedMult` parameter linking spin speed to player input rate.

### 10. Micro-Peek Descriptor Panel

Sidebar section for Micro Step-On and Micro Face-To types mapping 1:1 to MicroPeekDescriptor schema: duration slider (250–1200ms), entry/exit anim dropdowns, particles dropdown, sound key field, scale slider (0.3–1.0), offset Y slider.

### 11. Context Gate Editor

For tiles with conditional peek types (TORCH_LIT, BED): gate condition dropdown, Gate A/B labels, per-gate peek type and phase config, dual-variant export.

### 12. Action/Multi-Button Overlay Preview

Display-only mock button overlays to verify box geometry doesn't overlap the action button at any phase. Single-button for action peeks, 2–4 button for full peeks.

### 13. Variant Batch Export

"Export All Templates" button dumping every saved template's CSS + descriptor JSON into a single file. Template tagging by tile ID and peek type.

### 14. Orb State Presets

Template fragments configuring only the orb across phases: "Torch Lit→Ember→Smoke", "Torch Restock", "Rest Bonfire". Leave box shell untouched.

---

## Refactoring Plan

### Current State

`peek-workbench.html` is a single 7,074-line file containing ~250 lines CSS, ~140 lines HTML, ~6,700 lines JS in one IIFE. The JS has ~20 logical sections (marked by `═══` banners) all sharing closure scope.

### Strategy

BoxForge must stay a **single HTML file** (no build tools). Internal structure uses a **section-IIFE pattern** where each logical section is a sub-IIFE with explicit interface:

```javascript
var DataModel = (function(colors) {
  var panes = [];
  function makePane(opts) { ... }
  return { panes: panes, makePane: makePane, ... };
})(colors);

var Renderer = (function(model, shell) {
  function render() { ... /* reads model.panes */ }
  return { render: render };
})(DataModel, shell);
```

### Proposed Section Boundaries

| Section | Lines (est.) | Owns |
|---|---|---|
| **Styles** | ~250 | `<style>` block |
| **Markup** | ~140 | `<div>` sidebar structure |
| **DataModel** | ~350 | `shell`, `colors`, `panes`, `glows`, `makePane`, `makeGlow`, orb/pyramid config, peekType, jsHandoffModule |
| **Templates** | ~700 | `TEMPLATES` registry, `loadTemplateData`, `snapshotDefaults`, `serializeProject` (v3) |
| **Selection** | ~200 | `selectedPaneIds`, multi-select state, lasso marquee |
| **PropPanel** | ~450 | `selectPane`, `setPPVal`, slider wiring, dirty labels, click-to-revert |
| **SnapSystem** | ~200 | `snapOffset`, `getNeighbors`, `getPaneRect`, snap UI |
| **Renderer** | ~550 | `render()`, `getFaceTransform`, `getTextureBg`, `applyPaneSpin`, `getPaneRotSuffix` |
| **GlowPanel** | ~200 | Glow property wiring, `syncGlowChildUI` |
| **OrbRenderer** | ~350 | `renderOrb`, geodesic math, orb panel wiring |
| **PyramidRenderer** | ~250 | `renderPyramid`, pyramid panel wiring |
| **Exporter** | ~500 | `exportCSS()`, all export pipeline code, v3 metadata |
| **PhaseAnims** | ~200 | Phase button wiring, animation toggles, `PEEK_PHASE_MAP`, `updatePhaseLabels` |
| **PeekTypeUI** | ~150 | `syncPeekTypeUI`, peek type change handler, badge, JS handoff row |
| **CompositeBox** | ~300 (new) | Pane-to-box promotion, glue constraints, recursive render |
| **Init** | ~100 | Boot sequence, first template load |

### Execution Order

1. ~~Fix Snap-To~~ ✅
2. ~~Peek Type + P4 + JS Handoff~~ ✅
3. ~~Export pipeline bugs~~ ✅ (all resolved in current codebase)
4. ~~Pane-to-Box~~ ✅
5. **Extract DataModel** — prerequisite for clean feature work
6. **Play Sequence button** — needed to validate phase transitions
7. **Extract Selection → Build Lasso** — enables group workflows
8. **Extract Renderer** — polish pass

### Rules of Engagement

1. **Never break the single-file constraint.** All refactoring stays inside `peek-workbench.html`.
2. **One section at a time.** Extract, test, commit. Never refactor two sections in the same pass.
3. **Preserve the `cp peek-workbench.html boxforge.html` workflow.** The canonical copy stays in sync.
4. **Section-IIFEs are optional encapsulation, not mandatory.** If a section is small and stable, a banner comment is fine. Don't over-engineer structure for its own sake.
5. **Tests are visual.** Load a template, check the render, export, check the CSS. There's no test harness — the browser IS the test harness.

---

## Dependency Graph

```
              ┌──────────────────────────────────────┐
              │  Snap-To Fix           ✅ DONE       │
              │  Peek Type + P4 + JS   ✅ DONE       │
              │  Export Pipeline Bugs   ✅ DONE       │
              │  Pane-to-Box            ✅ DONE       │
              └──────────────┬───────────────────────┘
                             │
              ┌──────────────▼───────────────────────┐
              │  DataModel Extract     ← next         │
              └──────┬───────────────┬───────────────┘
                     │               │
           ┌─────────▼──┐  ┌─────────▼──────────┐
           │  Play       │  │  Selection Extract  │
           │  Sequence   │  │  → Lasso            │
           └─────────────┘  └────────────────────┘
                     │               │
           ┌─────────▼──────────┐    │
           │  Renderer Extract  │◄───┘
           └────────────────────┘
```

---

## Open Questions

- **Cross-face snap**: Should snap detect edges across face seams (left-face right-edge ↔ back-face left-edge)? Geometrically complex — defer unless it blocks a specific template.
- **Nested box depth limit**: 3 levels mirrors the game's floor hierarchy. Sufficient for wardrobe/chest-of-drawers composites.
- **Lasso in 3D**: `getBoundingClientRect()` works for screen-space hit testing but may feel unintuitive when the box is rotated significantly. Consider a "flatten view" mode for precise selection.
- **Undo system**: Current undo uses `pushUndo()`/`popUndo()` with full state snapshots. This covers single-pane edits but may need optimization for group operations (lasso moves touching 10+ panes per frame).
- **Play Sequence interpolation**: Should phase transitions snap (current behavior) or interpolate (CSS transitions between phase configs)? Snapping is simpler and matches the game's discrete phase model; interpolation would look smoother in the preview but misrepresent runtime behavior.

# Unified UI/HUD Overhaul — Dungeon Gleaner

> Consolidates: VISUAL_OVERHAUL.md direction, HUD_ROADMAP phases, UI_ROADMAP P6/P7,
> EyesOnly CSS theme architecture, HYBRID-LAYOUT-SPEC desk/paper diorama,
> RESOURCE_COLOR_SYSTEM palette, gone-rogue cursor hijack tutorial pattern.

**Date:** 2026-03-31
**Status:** Active — jam deadline April 5

---

## Design Pillars

1. **Ironic Gap** — Spy framing, janitor reality. Three verbs: Clean (laminated checklists), Restock (corporate inventory forms), Endure (caution tape, hi-vis).
2. **Paper/Hazmat/CRT trichotomy** — HUD and menus get the clipboard-and-sticky-note treatment. Only minimap + debrief feed retain CRT phosphor aesthetic. Everything else is deskspace brown, hazmat yellow, line-ruled paper with clear tape labels.
3. **Geriatric / mobile-first sizing** — Board-game-sized tiles of data with icons, colors, glowing empty slots. Viewport crowds to 1/3 screen; HUD panels fill the rest.
4. **System font legibility** — Courier/monospace ONLY for in-game documents, CRT screens, titles. Quick HUD text and all important readouts use a legible system font stack.

---

## Color Palette

### Paper/Desk surface
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#f5f0e8` | HUD panel backgrounds |
| `--paper-ruled` | `#c8d0e0` | Faint blue ruled lines |
| `--ink` | `#2a2520` | Primary text on paper |
| `--ink-dim` | `#8a8078` | Secondary/faded text |
| `--desk-brown` | `#6b5b4a` | Panel borders, tab edges |
| `--clipboard-blue` | `#4888c0` | Section headers, folder tabs |
| `--hazmat-yellow` | `#f0c830` | Warnings, caution tape accents |
| `--stamp-red` | `#c04040` | URGENT stamps, HP critical |
| `--check-green` | `#48a858` | Completions, positive status |
| `--tape-clear` | `rgba(255,255,248,0.35)` | Scotch tape label overlays |

### CRT (minimap + debrief only)
| Token | Hex | Use |
|---|---|---|
| `--phosphor` | `#33ff66` | Primary CRT text |
| `--phosphor-dim` | `#1a7a33` | Faded CRT text |
| `--crt-bg` | `#0a0f0a` | CRT background |
| `--crt-scanline` | `rgba(0,0,0,0.12)` | Scanline overlay opacity |

### Resource colors (from RESOURCE_COLORS.md)
| Resource | Color | Symbol |
|---|---|---|
| HP | `#FF6B9D` | ♥ |
| Energy | `#00D4FF` | ⚡ |
| Battery | `#00FFA6` | ◆ |
| Currency | `#FFFF00` | ● |
| XP | `#C88FFF` | ★ |

---

## Font Topology

```
--font-display:  'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
--font-body:     -apple-system, 'Segoe UI', system-ui, Roboto, sans-serif;
--font-data:     ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, monospace;
--font-crt:      'Courier New', Courier, monospace;
```

| Context | Font var | Rule |
|---|---|---|
| In-game documents, book peeks | `--font-display` | Serif, literary feel |
| CRT screens (minimap label, debrief) | `--font-crt` | Monospace, green phosphor |
| HUD readouts, quick bar, status bar | `--font-body` | Legible sans-serif |
| Numeric data, card stats, resource counts | `--font-data` | Monospace but modern/legible |
| Title screen, splash | `--font-crt` | Retains existing Courier aesthetic |

---

## Phase Plan

### Phase 1: Theme CSS Foundation + Font Swap
**Files:** `index.html` (`:root` CSS vars), all HUD modules

1. Add `:root` CSS variable block with full paper/CRT/resource palette
2. Add font-face stacks as CSS vars
3. Swap `font-family: 'Courier New', monospace` → `var(--font-body)` on `html, body`
4. Keep Courier on `#splash-overlay`, `#minimap-frame`, `#debrief-feed`
5. Apply `--paper` background + `--ink` color to `#status-bar`, `#quick-bar`, `#card-tray`
6. Paper ruled-line background on status bar tooltip area (CSS repeating gradient)
7. Scotch-tape label effect on quick-bar slot labels (tape-clear overlay + slight rotation)

### Phase 2: Gut Intro Walk → Cursor Hijack Tutorial
**Files:** `engine/intro-walk.js` (rewrite), `engine/game.js` (_startIntroWalk)

Adapt EyesOnly's `onboarding-tutorial.js` 10-phase cursor hijack into DG's IIFE architecture:

1. **Phase 1** (0ms): Player has free input immediately. Timer starts.
2. **Phase 2** (350ms): Toast "👆 Click the minimap to move" + overhead hint
3. **Phase 3** (500ms): Cursor hijack overlay — fake cursor appears over minimap with glitch effect
4. **Phase 4** (650ms): Fake cursor animates from player position on minimap to the DOOR tile (19,5) using recorded macro curve with organic overshoot
5. **Phase 5** (950ms): Tap-ring animation at target tile + path dots drawn on minimap (fishing line)
6. **Phase 6** (1750ms): MinimapNav auto-walks the computed path. Toast: "REPORT FOR DUTY."
7. **Phase 7**: If player clicks anything before Phase 6, abort demo → Toast "Nice! Keep exploring." → free play continues naturally
8. **onComplete**: Same as current — trigger DoorAnimator + FloorTransition.go('1', 'advance')

Key differences from EyesOnly version:
- Target is minimap canvas, not grid container (we're a first-person game)
- Uses MinimapNav.navigateTo() instead of GoneRogueMobile tap-move
- Coordinate conversion via minimap's tile-to-pixel mapping
- Cursor overlay positioned over minimap-frame element specifically
- No sprint demo (DG doesn't have sprint)

### Phase 3: HUD Resize — Geriatric Mobile-First
**Files:** `index.html` CSS

1. Minimap frame: 200px → 240px on desktop, 180px minimum on mobile
2. Status bar: increase font to 16px body, 20px resource numbers
3. Quick bar slots: 56px → 72px tiles with 24px icons
4. Card tray slots: 48px → 64px with suit icon + glow empty animation
5. Debrief feed: 14px → 16px, increase line-height to 1.6
6. NCH widget badges: 14px → 18px
7. Viewport constraint: `max-width: 38vw; max-height: 60vh` on desktop (crowd it)
8. Resource numbers use `--font-data` at 22px with resource color from palette
9. Empty slots get pulsing `box-shadow: 0 0 8px var(--hazmat-yellow)` glow

### Phase 4: Paper UI Panels
**Files:** `index.html` CSS, potentially `engine/status-bar.js`, `engine/quick-bar.js`

1. Status bar → clipboard aesthetic: `--desk-brown` border-top, `--paper` background, ruled lines via repeating-linear-gradient(180deg, transparent 23px, var(--paper-ruled) 23px, var(--paper-ruled) 24px)
2. Quick bar → manila folder tabs: `--desk-brown` border with `border-radius: 8px 8px 0 0` tab tops, `--paper` fill
3. Card tray → laminated playing cards: slight rounded corners, `--tape-clear` shine overlay, `--paper` background, suit icons in resource colors
4. Tooltip area → sticky note: `--hazmat-yellow` background, slight 1-2deg rotation, `--ink` text, small drop shadow
5. Debrief feed header → CRT monitor bezel: keep `--crt-bg` with scanlines, `--phosphor` text
6. Bag button → stamp aesthetic: `--stamp-red` border, rotated 2deg, uppercase

### Phase 5: Shop/Dungeon Workflow (UI_ROADMAP P6/P7)
**Files:** `engine/shop.js`, `engine/merchant-peek.js`, new `engine/vendor-dialog.js`

**P6 — Vendor NPC Dialogue & Bulk Sale:**
1. Vendor greeting dialog on first peek (3-line NPC speech with portrait placeholder)
2. "SELL ALL JUNK" bulk action button (filters bag for vendor-buyable items)
3. Sale receipt toast with haul commentary ("That's 47 salvage for 12 items — not bad, Gleaner.")
4. Rep tier-up ceremony (visual + audio flourish when vendor trust increases)

**P7 — Shop-as-Hub Polish:**
1. Bag-fullness HUD badge on status bar (e.g., "BAG 9/12" turns `--stamp-red` at 80%+)
2. Per-floor shop state: vendors remember stock between visits
3. Restock ticker: vendors slowly restock over time (shown as "RESTOCK IN: 3 turns")
4. Wandering vendor encounter (rare, spawns on dungeon floor with limited stock)

### Phase 6: D-Pad Mobile Landscape Repositioning
**Files:** `index.html` CSS, `engine/dpad.js`

1. D-pad moves from bottom-center to right-thumb area: `right: 16px; bottom: 80px;`
2. Increase button sizes for thumb targets: 56px → 72px
3. Add `@media (orientation: landscape) and (max-width: 1024px)` breakpoint
4. On landscape mobile, viewport takes left 60%, HUD panels stack right 40%
5. D-pad overlays bottom-right of viewport area

### Phase 7: Theme Variety for Books/Restock/Puzzle Screens
**Files:** peek modules (`bookshelf-peek.js`, `merchant-peek.js`, `puzzle-peek.js`)

Leverage CSS var overrides to theme each peek screen differently:
1. **Book peek**: `--font-display` serif, `--paper` parchment background, decorative border
2. **Merchant/restock peek**: `--font-body` legible, `--hazmat-yellow` header stripe, clipboard grid layout
3. **Puzzle peek**: `--font-data` monospace, `--crt-bg` dark background, `--phosphor` green text, CRT scanlines
4. **Crate peek**: `--desk-brown` wood background, stencil-stamp labels
5. **Bar counter peek**: warm amber tint, `--font-display` for menu items

---

## Execution Order (Jam Priority)

| Priority | Phase | Effort | Impact |
|---|---|---|---|
| 🔴 NOW | Phase 1: Theme CSS + Fonts | 30min | Foundation for everything |
| 🔴 NOW | Phase 2: Cursor Hijack Tutorial | 45min | Replaces broken intro walk |
| 🟡 HIGH | Phase 3: HUD Resize | 30min | Playability |
| 🟡 HIGH | Phase 4: Paper UI Panels | 40min | Visual identity |
| 🟢 MED | Phase 5: Shop Workflow P6 | 45min | Gameplay loop |
| 🟢 MED | Phase 6: D-Pad Mobile | 15min | CSS only |
| 🔵 LOW | Phase 5: Shop Workflow P7 | 60min | Polish |
| 🔵 LOW | Phase 7: Theme Variety | 30min | Polish |

# Peek Box Visual Audit — Geometry, Glow, Texture, Lid

**Created**: 2026-04-04
**Context**: All peek modules use BoxAnim's CSS 3D box system. The splash screen box (200×200 cube) is the gold standard for geometry — all faces meet cleanly, glow is volumetric, textures tile. Other variants degrade from there. Deadline is tomorrow so this doc separates "easy CSS fix" from "geometry rework (post-jam)."

---

## Gold Standard References

| Quality | Best Example | Why |
|---------|-------------|-----|
| **Geometry** | Splash (200×200 cube, `--box-d:100px`) | Square box = all faces same size, default transforms just work. No face-sizing overrides needed. |
| **Glow** | Torch-peek (amber) + Splash (blue) | 3-plane volumetric orb (`gp0/gp1/gp2` at 0°/60°/120°), `::before`/`::after` floor radials, `glow-pulse` animation. Rich layered `radial-gradient` in `.box3d-glow`. |
| **Textures** | Door (`door-variant`) | Only variant with multi-layer CSS textures on side faces (plank grain). Splash also has circuit-rune grid overlay. Everything else is flat `linear-gradient`. |
| **Lid** | Door (hinge-left `rotateY(-80deg)`) | Feels like opening a real door. Crate slide (`translateX(100%)`) is correct for its analogy. Chest hinge-bottom (`rotateX(-135deg)`) works for a treasure chest lid. |

---

## Per-Module Audit Matrix

### Legend
- ✅ Working well
- ⚠️ Functional but visually weak — easy CSS fix
- ❌ Broken or wrong — needs variant change or geometry work
- 🎯 Easy target (CSS-only, no JS change)
- 🔧 Medium (JS variant change + CSS)
- 🏗️ Hard (new CSS variant needed)

| Module | Variant Used | Correct Variant? | Geometry | Glow | Textures | Lid Behavior | Color Match | Priority |
|--------|-------------|-------------------|----------|------|----------|-------------|-------------|----------|
| **splash** | `splash` (HTML) | ✅ | ✅ Perfect cube | ✅ Rich 3-plane orb | ✅ Circuit-rune grid | ✅ Hinge-bottom | ✅ Arcane blue | — |
| **chest-peek** | `chest` | ✅ | ✅ 200×140, clean | ⚠️ Decent | ⚠️ Smooth gradient only | ✅ Hinge-bottom | ✅ Gold/amber | Low |
| **door-peek** | `door` | ✅ | ⚠️ 260×380, edges close | ✅ Warm parchment | ✅ Plank grain | ✅ Hinge-left Y-axis | ✅ Direction-aware | Low |
| **locked-door** | `locked` | ✅ | ⚠️ Same as door | ⚠️ Red, flat-ish | ⚠️ Flat dark iron | ✅ Shake (no open) | ✅ Crimson | Low |
| **crate-peek** | `crate` | ✅ | ❌ 420×260, faces gap at edges | ⚠️ Amber, thin | ✅ Cross-grain planks | ⚠️ Slide-right, tilt on hover | ✅ Wood amber | Medium |
| **torch-peek** | `crate` | ❌ Wrong | ❌ Same broken crate geo | ✅ Best glow (amber) | ⚠️ Gets crate's wood planks | ❌ Slides right (torch ≠ crate) | ⚠️ Amber OK but generic | High |
| **corpse-peek** | `crate` | ❌ Wrong | ❌ Same broken crate geo | ⚠️ Purple tint via JS | ⚠️ Gets crate's wood planks | ❌ Slides right (coffin should hinge) | ❌ Crate brown not coffin grey | High |
| **merchant-peek** | `crate` | ❌ Wrong | ❌ Same broken crate geo | ⚠️ Faction tint via JS | ⚠️ Gets crate's wood planks | ❌ Slides right (shop ≠ crate) | ⚠️ Faction glow OK, faces wrong | High |

---

## Root Cause Analysis

### Why crate geometry is broken
The crate variant is **420×260** (wide landscape) with `--box-d: 90px` viewed from `rotateX(-42deg) rotateY(18deg)` — an extremely steep top-down angle. At this perspective + size, small CSS rounding errors create visible gaps where faces should meet. The side faces (`bf-left`/`bf-right`) are sized `2×box-d = 180px` tall but the container is only 260px tall, so under perspective projection the depth faces don't span the full visual height. The splash box works because it's a **perfect cube** (200×200×200) — all faces are the same size and default `width:100%; height:100%` works everywhere.

### Why 3 modules reuse the wrong variant
Torch, corpse, and merchant peeks were scaffolded with `BoxAnim.create('crate', ...)` as placeholders. Each needs its own visual identity:

| Module | Should Feel Like | Ideal Variant |
|--------|-----------------|---------------|
| torch-peek | Wall sconce / lantern bracket | `chest` (compact, hinge-bottom lid = opening the oil reservoir) or new `sconce` variant |
| corpse-peek | Coffin / burial casket | `chest` (hinge-bottom lid = coffin lid swinging open) with coffin colors (grey/purple) |
| merchant-peek | Market stall / vendor booth | `chest` (compact box, lid opens to reveal wares) with faction colors |

**Key insight**: The `chest` variant (200×140, hinge-bottom) is the right *shape* for all three. The `crate` variant was only ever correct for the actual breakable crate.

---

## Fix Plan — Prioritized by Effort

### Tier 1: Easy CSS-only glow/color fixes 🎯 (do now)

These require zero JS changes — just override `--box-glow` and face styles in the peek's post-create styling.

1. **locked-door-peek**: Glow is flat because `--box-glow` is set but `.box3d-glow` radial gradient isn't overridden. Add a richer red interior gradient.

2. **chest-peek**: Interior glow is the generic blue default. Should inherit the gold `--box-glow` into a richer `radial-gradient`.

### Tier 2: Switch variant `crate` → `chest` 🔧 (do now — 1 line JS + color overrides)

For torch, corpse, and merchant peeks, change `BoxAnim.create('crate', ...)` to `BoxAnim.create('chest', ...)`. This immediately fixes:
- Geometry (200×140 clean non-square vs 420×260 broken)
- Lid behavior (hinge-bottom open vs slide-right)
- Perspective angle (default -25°/20° vs steep -42°/18°)

Then override colors in the post-create JS styling:

**torch-peek**: Already has good glow. Switch to chest, override `--box-dark:#3a2008`, `--box-light:#c88030`, `--box-glow:rgba(220,160,50,0.6)`.

**corpse-peek**: Switch to chest, override `--box-dark:#1a1020`, `--box-light:#4a3860`, `--box-glow:rgba(140,100,180,0.5)`, hue-rotate faces for coffin look (already does this).

**merchant-peek**: Switch to chest, keep faction-color system as-is (already overrides `--box-glow` per faction).

### Tier 3: Fix crate geometry 🏗️ (post-jam)

The actual crate-peek (BREAKABLE tile) needs its own geometry fix:
- Option A: Reduce crate size from 420×260 to ~280×200, increase `--box-d` proportionally
- Option B: Add explicit `transform-origin: center center` on all faces + translateZ corrections
- Option C: Switch crate to `perspective: 1200px` to reduce edge distortion at the steep angle

### Tier 4: New CSS variants (post-jam)

For maximum visual distinction, each peek *could* get its own CSS variant class with unique textures:
- `sconce-variant`: Wrought-iron bracket texture, warm amber glow through grid holes
- `coffin-variant`: Stone/dark wood grain, spectral green interior, iron bands
- `stall-variant`: Colorful cloth/canvas awning texture, faction-colored banner

These are polish — the Tier 2 fix (→ `chest`) is 90% of the improvement for 5% of the work.

---

## Glow Comparison

The splash box has the richest glow because its `.box3d-glow` uses a **multi-stop radial gradient** with high alpha at center:

```css
/* Splash — RICH */
background: radial-gradient(circle,
  rgba(180,180,255,0.7) 0%,      /* bright core */
  rgba(140,140,255,0.4) 30%,     /* mid glow */
  rgba(96,96,232,0.15) 60%,      /* falloff */
  transparent 100%);

/* Chest — GENERIC (falls back to default blue!) */
background: radial-gradient(circle,
  rgba(255,200,80,0.7) 0%,
  rgba(220,160,40,0.3) 40%,
  transparent 80%);

/* Crate — THIN */
background: radial-gradient(circle,
  rgba(220,160,50,0.5) 0%,       /* dimmer core */
  rgba(180,120,30,0.2) 50%,      /* fast falloff */
  transparent 80%);
```

**Fix**: Every peek variant's `.box3d-glow` should use the 4-stop pattern from splash, just recolored. The 3 glow-planes (`gp0/gp1/gp2`) inherit via `background: inherit`, so one CSS override propagates to the full volumetric orb.

---

## Viewport Texture Color Matching

Each peek box should match the tile's in-viewport rendering color so the transition feels coherent:

| Peek | Viewport Tile Color | Box Glow Should Be | Currently |
|------|-------------------|-------------------|-----------|
| crate | Wood amber (#c49a40) | Warm amber ✅ | rgba(200,150,60) ✅ |
| chest | Gold (#ffd040-ish) | Rich gold | rgba(255,200,80) ✅ |
| door | Parchment/wood | Warm parchment ✅ | Direction-aware ✅ |
| locked-door | Dark iron + red lock | Deep crimson | rgba(220,60,40) ✅ |
| torch | Flame orange (#ff8020) | Hot amber/orange | rgba(200,150,60) ⚠️ too yellow, needs more orange |
| corpse | Grey stone + purple mist | Spectral purple | rgba(140,100,180) ✅ |
| merchant | Per-faction | Per-faction ✅ | Faction map ✅ |
| puzzle | Blue rune glow | Cool blue | (no BoxAnim — DOM panel) N/A |

---

## Summary: What to Do Right Now

1. **Switch torch/corpse/merchant from `crate` → `chest` variant** (3× one-line JS change)
2. **Override face colors** on each to match their identity (JS `style.setProperty` calls, already partially done)
3. **Enrich glow gradients** in CSS for chest variant (add `.box3d-wrap.chest-variant .box3d-glow` 4-stop pattern)
4. **Document crate geometry** as known post-jam issue
5. **Ship it** — chest variant with color overrides will look 80% better than broken crate geometry

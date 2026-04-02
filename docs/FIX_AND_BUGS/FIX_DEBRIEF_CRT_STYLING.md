# FIX_DEBRIEF_CRT_STYLING.md

## Problem

The debrief feed panel (left column, smartwatch-style status display) was given bigger font sizes as a Band-Aid fix, but this doesn't address the core issues:

- **Too much dead space** — margins and padding waste pixels that should be used for content density
- **Wrong font family** — currently uses Courier, which is the "paper typewriter" font. CRT/terminal aesthetics require a console font (Consolas, Monaco, Classic Console Neue)
- **No CRT aesthetic** — missing scanline overlay, phosphor green color scheme, and terminal-style layout
- **Layout is not optimized** — stat rows and gauge rows don't follow the dense, pixel-efficient EyesOnly debrief architecture
- **Not matching EyesOnly reference** — the production codebase has a proven CRT smartwatch debrief with container queries, Unicode block gauges, and aggressive spacing

The entire panel needs a complete restyle matching EyesOnly's debrief architecture: tight container aspect ratio, console font stack, phosphor green colors, scanline overlay, and Unicode block character gauges.

## Root Cause

**Font family mismatch:**
- Current debrief CSS uses Courier or a serif font (checked in `index.html` `<style>` block)
- Courier is the "paper" font per UNIFIED_UI_OVERHAUL typography rules
- CRT/terminal interfaces require console fonts: Consolas, Monaco, or Classic Console Neue
- This breaks the visual language immediately

**Spacing and layout inefficiency:**
- Debrief feed likely has standard HTML margins (16px default)
- Gap between rows is probably 4px or the browser default line-height
- Results in dead space that pushes content off-screen or requires scrolling

**No CRT visual language:**
- Missing scanline overlay (repeating-linear-gradient stripe pattern)
- No phosphor green color scheme (#33ff33 primary, dim variants at 60% opacity)
- Background is probably white or a light gray, not near-black with subtle green tint

**Gauge rendering is primitive:**
- Likely using HTML `<progress>` elements or simple `<div>` bars
- Should use Unicode block characters: █ (full), ▒ (partial), ░ (empty)
- Current approach doesn't leverage the monospace font or CRT aesthetics

**Container aspect ratio not defined:**
- Debrief should be 4:3 portrait (smartwatch-like)
- No container query support for responsive scaling

**EyesOnly reference not applied:**
- EyesOnly's debrief uses container queries (`cqh` units), right-justified labels, fixed-width columns
- Letter-spacing computed via canvas `measureText()` to fill available width
- These proven techniques are not in Dungeon Gleaner's debrief

## Files to Modify

1. **`index.html`** — Debrief feed CSS styles (inline in `<style>` block)
   - Font-family stack replacement
   - Container aspect ratio and type
   - Padding/margin reset
   - Colors (phosphor green scheme)
   - Scanline overlay pseudo-element
   - Container query rules

2. **`engine/debrief-feed.js`** (or equivalent debrief module)
   - `_renderUnified()` method — main render function
   - `_fullBar()` or `_gaugeRow()` — replace HTML bars with Unicode block characters
   - `_pipRow()` — tighten pip spacing
   - `_statRow()` or stat rendering — tight single-line layout
   - Any gauge/resource bar rendering

## Implementation Steps

### Step 1: Update Font Family in index.html

In the `<style>` block of `index.html`, locate the debrief feed CSS rule (likely `#debrief-feed` or `.debrief-container`):

**Before:**
```css
#debrief-feed {
  font-family: Courier, monospace;
  /* ... other rules ... */
}
```

**After:**
```css
#debrief-feed {
  font-family: 'Classic Console Neue', 'Consolas', 'Monaco', 'Lucida Console', monospace;
  /* ... other rules ... */
}
```

**Rationale:** Classic Console Neue is the ideal console font. Consolas and Monaco are OS-bundled alternatives. Do NOT use Courier or Courier New — they are serif "paper" fonts, not CRT fonts.

### Step 2: Set Container Aspect Ratio and Type

Add container configuration to `#debrief-feed`:

```css
#debrief-feed {
  font-family: 'Classic Console Neue', 'Consolas', 'Monaco', 'Lucida Console', monospace;
  container-type: size;
  aspect-ratio: 3 / 4;        /* Portrait smartwatch: 3:4 */
  width: 100%;                /* Width driven by parent layout */
  position: relative;
}
```

This makes the container 25% taller than it is wide, matching a smartwatch form factor.

### Step 3: Reset Aggressive Spacing

Remove all default margins and set tight gaps:

```css
#debrief-feed {
  /* ... previous rules ... */
  padding: 5px;               /* Minimal padding */
  margin: 0;
  line-height: 1.1;           /* Tight line height */
}

#debrief-feed > * {
  margin: 0;                  /* Remove all margins from children */
}

.df-gauge-row,
.df-stat-row,
.df-avatar,
.df-label,
.df-value {
  margin: 0;
  padding: 0;
  gap: 2px;                   /* Tight 2px gaps between flex items */
}
```

### Step 4: Apply Phosphor Green Color Scheme

Add new CSS rules for the debrief color palette:

```css
#debrief-feed {
  /* ... previous rules ... */
  background-color: #0a0a0a;  /* Near-black with subtle green tint */
  color: #33ff33;             /* Phosphor green primary text */
}

#debrief-feed-header {
  color: #44ff44;             /* Brighter green for headers */
  border-bottom: 1px solid rgba(51, 255, 51, 0.2);
}

.df-gauge-row,
.df-stat-row {
  color: #33ff33;
  border: none;               /* Remove any borders unless needed */
}

.df-label {
  color: #33ff33;
}

.df-dim-text {
  color: rgba(51, 255, 51, 0.6);  /* Dim variant for secondary text */
}

.df-bar-full {
  color: #ff33cc;             /* HP: magenta/pink */
}

.df-bar-energy {
  color: #33ccff;             /* EN: cyan/blue */
}

.df-bar-battery {
  color: #33ff33;             /* BAT: phosphor green */
}
```

### Step 5: Add Scanline Overlay Pseudo-Element

Add an `::after` pseudo-element to create the CRT scanline effect:

```css
#debrief-feed::after {
  content: '';
  position: absolute;
  inset: 0;                   /* Cover entire container */
  pointer-events: none;       /* Don't interfere with interaction */
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.12) 2px,
    rgba(0, 0, 0, 0.12) 3px
  );
  z-index: 1;                 /* Layer on top of text */
}
```

Ensure all child elements have `position: relative; z-index: 2;` or higher so text appears above the scanlines.

### Step 6: Rewrite Gauge Rendering in debrief-feed.js

Locate the gauge rendering functions (typically `_fullBar()`, `_gaugeRow()`, or the main render method).

**Old approach (HTML divs):**
```javascript
// DON'T do this anymore
const bar = document.createElement('div');
bar.style.width = percentage + '%';
bar.style.backgroundColor = color;
```

**New approach (Unicode blocks):**

Create a helper function to render a gauge bar as a string:

```javascript
function _makeGaugeString(current, max, barLength = 10) {
  if (max === 0) return '░'.repeat(barLength);  // Empty bar
  const ratio = current / max;
  const fullChars = Math.floor(ratio * barLength);
  const partialChar = (ratio * barLength) % 1 > 0.5 ? '▒' : '░';
  const emptyChars = barLength - fullChars - (ratio === 1 ? 0 : 1);

  let bar = '█'.repeat(fullChars);
  if (fullChars < barLength && ratio !== 1) {
    bar += partialChar;
  }
  bar += '░'.repeat(Math.max(0, emptyChars));
  return bar;
}
```

In the gauge row rendering:

```javascript
function _renderGaugeRow(label, current, max, colorClass) {
  // Label: fixed-width 3 chars, right-aligned
  const labelPad = label.padStart(3);

  // Value: fixed-width 7 chars (e.g., "123/456"), right-aligned
  const valuePad = `${current}/${max}`.padStart(7);

  // Bar: 10-character Unicode block gauge
  const bar = _makeGaugeString(current, max, 10);

  // Combine: LABEL VALUE BAR
  const html = `
    <div class="df-gauge-row">
      <span class="df-label" style="width: 3ch;">${labelPad}</span>
      <span class="df-value" style="width: 7ch;">${valuePad}</span>
      <span class="df-bar ${colorClass}">${bar}</span>
    </div>
  `;
  return html;
}
```

**Applying to actual gauges (HP, EN, BAT):**

```javascript
// In the main render method:
const hpRow = _renderGaugeRow('HP', player.hp, player.maxHp, 'df-bar-full');
const enRow = _renderGaugeRow('EN', player.energy, player.maxEnergy, 'df-bar-energy');
const batRow = _renderGaugeRow('BAT', battery.current, battery.max, 'df-bar-battery');
```

### Step 7: Tighten Pip Row Layout

Locate the pip row (typically used for battery charge or status pips: ◈ / ◇):

**Before:**
```html
<span>◈</span> <span>◈</span> <span>◇</span>
```

**After:**
```html
<span style="letter-spacing: 1px;">◈◈◇</span>
```

Or directly in JavaScript:

```javascript
function _renderPipRow(filled, empty) {
  const pips = '◈'.repeat(filled) + '◇'.repeat(empty);
  return `<div class="df-pip-row" style="letter-spacing: 1px;">${pips}</div>`;
}
```

### Step 8: Rewrite Stats Row as Single Dense Line

Replace multi-line stat display with a single-line format:

```javascript
function _renderStatsRow(str, dex, stl) {
  const stats = `STR ${str} │ DEX ${dex} │ STL ${stl}`;
  return `<div class="df-stat-row">${stats}</div>`;
}
```

**CSS for stats row:**
```css
.df-stat-row {
  font-size: 14px;
  color: #33ff33;
  margin-top: 2px;
  margin-bottom: 2px;
}
```

### Step 9: Inline Currency Display

Add currency on its own tight row or inline with stats:

**Inline:**
```javascript
function _renderStatsRow(str, dex, stl, gold) {
  const stats = `STR ${str} │ DEX ${dex} │ STL ${stl} │ 💰 ${gold}g`;
  return `<div class="df-stat-row">${stats}</div>`;
}
```

**Or separate tight row:**
```javascript
const currencyRow = `<div class="df-currency-row">💰 ${player.gold}g</div>`;
```

### Step 10: Apply Container Query Scaling (Optional but Recommended)

For font sizes that scale with container height, add container query rules:

```css
@supports (container-type: size) {
  @container (min-height: 300px) {
    #debrief-feed {
      font-size: 14px;
    }
  }

  @container (max-height: 299px) {
    #debrief-feed {
      font-size: 12px;
    }
  }
}
```

If container queries are not supported, use a fixed font size (14px is reasonable for a smartwatch-scale debrief).

### Step 11: Remove All Courier References

Search `index.html` and any other CSS files for `Courier`:

```bash
grep -r "Courier" /path/to/project
```

Replace all occurrences of `Courier` or `Courier New` with the console font stack:
```
'Classic Console Neue', 'Consolas', 'Monaco', 'Lucida Console', monospace
```

### Step 12: Verify No Dead Space

After all changes, open the debrief feed in-game and visually confirm:
- No unused padding or margins between rows
- All stat values and gauge bars fit on a single line per row
- The 4:3 aspect ratio container is fully utilized
- No content is cut off or requires scrolling

## Acceptance Criteria

- [ ] Debrief panel uses a console/monospace font (Consolas, Monaco, or Classic Console Neue) — NOT Courier
- [ ] Phosphor green color scheme (`#33ff33`) applied to all primary text
- [ ] Scanline overlay visible on the panel (subtle dark stripes at 2Hz-like spacing)
- [ ] No dead space — all content is tight with 2px gaps between rows
- [ ] Gauge bars use Unicode block characters (█▒░) with resource-specific colors:
  - HP: magenta/pink (`#ff33cc`)
  - EN: cyan/blue (`#33ccff`)
  - BAT: phosphor green (`#33ff33`)
- [ ] 4:3 aspect ratio container (portrait smartwatch)
- [ ] Panel reads as a dense military CRT terminal / smartwatch display
- [ ] All stats (STR, DEX, STL), gauges (HP, EN, BAT), pips, and currency visible without scrolling
- [ ] Font sizes appropriate: readable at the panel's natural size without being oversized or tiny
- [ ] Container query scaling implemented (fallback to fixed 14px if unsupported)
- [ ] All Courier font references removed from CSS

## Testing Checklist

1. Load Dungeon Gleaner in-game, navigate to any floor
2. Visually inspect debrief panel (left column):
   - Confirm font is monospace/console-like, NOT serif Courier
   - Confirm background is near-black (`#0a0a0a`)
   - Confirm text is phosphor green (`#33ff33`)
   - Confirm scanlines are visible (subtle dark stripes)
3. Check gauge rendering:
   - HP bar displays as `█` and `░` characters with magenta color
   - EN bar displays with cyan color
   - BAT bar displays with green color
   - Each bar is ~10 characters wide
4. Check stat line: "STR 3 │ DEX 2 │ STL 1 │ 💰 42g" fits on one line
5. Check pip row (if used): pips are tight with 1px letter-spacing
6. Resize browser window (if testing responsive): confirm container query scaling works or fixed font size is appropriate
7. Perform a combat action that changes HP/EN: confirm gauge bars update correctly and render as Unicode blocks
8. Compare visual appearance to EyesOnly debrief reference: should match dense, military CRT terminal aesthetic

## Reference: EyesOnly Debrief Principles

From the production codebase:
- **Font:** Console font stack, NOT serif or monospace system fallback
- **Layout:** Aggressive padding (5px container, 2px gaps), 4:3 aspect ratio
- **Colors:** Phosphor green primary, dim variants, resource-specific bar colors
- **Gauges:** Unicode block characters (█▒░) for pixel-efficient rendering
- **Spacing:** Letter-spacing computed via canvas `measureText()` to fill width (advanced, optional for Jam entry)
- **Scanlines:** CSS repeating-linear-gradient overlay, 2px transparent + 1px dark stripe
- **Density:** Every pixel accounted for, no wasted space

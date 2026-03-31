# FIX_SUIT_SYMBOLS_IN_PORTHOLES.md — Render Suit Glyphs in Card Portholes

## Problem

The coin-border "porthole" circles were added to cards as visual framing (brass outer ring + recessed inner ring at top-left and bottom-right corners), but the suit symbols (♠ ♣ ♦ ♥) that should be rendered INSIDE those portholes are missing. The portholes are empty brass-rimmed circles, breaking the playing-card aesthetic.

## Root Cause Analysis

In `engine/card-fan.js` the `_drawCardBody()` function draws the porthole frames (outer brass arc + inner recessed arc) at the TL and BR corners, but the `ctx.fillText()` call to render the suit glyph was either omitted or placed at incorrect coordinates (not centered within the porthole circle). This leaves decorative empty frames with no semantic suit indicator.

## Files to Modify

- `engine/card-fan.js` — `_drawCardBody()` function, specifically the porthole rendering section (TL and BR corner porthole arcs)

## Implementation Steps

### Step 1: Locate porthole rendering code
- Open `engine/card-fan.js` and find `_drawCardBody()` (approximately line 250-350).
- Identify the section that draws the two porthole frames at TL and BR. It should contain two `ctx.arc()` calls for the outer brass ring and inner recessed ring.
- Verify the porthole center coordinates (e.g., `tlPortholeX`, `tlPortholeY` for top-left; `brPortholeX`, `brPortholeY` for bottom-right).

### Step 2: Add suit glyph rendering after each porthole frame
- After the inner arc draw for the TL porthole, add:
  ```javascript
  if (card.suit) {
    const suitGlyph = { spade: '♠', club: '♣', diamond: '♦', heart: '♥' }[card.suit];
    const suitColor = SUIT_BORDER_COLORS[card.suit]; // e.g., { spade: '#C0A080', club: '#00D4FF', ... }

    ctx.save();
    ctx.fillStyle = suitColor;
    ctx.font = `bold ${portholeDiameter * 0.6}px serif`; // ~60% of porthole size
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(suitGlyph, tlPortholeX, tlPortholeY);
    ctx.restore();
  }
  ```

### Step 3: Define SUIT_BORDER_COLORS constant
- Add a color map near the top of `card-fan.js` if it doesn't exist:
  ```javascript
  const SUIT_BORDER_COLORS = {
    spade: '#C0A080',     // Warm grey/bronze
    club: '#00D4FF',      // Cyan
    diamond: '#00FFA6',   // Bright green
    heart: '#FF6B9D'      // Pink/red
  };
  ```
- Ensure these colors match the suit resource palette used elsewhere in the game (check `CardSystem` or `data/strings/en.js` for suit color definitions).

### Step 4: Handle bottom-right porthole rotation
- For the BR porthole, the suit glyph should be rotated 180° (standard playing card convention — the suit appears upside-down at the opposite corner).
- Modify the BR glyph rendering:
  ```javascript
  if (card.suit) {
    const suitGlyph = { spade: '♠', club: '♣', diamond: '♦', heart: '♥' }[card.suit];
    const suitColor = SUIT_BORDER_COLORS[card.suit];

    ctx.save();
    ctx.fillStyle = suitColor;
    ctx.font = `bold ${portholeDiameter * 0.6}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Rotate 180° around the porthole center
    ctx.translate(brPortholeX, brPortholeY);
    ctx.rotate(Math.PI);
    ctx.fillText(suitGlyph, 0, 0);
    ctx.restore();
  }
  ```

### Step 5: Handle missing suit property
- Wrap each glyph render in an `if (card.suit)` check so cards without a suit property don't crash.
- If a card has no suit, the porthole stays empty as a decorative frame (acceptable fallback).

### Step 6: Test rendering at multiple scales
- Test card rendering at both explore mode (2.5x) and combat mode (2.0x) scale to ensure the glyph text is readable.
- If text is too small or too large, adjust the font size multiplier (currently `0.6 * portholeDiameter`). Target: glyph should be ~70-80% visible within the porthole without touching the rim.

### Step 7: Verify color consistency
- Cross-check SUIT_BORDER_COLORS against any existing suit color definitions in the codebase (CardSystem, WorldItems, data files).
- Ensure the colors contrast well against the card background and porthole brass rim.

## Acceptance Criteria

- Each card with a `suit` property displays the suit glyph (♠ ♣ ♦ ♥) centered inside both the TL and BR portholes.
- The glyph uses the correct resource color for its suit (spade=warm grey, club=cyan, diamond=green, heart=pink). Not white or black by default.
- The BR glyph is rotated 180° (upside-down, per playing-card convention).
- The glyph is sized proportionally within the porthole (visible and readable, not clipped).
- Cards without a `suit` property render without error; portholes appear empty.
- Glyph rendering is consistent across all card scales (explore mode 2.5x, combat mode 2.0x).
- The porthole frames (brass ring + recessed ring) are still visible behind/around the glyph (not occluded).


# FIX_VIEWPORT_BLUR_SCOPING.md

## Problem

When the NCH overlay opens the card fan in explore mode, `CardFan.maximize()` applies `filter: blur(1.5px) brightness(0.85)` to the `#viewport` element. This blurs the **entire HUD** — status bar, debrief feed, minimap, everything — not just the 3D game canvas. The intent was to dim only the 3D scene to focus attention on the cards.

## Root Cause

- `maximize()` at line ~196 of `engine/card-fan.js` does:
  ```javascript
  document.getElementById('viewport').style.filter = 'blur(1.5px) brightness(0.85)'
  ```
- The `#viewport` element is the parent container that holds **both** the game canvas (`#view-canvas`) **and** all DOM HUD overlays (status bar, debrief feed, minimap).
- CSS `filter` applies to the element and all its children recursively. There is no CSS mechanism to exclude children from a parent's filter.
- The fix must target **only** the canvas element, not the container.

## Files to Modify

- `engine/card-fan.js` — `maximize()`, `minimize()`, `close()` methods

## Implementation Steps

1. In `maximize()` method, change:
   ```javascript
   document.getElementById('viewport').style.filter = 'blur(1.5px) brightness(0.85)'
   ```
   to:
   ```javascript
   document.getElementById('view-canvas').style.filter = 'blur(1.5px) brightness(0.85)'
   ```

2. In `minimize()` method, change the filter removal from `#viewport` to `#view-canvas`:
   ```javascript
   document.getElementById('view-canvas').style.filter = ''
   ```

3. In `close()` method, change any filter clearing to target `#view-canvas` instead of `#viewport`.

4. Verify that `#view-canvas` is the correct ID for the game's rendering canvas by checking `index.html` for the canvas element definition.

5. **Optional enhancement**: Consider adding a subtle dark overlay div (position: absolute, pointer-events: none, background: rgba(0,0,0,0.15)) layered between the canvas and HUD elements for a cleaner dimming effect instead of blur. Blur can be expensive on low-end hardware (webOS TVs). This could be an alternative or complement to the filter approach.

## Acceptance Criteria

- Opening NCH fan dims/blurs **only** the 3D canvas, not the status bar or debrief feed
- Status bar text remains crisp and fully readable while fan is open
- Debrief feed is not blurred
- Minimap is not blurred
- Closing the fan restores full canvas clarity
- Performance: no additional GPU cost on the HUD elements
- Blur effect remains smooth during card fan interactions

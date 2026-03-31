splash, title, callsign, class all need to be between 70-120% bigger, stronger text, flashier and consistent css styling.



the buttons at title screen have no hover indication. 

they need frames, polish. 



there's no clickable way out of the settings menu. 



the class selection buttons are still broken with text hiding outside of frame and details simply too small. 



now that we have a new theme direction from HYBRID-LAYOUT-SPEC.md for styling that is working let's use assets for our title etc from specifically https://flapsandseals.com/partners or the eyesonly/public partners.html  





specifically this button on background glow effect for our splash-class selection screens with paper styling:

 

form {

  background-color: #444444;

  border-radius: 10px;

  padding: 20px;

  width: 300px;

  margin: 50px auto;

}

.lb {

  display: block;

  margin-bottom: 10px;

  font-size: 18px;

  font-weight: bold;

}

.infos[type="text"], input[type="email"], input[type="date"] {

  width: 100%;

  padding: 10px;

  font-size: 16px;

  border-radius: 5px;

  border: none;

  margin-bottom: 20px;

  background-color: #333333;

  color: white;

}

#send {

  --glow-color: rgb(176, 255, 189);

  --glow-spread-color: rgba(123, 255, 160, 0.781);

  --enhanced-glow-color: rgb(182, 175, 71);

  --btn-color: rgba(13, 241, 21, 0.508);

  border: .25em solid var(--glow-color);

  padding: 1em 2em;

  color: var(--glow-color);

  font-size: 14px;

  font-weight: bold;

  background-color: var(--btn-color);

  border-radius: 1em;

  outline: none;

  box-shadow: 0 0 1em .25em var(--glow-color),

        0 0 4em 1em var(--glow-spread-color),

        inset 0 0 .05em .25em var(--glow-color);

  text-shadow: 0 0 .5em var(--glow-color);

  position: relative;

  transition: all 0.3s;

}

#send::after {

  pointer-events: none;

  content: "";

  position: absolute;

  top: 120%;

  left: 0;

  height: 100%;

  width: 100%;

  background-color: var(--glow-spread-color);

  filter: blur(2em);

  opacity: .7;

  transform: perspective(1.5em) rotateX(35deg) scale(1, .6);

}

#send:hover {

  color: var(--btn-color);

  background-color: var(--glow-color);

  box-shadow: 0 0 1em .25em var(--glow-color),

        0 0 4em 2em var(--glow-spread-color),

        inset 0 0 .75em .25em var(--glow-color);

}

#send:active {

  box-shadow: 0 0 0.6em .25em var(--glow-color),

        0 0 2.5em 2em var(--glow-spread-color),

        inset 0 0 .5em .25em var(--glow-color);

}

#limpar {

  --glow-color: rgb(255, 176, 176);

  --glow-spread-color: rgba(255, 123, 123, 0.781);

  --enhanced-glow-color: rgb(182, 175, 71);

  --btn-color: rgba(241, 13, 13, 0.508);

  border: .25em solid var(--glow-color);

  padding: 1em 2em;

  color: var(--glow-color);

  font-size: 14px;

  font-weight: bold;

  background-color: var(--btn-color);

  border-radius: 1em;

  outline: none;

  box-shadow: 0 0 1em .25em var(--glow-color),

        0 0 4em 1em var(--glow-spread-color),

        inset 0 0 .05em .25em var(--glow-color);

  text-shadow: 0 0 .5em var(--glow-color);

  position: relative;

  transition: all 0.3s;

}

#limpar::after {

  pointer-events: none;

  content: "";

  position: absolute;

  top: 120%;

  left: 0;

  height: 100%;

  width: 100%;

  background-color: var(--glow-spread-color);

  filter: blur(2em);

  opacity: .7;

  transform: perspective(1.5em) rotateX(35deg) scale(1, .6);

}

#limpar:hover {

  color: var(--btn-color);

  background-color: var(--glow-color);

  box-shadow: 0 0 1em .25em var(--glow-color),

        0 0 4em 2em var(--glow-spread-color),

        inset 0 0 .75em .25em var(--glow-color);

}

#limpar:active {

  box-shadow: 0 0 0.6em .25em var(--glow-color),

        0 0 2.5em 2em var(--glow-spread-color),

        inset 0 0 .5em .25em var(--glow-color);

}





# Debug Notes Screener — UI/HUD Overhaul Pass 2

Status: **Resolved** | Updated: 2026-03-31

## Issues & Resolutions

### 1. Debrief Feed — 4:3 Aspect + Category Cycling
- **Issue**: Panel stretched full height; clicking cycled through degraded views
- **Fix**: Added `aspect-ratio: 3/4` CSS. Removed cursor blink. Renamed `>FEED` to `FEED`. Mode cycling works: MOK → SYSTEMS → FEED.
- **Future**: Port full EyesOnly debrief-feed-controller expandable rows (post-jam)

### 2. Quick Slots — Yellow Post-It Note
- **Issue**: Paper-with-lines didn't read at scale
- **Fix**: Restyled as yellow sticky notes (#ffe066), slight rotation per slot, drop shadow, no ruled lines

### 3. D-Pad — Reposition + Rethink
- **Issue**: Sprite-based D-pad overlapped footer, used pixel art assets
- **Fix**: Pure CSS monochrome arrows, positioned center-right (50% vertical), hover tooltips with keybind+controller info

### 4. CRT Scanlines — Viewport Scope
- **Issue**: Scanlines + vignette covered entire gameplay viewport
- **Fix**: Both `#crt-scanlines` and `#crt-vignette` hidden by default (`display:none`). Add `.peek-active` class via JS for peek/title screens only.
- **Side effect fixed**: Debrief panel was semi-transparent (0.88 opacity) relying on vignette backdrop. Changed `--bg-panel` to solid `#080c08`.

### 5. Exterior Wall Brightness — Day/Night
- **Issue**: Walls used lightmap-only brightness (torch radius), too dark for daytime
- **Fix**: Added sun intensity multiplier in raycaster `_applyFogAndBrightness`. Both foreground and background layers get `max(torchLight, 0.25 + sunI * 0.7)` when `ceilingType === 'sky'`.

### 6. Minimap Sizing + Compass + Map Button
- **Issue**: Tiles too small, frame too small, compass "N" label hidden
- **Fix**: Tile contents 1.7× zoom (player-centered instead of grid-centered). Frame CSS 240→288px. Compass "N" label threshold lowered to 160px. MAP button added to status bar footer. Gold counter added to status bar.

### 7. Raycaster Minimum Wall-Band LOD
- **Issue**: Distant walls disappeared; shrubs cut up tree backgrounds
- **Fix**: `Math.max(2, ...)` on lineHeight ensures 2px minimum wall strip. Increased `_MAX_LAYERS` 4→6, `_MAX_BG_STEPS` 16→24 for deeper vegetation/building views.

### 8. Debrief Feed Cycling Bug
- **Issue**: Clicking cycled through degraded views; blinking cursor at bottom
- **Fix**: Removed cursor blink div from `_renderFeed()`. Removed `.df-cursor-blink` CSS + keyframes. Cleaned `>FEED` → `FEED`.

### 9. Clock Stuck at 06:00
- **Issue**: DayCycle starts at 06:00, time only advances on floor transitions
- **Fix**: Added `DayCycle.advanceTime(15)` at game init — operatives deploy at dawn, arrive ~06:15.

### 10. Hero Day Week-Strip Widget
- **Issue**: "Day 1 (1/3)" display was unclear
- **Fix**: Week-strip `[S M ♠ W T F S]` with day-of-week abbreviations. Hero days show suit symbols (♠♦♣) color-coded per dungeon. Current day highlighted and bobbing. Hover tooltip shows day number + hero status.

### 11. Footer Dead Space
- **Issue**: Status bar had too much blank area
- **Fix**: Added MAP button, gold counter (💰 0g) to sb-row. Status bar refresh updates gold from Player.state().currency.

### 12. Shrubs Cutting Up Tree Backgrounds
- **Issue**: N-layer system had only 4 layers, causing short vegetation to consume slots
- **Fix**: Increased to 6 layers and 24 BG steps. Combined with min wall-band LOD (#7).
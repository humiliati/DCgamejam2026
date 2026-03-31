# Input & Controller Roadmap

> Keyboard/click parity audit, D-pad implementation notes, and the
> plan for gamepad (webOS Magic Remote + standard controllers).

---

## Current input parity (post D-pad)

| Action | Keyboard | Click/Touch | Gap |
|--------|----------|-------------|-----|
| Forward | W / ↑ | D-pad ▲ | — |
| Back | S / ↓ | D-pad ▼ | — |
| Turn left | A / ← | D-pad ◀ | — |
| Turn right | D / → | D-pad ▶ | — |
| Strafe left | Q | — | **No click equiv** |
| Strafe right | E | — | **No click equiv** |
| Interact | Space/Enter | D-pad OK, InteractPrompt click | — |
| Inventory | I | StatusBar [BAG] | — |
| Cards 1-5 | 1-5 | CardFan tap/drag | — |
| Map toggle | M | StatusBar [MAP] | — |
| Pause | Esc | — | **No click equiv** |
| Descend | . | InteractPrompt (context) | — |
| Ascend | , | InteractPrompt (context) | — |
| Flee | F | StatusBar [FLEE] label exists | **Bug: handler still calls map toggle** |
| Tab focus | Tab | — | Accessibility only, low priority |

### Gaps to close (jam)

1. **Flee button bug** — status-bar.js click handler for the
   MAP/FLEE button doesn't switch behavior during combat. Fix: check
   `_inCombat` in the click handler and fire the flee callback instead
   of `Minimap.toggle()`.

2. **Strafe** — The D-pad cross layout uses 5 buttons (fwd/back/
   left/right/OK). Strafing is secondary movement. Two options:
   - Add Q/E shoulder buttons flanking the D-pad (clutters UI)
   - Hold D-pad OK + left/right to strafe (combo input, discoverable)
   - **Post-jam**: map to gamepad bumpers (L1/R1)

3. **Pause click** — Add a ☰ hamburger button to the HUD (top-left
   or near StatusBar) that fires `ScreenManager.toPause()`.

---

## D-pad implementation (done)

Module: `engine/dpad.js` (Layer 3)
DOM: `#dpad-frame` with 5 `.dpad-btn` children in cross layout

Features:
- Pointer events (mouse + touch unified via PointerEvent API)
- Hold-to-repeat: 400ms initial delay, 200ms repeat interval
- Cancel on pointerup/pointerleave/pointercancel
- OK button wired to Game._interact() via DPad.setOnInteract()
- Show/hide toggled by _showHUD() in game.js
- Semi-transparent (50% idle, 85% hover) — unobtrusive

---

## Gamepad / controller plan

### Phase 1 — webOS Magic Remote (post-jam priority)

The LG webOS Magic Remote is a Wii-style pointer with 5-way D-pad,
OK, Back, and color buttons. It maps to standard DOM events:

| Remote button | DOM event | Game action |
|---------------|-----------|-------------|
| D-pad up | keydown ArrowUp | Forward |
| D-pad down | keydown ArrowDown | Back |
| D-pad left | keydown ArrowLeft | Turn left |
| D-pad right | keydown ArrowRight | Turn right |
| OK (center) | keydown Enter | Interact |
| Back | keydown Backspace (or 461) | Pause / menu back |
| Red button | keydown 403 | Card 1 |
| Green button | keydown 404 | Card 2 |
| Yellow button | keydown 405 | Card 3 |
| Blue button | keydown 406 | Card 4 |
| Pointer move | pointermove | Cursor (minimap click, card drag) |

Implementation: Add webOS key codes to InputManager's keymap as
aliases for existing actions. The existing arrow-key bindings
already cover the D-pad. Color buttons need new keymap entries.

Estimated effort: ~30 lines in input.js keymap + key code constants.

### Phase 2 — Standard Gamepad API

For desktop/Steam Deck/mobile Bluetooth controllers. Uses the
browser Gamepad API (`navigator.getGamepads()`).

New module: `engine/gamepad.js` (Layer 1, zero dependencies)

```
Gamepad mapping (standard layout):
  Left stick / D-pad → movement (forward/back/turn)
  A (south)          → interact
  B (east)           → back / flee
  X (west)           → card cycle
  Y (north)          → inventory
  L1 / R1            → strafe left / right
  L2 / R2            → card prev / next in hand
  Start              → pause
  Select             → map toggle
  Right stick        → mouse look (optional)
```

Implementation plan:

1. **GamepadPoll module** — polls `navigator.getGamepads()` once per
   frame. Converts analog stick deflection to discrete actions with
   deadzone (0.3) and repeat timing matching keyboard repeat.

2. **Axis-to-action mapping** — left stick Y axis maps to
   forward/back, X axis maps to turn left/right. Dead zone prevents
   drift. Digital D-pad buttons map 1:1 to the same actions.

3. **Button-to-action mapping** — face buttons fire
   `InputManager.simulatePress(action)` so the existing edge-trigger
   system handles them identically to keyboard.

4. **Connection UI** — toast notification when gamepad connects/
   disconnects. Auto-detect layout (standard vs non-standard).

5. **Sensitivity config** — add stick sensitivity and dead zone to
   the Settings overlay (TitleScreen Phase 0 settings).

Estimated effort: ~200 lines for GamepadPoll + ~20 lines keymap
wiring. No changes needed to existing modules — gamepad input
routes through InputManager.

### Phase 3 — Touch gestures (stretch)

For mobile browser play without the D-pad overlay:

- Swipe up/down → forward/back
- Swipe left/right → turn
- Tap center → interact
- Two-finger tap → inventory
- Pinch → map zoom

Low priority — the D-pad already covers touch. Gestures are
polish for a native-feel mobile experience.

---

## Input architecture diagram

```
                    ┌─────────────┐
                    │  Keyboard   │
                    └──────┬──────┘
                           │ keydown/keyup
  ┌──────────┐      ┌──────▼──────┐      ┌──────────┐
  │  D-pad   │─────▶│ InputManager│◀─────│  Gamepad  │
  │  (DOM)   │ fire │  (Layer 0)  │ poll │  (future) │
  └──────────┘      └──────┬──────┘      └──────────┘
                           │ on()/downEdge()
                    ┌──────▼──────┐
                    │  InputPoll  │
                    │  (Layer 3)  │
                    └──────┬──────┘
                           │ action dispatch
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        Movement      Interact      Combat
        Controller    / Peek        Bridge
```

All input sources converge at InputManager. New input devices
(gamepad, touch gestures, webOS remote) only need to translate
their events into InputManager actions. Everything downstream
remains untouched.

---

## File checklist

| File | Status | Change |
|------|--------|--------|
| engine/input.js | Needs update | Add webOS key codes, gamepad aliases |
| engine/dpad.js | Done | 5-button cross, pointer events |
| engine/gamepad.js | Not started | Gamepad API polling module |
| engine/status-bar.js | Bug | Fix flee button click handler |
| engine/title-screen.js | Done | Settings overlay with toggles |
| index.html | Done | D-pad DOM + CSS |

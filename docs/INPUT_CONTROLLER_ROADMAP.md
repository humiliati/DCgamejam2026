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
| Pause | Esc | StatusBar ☰ button | — |
| Descend | . | InteractPrompt (context) | — |
| Ascend | , | InteractPrompt (context) | — |
| Flee | F | StatusBar 🏃 FLEE (combat only) | — |
| Tab focus | Tab | — | Accessibility only, low priority |

### Gaps to close (jam)

1. ~~**Flee button bug**~~ ✅ — `_btnMap` click handler checks
   `_inCombat` and fires `_onFleeCallback()` (status-bar.js:167-169).
   Additionally, the ☰ pause button now transforms into a visible
   🏃 FLEE button during combat with red pulse animation
   (`.sb-flee-active` class). Click fires flee callback directly.

2. **Strafe** — D-pad uses 5 buttons. Gamepad covers strafe via
   right stick (analog) — no L1/R1 needed since bumpers are cards.
   Touch/click strafe remains unavailable (low priority).

3. ~~**Pause click**~~ ✅ — `#sb-pause` (☰ hamburger) in status
   bar row. Click handler toggles pause via `Game.requestPause()`.
   Hidden during combat (replaced by FLEE).

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

### Phase 1 — webOS Magic Remote ✅

The LG webOS Magic Remote is a Wii-style pointer with 5-way D-pad,
OK, Back, and color buttons. It maps to standard DOM events:

| Remote button | DOM event | Game action | Status |
|---------------|-----------|-------------|--------|
| D-pad up | keydown ArrowUp | Forward | ✅ DEFAULT_KEYMAP |
| D-pad down | keydown ArrowDown | Back | ✅ DEFAULT_KEYMAP |
| D-pad left | keydown ArrowLeft | Turn left | ✅ DEFAULT_KEYMAP |
| D-pad right | keydown ArrowRight | Turn right | ✅ DEFAULT_KEYMAP |
| OK (center) | keydown Enter | Interact | ✅ DEFAULT_KEYMAP |
| Back | keyCode 461 | Pause / menu back | ✅ WEBOS_KEYCODE_MAP |
| Red button | keyCode 403 | Card 0 | ✅ WEBOS_KEYCODE_MAP |
| Green button | keyCode 404 | Card 1 | ✅ WEBOS_KEYCODE_MAP |
| Yellow button | keyCode 405 | Card 2 | ✅ WEBOS_KEYCODE_MAP |
| Blue button | keyCode 406 | Card 3 | ✅ WEBOS_KEYCODE_MAP |
| Rewind | keyCode 412 | Hose reel | ✅ WEBOS_KEYCODE_MAP |
| Play | keyCode 415 | Interact | ✅ WEBOS_KEYCODE_MAP |
| Pointer move | pointermove | Cursor | ✅ _initMousePointer |
| Scroll wheel | wheel | scroll_up/down | ✅ wheel listener |

Implementation: `WEBOS_KEYCODE_MAP` in input.js maps numeric keyCode
values for non-standard keys. `_resolveAction(e)` checks `e.code`
first (standard keys), then falls back to `e.keyCode` (webOS keys).
D-pad and OK use standard e.code and work via DEFAULT_KEYMAP.

### Phase 2 — Standard Gamepad API ✅

Implemented inline in input.js (no separate gamepad.js needed).
Uses `navigator.getGamepads()` with per-frame polling.

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
| engine/input.js | ✅ Done | DEFAULT_KEYMAP + WEBOS_KEYCODE_MAP + Gamepad polling |
| engine/dpad.js | ✅ Done | 5-button cross, pointer events |
| engine/gamepad.js | N/A | Gamepad is inline in input.js (pollGamepad) |
| engine/status-bar.js | ✅ Done | Flee button: ☰→🏃FLEE on combat, click handler routes |
| engine/title-screen.js | ✅ Done | Settings overlay with toggles |
| index.html | ✅ Done | D-pad DOM + CSS + .sb-flee-active + mobile tooltip cap |

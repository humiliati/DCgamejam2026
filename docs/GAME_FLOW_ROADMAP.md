# Game Flow Roadmap — Screen Manager & Rotating Box Menu

> Pre-jam engine work. Pure plumbing — no game content, no theme dependency.
> This is the #1 blocker for jam compliance: without it, the game has no
> beginning or end, and fails the "playable from beginning to end" rule.

---

## Current State

_(Updated 2026-03-27 — reflects implemented engine state)_

**MenuBox (pause overlay) — ✅ fully functional**
The 4-face rotating box is live. ESC opens/closes it via `ScreenManager`
(`GAMEPLAY → PAUSE → GAMEPLAY`). The fold-up/fold-down CSS animation plays.
All four faces are registered and rendering.

**Face 0 — Minimap** ✅ Scaled minimap with fog-of-war, player position,
floor label.

**Face 1 — Items / Shop Info** ✅ In shop context shows live faction rep
panel (all 3 factions, tier badges, colour-coded). Outside shop shows
card deck view.

**Face 2 — Gear / Shop Buy + Sell** ✅ Buy face reads `Shop.getInventory()`
with rarity colour dots, element tags, affordability dimming. Sell face shows
hand cards with rarity-based sell values. `[1–5]` hotkeys route to buy/sell
depending on active face.

**Face 3 — System/Settings** ✅ Three live volume sliders (Master/SFX/BGM)
backed by `AudioSystem.getVolumes()` / setters. Row selection (`▶` cursor),
gradient fill bar, thumb pip, nudge hints. Defaults: Master 80 %, SFX 100 %,
BGM 60 %.

**Input mapping — ✅ complete**
- `ESC` — open/close box
- `Q` / `E` — rotate box left/right (always, including escape from Face 3)
- `←` / `→` (`turn_left/right`) — adjust selected slider on Face 3; rotate
  box on all other faces
- `W` / `S` (`step_forward/back`) — navigate slider rows on Face 3 while
  paused (no movement during pause)
- Mouse wheel / scroll — fine ±5 adjustment on active Face 3 slider
- `[1–5]` — buy slot (Face 2 buy) or sell slot (Face 2 sell) or card play
  (gameplay)

**AudioSystem** ✅ Real volume state (`_volumes.master/sfx/bgm`), clamped
setters, `getVolumes()` returning 0–100 integers. Playback remains stubbed
until Pass 7 (asset port).

**Shop system** ✅ `Shop.open/close/buy/sell/reset`, weighted inventory
generation per faction+rep tier, `RARITY_BASE` pricing, REP_DISCOUNT tiers.
Wired to grid-gen shop placements (one per floor, penultimate room).
`CardSystem` loads from `data/cards.json` via sync XHR; `getByPool()`,
`getBiomeDrops()`, `removeCard()`, `getCollection()` all live.

**Splash → Title → Gameplay flow — ✅ implemented**
DOM-driven 3D box splash (`SplashScreen` + `BoxAnim`) with hover-to-open
lid, click-to-envelop glow transition, then `ScreenManager.toTitle()`.
`BoxAnim` is a modular CSS 3D animation controller with four variants
(splash/chest/door/button), reusable for in-game interactions.

**Skybox — ✅ implemented**
`skybox.js` renders parallax cloud layers + zone-based mountain silhouettes
(industrial ↔ forest sine-blend). Title preset uses slow drift. Gameplay
presets per-biome (post-jam: animated time-of-day cycle).

**Minimap default state — ✅ fixed**
Minimap starts hidden (`_visible = false`); toggled via M key or HUD button.
`_showHUD` respects `Minimap.isVisible()` instead of force-showing.

**Phase 1 — Click Targets — ✅ implemented**
All interactables clickable for LG Magic Remote: harvest loot grid tiles,
shop buy/sell tiles, MenuBox nav arrows, InteractPrompt, DialogBox advance,
CardFan card selection. Three-layer click cascade: game.js → MenuBox → MenuFaces.

**Phase 2 — CRT Theme + Debrief Feed — ✅ implemented**
Retro-futuristic CRT terminal aesthetic. `DebriefFeed` (3 modes: MOK avatar,
resources, event feed), `StatusBar` (bottom strip: DEBRIEF/MAP/BAG buttons +
floor/heading + combat mode swap), `QuickBar` (3 equipped-item slots).
Scanline overlay, phosphor glow, vignette effects.

**Phase 3 — Enemy Sprites + Death Animation + NCH Widget — ✅ implemented**
`EnemySprites` — 16 status states, 3 primary poses (idle/attack/corpse),
visual FX map (tint, glow, particles, pulse, overlay text), pose registry.
`DeathAnim` — Paper Mario origami fold (squash → flatten to corpse tile)
and poof (shrink + particle burst for ethereal/swarm enemies).
`NchWidget` — Draggable capsule from EyesOnly NCH overlay pattern. Opens
CardFan in browse mode during exploration, shrinks during combat, restores
after. `CombatReport` — post-combat XP/actions click-through overlay.
HUD streamlined: HP/EN bars removed (live in DebriefFeed), combat log
upgraded to CRT theme.

**Still outstanding (pre-jam):**
- `ScreenManager` formal state machine (currently ad-hoc in `game.js`)
- `DialogBox` (vendor greetings, P6 UI_ROADMAP)
- HUD battery pip row + typed collectible toasts (HUD_ROADMAP)
- Phase 4–5 click/drag interaction polish (HUD_ROADMAP)
- Enemy sprite particle effects CSS rendering
- NCH widget drag-to-reorder cards (Phase 4)

---

## Target Screen Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│  SPLASH  │────→│    TITLE     │────→│   GAMEPLAY   │
│  (logo)  │     │ (box over    │     │  (main loop) │
│  1.5 sec │     │  skybox)     │     │              │
└──────────┘     └──────────────┘     └──────┬───────┘
                       ↑                     │
                       │              ┌──────┴───────┐
                       │              │              │
                  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐
                  │  GAME    │  │ VICTORY  │  │  PAUSE   │
                  │  OVER    │  │  SCREEN  │  │ (box     │
                  │ "Retry"  │  │  "Done"  │  │  folds   │
                  │ "Title"  │  │  "Title" │  │  up over │
                  └──────────┘  └──────────┘  │  world)  │
                                              └──────────┘
```

---

## The Rotating Box Menu (OoT-Style)

### Design Rationale

The post-jam target is the LG Content Store. The Magic Remote is a
pointer device like a Wii Remote — it tracks absolute screen position
and has a D-pad, scroll wheel, and OK/Back buttons. A flat 2D overlay
menu wastes the pointer's spatial capability. Nested submenus are hostile
to pointer navigation.

The solution: a 3D rotating box rendered around the player's POV with
4 menu faces. The player points at items on the current face, and
swipes/D-pads left/right to rotate to adjacent faces. This is the
Zelda: Ocarina of Time pause screen principle — each face is a
self-contained top-level context, no nesting required.

The same rotating box serves as BOTH the pause menu (in-game) and the
title screen (pre-game), with different content on each face depending
on context.

### The Four Faces

```
          ┌──────────────┐
          │   FACE 2     │
          │  EQUIPMENT   │
          │  & INVENTORY │
          └──────┬───────┘
                 │ rotate right
┌──────────┐    ┌┴─────────────┐    ┌──────────────┐
│  FACE 1  │←──→│   FACE 0     │←──→│   FACE 3     │
│  SKILLS  │    │  MINIMAP     │    │   SYSTEM     │
│  JOURNAL │    │  (default)   │    │   SETTINGS   │
│  DIALOG  │    │              │    │              │
└──────────┘    └──────────────┘    └──────────────┘
  rotate left     ↑ default          rotate right ×2
                  ↑ ESC opens here
```

#### Face 0 — Minimap (Default)

The face visible when the menu first opens. Shows the full-size
interactive minimap (scaled up from 160×160 to fill the face).

**Pause mode:**
- Full explored map with fog-of-war
- Player position + facing indicator
- Stair/door markers clickable for fast-travel (post-jam)
- Floor stack breadcrumb at bottom
- Current floor label + biome name

**Title mode:**
- World overview map (all 6 streets in abstract layout)
- "New Game" button centered
- "Continue" button (post-jam, if save system exists)

#### Face 1 — Skills / Journal / Dialog History (Rotate Left)

The narrative and progression face.

**Pause mode:**
- Skill tree (post-jam: branching stat upgrades)
- Jam scope: flat stat display (STR, DEX, Stealth) with +/- from level-ups
- Dialog history log (scrollable, shows past NPC conversations)
- Journal/quest log (active objectives, completed quests)
- Lore entries (collectible, found via interact)

**Title mode:**
- Credits / about
- "How to Play" tutorial reference
- Lore intro (theme-dependent, jam work)

#### Face 2 — Equipment & Inventory (Rotate Right)

The gear and items face.

**Pause mode:**
- Left panel: equipment slots (weapon, armor, accessory — post-jam)
- Right panel: inventory grid (4×6 item slots)
- Jam scope: card deck viewer (all owned cards, not just hand)
- Item detail on hover/select (description, stats, "Use" button)
- Currency display
- Consumables (potions, food, scrolls) with "Use" button

**Title mode:**
- Difficulty selector
- Character creation (name, stat allocation — jam scope)
- Starting deck preview

#### Face 3 — System Settings (Rotate Right ×2)

The system and accessibility face. Critical for LG Content Store
compliance — no hardcoded user-facing text.

**Pause mode & Title mode (identical content):**
- Language selector (i18n — all UI strings from lookup table)
- Audio SFX volume slider
- Audio BGM volume slider
- Master volume slider
- Controls reference / rebinding (post-jam)
- Display settings (render resolution, pixelation toggle — post-jam)
- "Quit to Title" (pause mode only)
- "Return to Game" (pause mode only)

---

## Box Rendering — Folding Walls, Glass Blur, Seam Hold

### The Vision

This is NOT a CSS 3D overlay. The box is rendered on the same canvas
as the game world. When the player pauses, four walls fold up around the
camera like a box assembling itself — rising from the floor plane,
hinged at the base, swinging inward until they enclose the POV. The
game world remains visible through the box's geometry: between the
vertices, through the transparent blurred margins of each face.

The feel is: the dungeon world is still there, frozen and blurred
behind glass, while the menu surface floats in front of you. You're
inside a translucent box, looking out at the world you're pausing from.

### Face Rendering

Each face is composed of two zones:

```
┌─────────────────────────────────┐
│ ░░░░░░░░░ BLUR BORDER ░░░░░░░░ │  ← Wide outer margin
│ ░░┌───────────────────────┐░░░ │     Transparent + frosted glass blur
│ ░░│                       │░░░ │     Game world visible through here
│ ░░│    INTERACTIVE        │░░░ │
│ ░░│    CONTENT AREA       │░░░ │  ← Inner region
│ ░░│                       │░░░ │     Stylized border frame
│ ░░│    (menu items,       │░░░ │     Opaque/semi-opaque background
│ ░░│     minimap, etc.)    │░░░ │     All interactive elements live here
│ ░░│                       │░░░ │
│ ░░└───────────────────────┘░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────┘
```

**Blur border (outer margin):**
- Large — roughly 15-20% of the face on each side
- Rendered as a frosted glass effect: the game world behind is
  visible but diffused
- Implementation: render the game world to an offscreen canvas,
  apply a box blur kernel, composite the blurred result behind
  the face geometry with alpha
- At the vertices (corners where two faces meet), the blur borders
  overlap, creating a diamond-shaped clear window where the frozen
  world bleeds through most strongly

**Interactive content area (inner region):**
- Bordered by a stylized frame (1-2px ornamental border, biome-tinted)
- Semi-opaque dark background (rgba 0,0,0,0.75 — readable but not
  fully solid)
- All menu items, text, sliders, grids render inside this region
- Pointer events (Magic Remote) only register inside this border

### The Fold-Up Animation

When ESC is pressed, the box assembles over ~400ms:

```
Frame 0:    Walls are flat on the ground (0° from floor plane)
            Game world fully visible — no menu geometry yet

Frame 100:  Walls tilted ~25° inward from floor
            Blur begins appearing at base of each wall
            Game world starts to dim slightly

Frame 200:  Walls at ~50°, clearly rising around the player
            Interactive content fading in on each face
            Blur border solidifying

Frame 300:  Walls at ~75°, nearly vertical
            Content fully visible, blur at full frost
            Game world visible through vertex gaps

Frame 400:  Walls at 90° (vertical, enclosing the POV)
            Box complete. Menu fully interactive.
```

The reverse animation plays when the menu closes — walls fold back
down to the floor, world un-blurs, gameplay resumes.

**Hinge axis:** Each wall hinges at the bottom edge of the viewport.
North wall (Face 0, default) hinges at the top of the viewport and
swings DOWN toward the camera. East wall (Face 2) hinges at right
edge, swings LEFT. Etc. This creates the "box assembling around you"
effect.

### Seam Hold — Inspecting Between Faces

The rotation between faces is continuous, not snapped. When the
player is rotating from Face 0 to Face 1, there's a mid-rotation
state where both faces are partially visible at ~45° angles, and
the gap between them reveals the frozen blurred game world behind.

**The seam hold mechanic:** If the player releases the rotation input
(lifts finger off Q/E, releases D-pad) while the box is mid-rotation,
it stays at that angle. The player can "hold" the box at the seam
between two faces, peeking through the vertex gap at the paused
dungeon. This is purely aesthetic/atmospheric — the game world is
frozen and non-interactive during pause — but it creates a powerful
"you're still in this space" feeling that flat menus can't match.

**Implementation:** The rotation angle is driven by input velocity,
not snapped to 90° increments. When input stops, the box holds at
its current angle with slight dampening. After 1.5 seconds of no
input, it gently eases to the nearest face (settles to the closest
90° snap).

```javascript
function _updateRotation(dt) {
  if (_rotatingInput) {
    // Player is actively rotating
    _rotAngle += _rotDir * ROT_SPEED * dt;
  } else if (!_settled) {
    // Player released — hold briefly, then ease to nearest face
    _idleTime += dt;
    if (_idleTime > SETTLE_DELAY) {
      var targetAngle = Math.round(_rotAngle / 90) * 90;
      _rotAngle += (targetAngle - _rotAngle) * SETTLE_EASE * dt;
      if (Math.abs(targetAngle - _rotAngle) < 0.5) {
        _rotAngle = targetAngle;
        _settled = true;
        _currentFace = (Math.round(_rotAngle / 90) % 4 + 4) % 4;
      }
    }
  }
}
```

### Rendering Pipeline

The box is rendered on the raycaster canvas, not a DOM overlay. This
means the MenuBox module needs access to the rendering loop. The
pipeline during pause:

```
1. Render frozen game world to offscreen canvas (one-time snapshot)
2. Apply gaussian blur to snapshot → blurred background texture
3. Clear main canvas
4. Draw blurred background (full viewport)
5. For each visible box face (max 2 at a time during rotation):
   a. Compute face quad corners from rotation angle
   b. Draw face geometry (perspective-correct quad)
   c. Composite blur border (blurred bg texture, alpha-masked)
   d. Draw content area background (dark semi-opaque)
   e. Draw face content (menu items, text, minimap, etc.)
6. Draw vertex highlights (bright edge lines where faces meet)
7. Draw face indicator (dots at bottom showing which face is active)
```

### Canvas-Based Blur Strategy

True gaussian blur on canvas is expensive per-frame. Instead:

1. When pause opens, render the game world to a small offscreen
   canvas (1/4 resolution — e.g., 120×90 for a 480×360 viewport)
2. Apply a 3-pass box blur on the small canvas (cheap at this size)
3. Scale back up with `ctx.drawImage()` — the upscaling bilinear
   filtering naturally creates additional softness
4. Cache this blurred snapshot — it doesn't change during pause
   (the world is frozen)

This gives a "frosted glass" effect for effectively zero per-frame
cost. The blur happens once on menu open, ~5ms.

### Face Quad Rendering

Each face is a perspective-correct quadrilateral drawn on the 2D
canvas. Since we're inside the box looking out, the faces are like
walls of a room around the camera.

For the current face (directly in front):
```
Face fills ~70% of viewport width, ~80% of height
Content area is the inner 60% of that (blur border around edges)
```

During rotation, the current face slides left/right while the
adjacent face slides in from the opposite side. Both faces are
rendered as foreshortened trapezoids (wider edge near center of
screen, narrower edge at the viewport margin).

Simplified 2D projection (no need for full 3D matrix math):
```javascript
function _projectFace(faceAngle, vpW, vpH) {
  // faceAngle: 0 = directly facing camera, -90/+90 = perpendicular
  var cosA = Math.cos(faceAngle * Math.PI / 180);
  var sinA = Math.sin(faceAngle * Math.PI / 180);

  if (cosA <= 0) return null; // Face is behind camera, don't draw

  // Foreshortening: face width narrows as it rotates away
  var faceW = vpW * 0.7 * cosA;
  var faceH = vpH * 0.8;

  // Horizontal offset: face slides left/right as angle changes
  var centerX = vpW / 2 + sinA * vpW * 0.4;

  return {
    x: centerX - faceW / 2,
    y: (vpH - faceH) / 2,
    w: faceW,
    h: faceH,
    alpha: Math.min(1, cosA * 1.5) // Fade as it turns away
  };
}
```

---

## Title Screen Background — Skybox Scene

At the title screen, no dungeon walls are loaded. The box floats
over a dramatic skybox scene — the visual "first impression" of
the game.

**Default scene:** Lake Pend Oreille at twilight. The skybox renders
a mirrored sky/water horizon with parallax cloud layers. Mountains
silhouetted against a deep gradient sky. The lake surface reflects
the sky with subtle ripple distortion. Square Enix "stare at the
scenery before pressing start" energy.

The skybox module (`engine/skybox.js`) provides this background and
is also used during exterior gameplay (replacing the current flat
gradient + parallax band system in the raycaster). See
`docs/SKYBOX_ROADMAP.md` for the full skybox design.

At title, the skybox animates slowly (cloud drift, subtle color
cycle simulating time-of-day). During gameplay, it locks to the
biome's sky preset. During pause, it freezes along with the rest
of the world (visible through the blur border).

---

## i18n Layer (LG Content Store Requirement)

All user-facing text must go through an internationalization lookup.
LG requires apps to support at minimum English and the device's system
locale. No string literals in UI rendering code.

### New Module: i18n

```
engine/i18n.js  (Layer 0, zero dependencies)
```

```javascript
var i18n = (function () {
  var _locale = 'en';
  var _strings = {};

  function setLocale(loc) { _locale = loc; }
  function getLocale() { return _locale; }

  function register(locale, strings) {
    _strings[locale] = Object.assign(_strings[locale] || {}, strings);
  }

  function t(key, fallback) {
    if (_strings[_locale] && _strings[_locale][key]) {
      return _strings[_locale][key];
    }
    if (_strings['en'] && _strings['en'][key]) {
      return _strings['en'][key];
    }
    return fallback || key;
  }

  return { setLocale: setLocale, getLocale: getLocale, register: register, t: t };
})();
```

String data lives in `data/strings/en.json`, `data/strings/ja.json`, etc.
Loaded at init. All HUD, menu, dialog, and toast text calls `i18n.t('key')`.

---

## New Module: MenuBox

```
engine/menu-box.js  (Layer 2, after Raycaster — needs canvas access)
```

IIFE module. Owns the rotating box rendering, fold-up animation,
rotation state, blur snapshot, and face content management. Renders
on the raycaster canvas during pause/title states.

### Internal State

```javascript
var _state = 'closed';        // closed, folding_up, open, folding_down
var _foldProgress = 0;        // 0 (flat) to 1 (vertical, box complete)
var _rotAngle = 0;            // Continuous rotation in degrees
var _currentFace = 0;         // 0-3, snapped when settled
var _settled = true;          // Has rotation eased to nearest face?
var _idleTime = 0;            // Seconds since last rotation input
var _context = 'pause';       // 'pause' or 'title'
var _blurCanvas = null;       // Cached blurred world snapshot
var _frozenWorldCanvas = null; // Raw frozen world snapshot
```

### Public API

```javascript
MenuBox.init(mainCanvas)             // Bind to raycaster canvas
MenuBox.open(context)                // Begin fold-up animation
MenuBox.close()                      // Begin fold-down animation
MenuBox.isOpen()                     // → true if open or animating
MenuBox.isFullyOpen()                // → true only when fold complete
MenuBox.rotateLeft()                 // Start rotating toward left face
MenuBox.rotateRight()                // Start rotating toward right face
MenuBox.stopRotation()               // Release — begin settle behavior
MenuBox.getCurrentFace()             // → 0-3
MenuBox.getRotAngle()                // → continuous angle (for seam hold)
MenuBox.render(ctx, w, h)            // Called from render loop
MenuBox.setFaceRenderer(idx, fn)     // fn(ctx, x, y, w, h, context)
```

### Face Content Renderers

Each face has a render function that draws its content into the
content area of that face. These are registered by the Game
orchestrator or by dedicated face modules:

```javascript
// Registered during Game.init():
MenuBox.setFaceRenderer(0, MenuFaceMinimap.render);
MenuBox.setFaceRenderer(1, MenuFaceJournal.render);
MenuBox.setFaceRenderer(2, MenuFaceInventory.render);
MenuBox.setFaceRenderer(3, MenuFaceSystem.render);
```

Each renderer receives the canvas context and the content area
bounds. It draws using standard canvas 2D calls. Renderers also
receive the current context ('pause' or 'title') to vary content.

### Integration with Render Loop

During PAUSE or TITLE states, `Game._render()` calls
`MenuBox.render()` instead of (or in addition to) the raycaster:

```javascript
function _render(alpha) {
  if (MenuBox.isOpen()) {
    // Box handles its own rendering (blurred bg + faces)
    MenuBox.render(_ctx, _width, _height);
    return;
  }
  // Normal gameplay rendering...
}
```

During the fold-up/fold-down animation, both the game world AND the
box render together — the box geometry composites on top of the
live (or frozen) world view.

---

## Input Mapping

| Input | Keyboard | Magic Remote | Gamepad |
|-------|----------|-------------|---------|
| Open menu | ESC | Back button | Start |
| Close menu | ESC | Back button | Start |
| Rotate left | Q / ← | D-pad left / swipe left | LB |
| Rotate right | E / → | D-pad right / swipe right | RB |
| Hold seam | Release Q/E | Release D-pad | Release LB/RB |
| Navigate face | WASD / Tab | Pointer (hover) | D-pad |
| Select item | Enter / Space | OK button / click | A button |
| Scroll | Mouse wheel | Scroll wheel | Right stick |

**Seam hold detail:** On keyboard, holding Q rotates continuously.
Releasing Q lets the box hold at the current angle. On Magic Remote,
a single D-pad left press rotates one face; holding D-pad left
rotates continuously. Release → hold → settle.

---

## ScreenManager Integration

ScreenManager's states remain the same. PAUSE and TITLE delegate to
MenuBox for rendering. The game world render loop continues running
during the fold-up animation (so you see the world freeze as the
box encloses you), then pauses once fully open.

```javascript
ScreenManager.onStateChange(function (oldState, newState) {
  if (newState === 'TITLE') {
    MenuBox.open('title');
    // Skybox renders behind the box — no gameplay world
  } else if (newState === 'PAUSE') {
    // Snapshot the current world, start fold-up
    MenuBox.open('pause');
    // GameLoop continues during fold animation, freezes once open
  } else if (newState === 'GAMEPLAY') {
    MenuBox.close();
    // Fold-down animation, then GameLoop resumes
  }
});
```

---

## Splash Screen — ✅ Implemented

DOM overlay (`#splash-overlay`) with CSS 3D rotating box (`BoxAnim`
splash variant). Canvas draws matching dark background behind the overlay
to prevent flicker.

- Title text "DUNGEON GLEANER" + subtitle "DC JAM 2026" + "PRESS ANY KEY"
- Hover on box → lid swings open (CSS `:hover`, hinged at bottom)
- Click box or press any key → `BoxAnim.envelop()`: interior glow scales
  to fill screen, overlay fades out over 500ms, `ScreenManager.toTitle()`
- Min display time 800ms before input accepted; auto-envelop at 4000ms
- Separate handlers: click on `#splash-box` only (no accidental hover
  triggers), keydown on `window`

---

## Game Over Screen

Not part of the rotating box (the player lost — the box doesn't
protect you anymore). A vignette overlay with:
- "You have fallen." header
- Stats summary table
- "Retry" → reset, restart from floor 1
- "Return to Title" → full reset, open title MenuBox

Stats tracking via SessionStats accumulator:
```javascript
var _stats = {
  floorsExplored: 0,
  enemiesDefeated: 0,
  roundsFought: 0,
  cardsPlayed: 0,
  chestsOpened: 0,
  damageTaken: 0,
  damageDealt: 0,
  timeElapsed: 0
};
```

---

## Victory Screen

Placeholder layout only (content is jam work). A dramatic overlay:
- Narrative payoff text (theme-dependent)
- Stats summary
- "Return to Title"
- Could transition INTO the box (walls fold up around the victory
  moment, rotating to show your stats on each face — post-jam)

---

## Module Load Order

```html
<!-- Layer 0: Zero-dependency foundations -->
<script src="engine/rng.js"></script>
<script src="engine/tiles.js"></script>
<script src="engine/i18n.js"></script>           <!-- NEW -->
<script src="engine/audio-system.js"></script>

<!-- Layer 1: Core systems -->
...existing...
<script src="engine/spatial-contract.js"></script>
<script src="engine/texture-atlas.js"></script>

<!-- Layer 2: Rendering + UI -->
<script src="engine/skybox.js"></script>          <!-- NEW -->
<script src="engine/raycaster.js"></script>
<script src="engine/minimap.js"></script>
<script src="engine/hud.js"></script>
<script src="engine/dialog-box.js"></script>      <!-- NEW (from UI_ROADMAP) -->
<script src="engine/toast.js"></script>           <!-- NEW (from UI_ROADMAP) -->
<script src="engine/menu-box.js"></script>        <!-- NEW -->
<script src="engine/screen-manager.js"></script>  <!-- NEW -->
<script src="engine/game-loop.js"></script>

<!-- Layer 3: Game modules -->
...existing...

<!-- Layer 4: Orchestrator -->
<script src="engine/game.js"></script>

<!-- Layer 5: Data -->
<script src="data/strings/en.js"></script>        <!-- NEW -->
```

---

## Estimated Size

| Module | Lines | Notes |
|--------|-------|-------|
| `i18n.js` | ~40 | Layer 0, zero deps |
| `skybox.js` | ~200 | Parallax sky layers, cloud drift, water reflect |
| `menu-box.js` | ~350 | Box render, fold anim, rotation, blur, face mgmt |
| `screen-manager.js` | ~100 | State machine, delegates to MenuBox |
| Face content renderers (4×) | ~80 each | ~320 total for jam-scope stubs |
| `data/strings/en.js` | ~60 | All UI string keys |
| Game.js wiring | ~40 | State change callbacks, face registration |
| SessionStats | ~40 | Stat accumulator |
| **Total** | **~1150** | Pre-jam engine + UI plumbing |

---

## Jam Scope vs Post-Jam

### Jam Scope (April 5 deadline)

- MenuBox with fold-up/fold-down animation
- 4-face rotation with seam-hold settle behavior
- Blur snapshot of frozen world behind faces
- Face 0: scaled-up minimap (read-only, no fast-travel)
- Face 1: flat stat display + quest log (text list)
- Face 2: card deck viewer + consumable items
- Face 3: language selector (en only), volume sliders, quit
- ScreenManager state machine (SPLASH → TITLE → GAMEPLAY → PAUSE)
- Skybox: single lake-mirror sky preset for title, flat gradient for gameplay
- Game over / victory overlays with stats
- i18n layer with English strings

### Post-Jam (LG Content Store)

- Per-biome skybox presets (alpine dusk, harbor fog, warm amber, etc.)
- Animated cloud layers, time-of-day cycle
- Face 0: clickable fast-travel on minimap
- Face 1: branching skill tree with Magic Remote drag
- Face 2: full equipment slots, drag-to-equip
- Face 3: multiple language packs, render resolution, control rebinding
- Magic Remote gyro: tilt to rotate box
- Victory as special box state (fold around the ending)
- Save/load on title Face 0

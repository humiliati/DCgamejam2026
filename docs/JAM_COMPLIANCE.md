# DC Jam 2026 — Compliance Checklist

> Rules source: https://itch.io/jam/dcjam2026
> Audited: 2026-03-26 (one day before submissions open)

---

## Pre-Jam Engine Prep (Explicitly Allowed)

The rules state: *"If it's a feature useful in making any dungeon crawler
(e.g. rendering, movement, interactable doors, general UI)"* — these may
be built before the jam starts. Everything below that is checked off as
pre-jam engine work is fair game.

---

## Mandatory Requirements

### Gameplay Mechanics

| #  | Requirement | Status | Module(s) | Notes |
|----|------------|--------|-----------|-------|
| 1  | First-person exploration at all times | ✅ DONE | Raycaster | Wolfenstein DDA raycaster, 60fps |
| 2  | Step-based movement on square grid | ✅ DONE | MovementController | Queued lerp, 500ms walk, 250ms turn |
| 3  | 90° turns in 4 cardinal directions | ✅ DONE | MovementController | Q/E turn, smooth interpolation |
| 4  | Mouse-look snaps to 90° | ✅ DONE | MouseLook | ±45° free-look offset, cardinal snap on turn |
| 5  | Keyboard controls (WASD/arrows) | ✅ DONE | InputManager, InputPoll | WASD + Q/E + 1-5 cards |
| 6  | Gamepad support | ❌ MISSING | InputManager | Need gamepad backend — pre-jam engine work |
| 7  | Explorable locations | ⚠️ PARTIAL | GridGen, FloorManager | Proc-gen works; hand-authored street templates NOT yet built |

### Character & Combat

| #  | Requirement | Status | Module(s) | Notes |
|----|------------|--------|-----------|-------|
| 8  | Player character with persona | ❌ MISSING | — | No character creation, no portrait, no name. JAM WORK (theme-dependent) |
| 9  | Basic stats (HP/power bar) | ✅ DONE | Player, HUD | HP + Energy bars in HUD |
| 10 | Combat mechanic | ✅ DONE | CombatEngine, CombatBridge | STR stub — simple damage exchange. Full extraction from EyesOnly needed during jam |
| 11 | Method to affect stats | ⚠️ PARTIAL | CardSystem | Cards with heal effects exist. No rest/potion/item USE system yet. Pre-jam: wire item use API |
| 12 | Card/spell system | ✅ DONE | CardSystem, SynergyEngine | 5-card hand, draw/play/discard cycle |

### Win/Lose Conditions

| #  | Requirement | Status | Module(s) | Notes |
|----|------------|--------|-----------|-------|
| 13 | Clear win condition | ❌ MISSING | — | JAM WORK: defeat boss on final floor, show victory screen |
| 14 | Death/failure mechanic | ⚠️ PARTIAL | CombatBridge | Game over on HP=0 stops loop. No game-over SCREEN, no retry, no stats summary |

### Screen Flow

| #  | Requirement | Status | Module(s) | Notes |
|----|------------|--------|-----------|-------|
| 15 | Title screen | ❌ MISSING | — | PRE-JAM: build ScreenManager + title screen with "New Game" |
| 16 | Victory screen | ❌ MISSING | — | JAM WORK: depends on theme + narrative |
| 17 | Game over screen | ❌ MISSING | — | PRE-JAM: build game-over screen with stats + "Retry" button |
| 18 | Floor transition overlay | ✅ DONE | FloorTransition, HUD | Fade to black + label + fade in, SFX-sequenced |

### Content Standards

| #  | Requirement | Status | Notes |
|----|------------|--------|-------|
| 19 | No nudity | ✅ N/A | Text/emoji-based, no photorealistic content |
| 20 | No hateful content | ✅ N/A | Street-Chronicles narrative is civic/espionage themed |
| 21 | General audience suitability | ✅ OK | |

### Submission Requirements

| #  | Requirement | Status | Notes |
|----|------------|--------|-------|
| 22 | Finished, playable game (not prototype) | ❌ NOT YET | This is the jam deliverable |
| 23 | Playable from beginning to end | ❌ NOT YET | Need screen flow: title → play → win/lose |
| 24 | Free to download | ✅ PLANNED | itch.io upload, zero-cost |
| 25 | Theme incorporation | ❌ NOT YET | Theme announced ~1hr before jam opens |
| 26 | Asset disclosure | ✅ PLANNED | Procedural textures + EyesOnly extractions, will document |
| 27 | All dependencies bundled | ✅ DONE | Zero external CDN deps, offline-capable |

---

## Pre-Jam Priorities (Before March 27 4PM)

These are all "features useful in making any dungeon crawler" — explicitly
allowed by the rules. Building them now means the jam period is 100% content,
theme, and polish.

### Priority 1: Screen Flow Manager (blocks jam compliance #15-17, #22-23)

Without this, the game can't be "playable from beginning to end." This is
pure engine plumbing — no game content.

- `engine/screen-manager.js` — State machine: TITLE → GAMEPLAY → VICTORY → GAME_OVER
- Title screen: "New Game" button, controls hint
- Game over screen: stats summary, "Retry" button
- Victory screen: placeholder (content is jam work)
- Wire into Game.js orchestrator

See: `docs/GAME_FLOW_ROADMAP.md`

### Priority 2: General UI Systems (blocks jam compliance #8, #11, #14)

The rules call out "general UI" as pre-jam engine work. These are the
reusable UI components every dungeon crawler needs.

- Dialog/message box system (for NPC text, item descriptions, notifications)
- Inventory screen (press I — grid of collected cards/items)
- Item use API (consume potion → heal, use key → open door)
- Character stat screen (press C — view stats, equipped items)
- Pause menu (ESC — resume, controls, quit)

See: `docs/UI_ROADMAP.md`

### Priority 3: Door Visual Effects (blocks jam polish)

DoorContractAudio handles the sound side. The visual side needs matching
treatment — the "door opening" moment should feel physical, not just a
fade-to-black.

- Door animation overlay (door sprite slides open before fade)
- Transition vignette (radial darkening instead of hard black)
- Floor-specific transition visuals (stairwell descent vs. door entry)

See: `docs/DOOR_EFFECTS_ROADMAP.md`

### Priority 4: Gamepad Support (#6)

The rules recommend gamepad support. InputManager already has a backend
abstraction layer — needs the gamepad implementation.

- `navigator.getGamepads()` polling in InputManager
- D-pad → movement, face buttons → interact/card/turn
- Dead zone handling

### Priority 5: Texture System (already done)

✅ TextureAtlas, SpatialContract texture tables, raycaster UV sampling.
All wired and verified. See `docs/TEXTURE_ROADMAP.md`.

---

## Jam Period Work (March 27 – April 5)

These items MUST be built during the jam because they depend on the
theme announcement or constitute "the game" itself:

1. **Theme incorporation** — unknown until ~3PM March 27
2. **Character persona** — name, portrait, backstory (theme-dependent)
3. **Victory condition** — defeat final boss, narrative payoff
4. **Hand-authored street layouts** — 6 biome grids (content, not engine)
5. **Enemy decks** — per-biome card loadouts (content)
6. **Narrative gating** — quest items, NPC dialogs (content)
7. **Boss encounters** — 2 boss fights with unique mechanics (content)
8. **Victory screen** — theme-integrated ending
9. **Audio assets** — footsteps, ambient, combat SFX, music
10. **Playtesting & balance** — difficulty tuning, pacing
11. **itch.io page** — screenshots, description, asset disclosure

---

## Rating Category Prep

| Category | Current Readiness | Pre-Jam Action |
|----------|------------------|----------------|
| **Overall (Fun & Playability)** | Low — no beginning or end | Screen flow manager |
| **Visuals** | Medium — textured walls, height offsets, parallax | TextureAtlas ✅, more biome textures |
| **Audio** | Medium — DoorContractAudio wired, AudioSystem present | Need actual audio files |
| **Creativity/Innovation** | Unknown — depends on theme | Identify unique mechanic during jam |

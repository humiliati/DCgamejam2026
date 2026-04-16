# Minigame Roadmap — Dungeon Gleaner

**Created**: 2026-04-16
**Status**: Brainstorm + regroup draft (Phase 0 of the minigame arc)
**Supersedes/extends**: `MINIGAME_TILES.md` (tier survey), overlays on `INTERACTIVE_OBJECTS_AUDIT.md`
**Depends on**: `PEEK_SYSTEM_ROADMAP.md`, `UNIFIED_RESTOCK_SURFACE_ROADMAP.md`, `INPUT_CONTROLLER_ROADMAP.md`, `TEST_HARNESS_ROADMAP.md`, `Biome Plan.html`
**Goal**: Identify the minigame set, define the modular/stampable tile contract, wire them into the work-order quest schedule, and spec a testing gallery + harness so every minigame can be exercised sequentially without a full playthrough.

> **Read this first if you're picking up a slice**: §2 (roster), §4 (tile contract), §6 (testing gallery), §7 (phases). §3 is the design rationale; §5 is the per-tile visual/peek/minigame rows that will eat most of the implementation time.

---

## 0. Why this exists

The game today has strong blockout density — 90+ tile types, a peek descriptor registry, a restock surface, and work orders that the dispatcher hands out. What it *doesn't* have yet is a satisfying dwell in any of the hot tiles. Facing a well, a pot, an anvil, a notice board, or a card table fires a peek box and at most a one-button action. The interaction reads as "press to trigger" rather than "sit with this and do something."

The minigame arc fixes that by making every work-station tile a discrete tactile experience that:

1. **Fits narratively** — the minigame is the thing Gleaner is actually doing in the fiction (pumping the well, relighting torches, restocking crates, filing reports, cleaning up after the hero).
2. **Shows off the Magic Remote** — pointer-aim, motion/gesture, and rotation gestures map to Wii-style inputs that keyboard+mouse players still get first-class access to.
3. **Stays cursor-accessible** — every minigame ships with a pointer-only fallback that never requires motion, and a keyboard fallback that never requires pointer (accessibility + testing + desktop playthrough parity).
4. **Plugs into work orders** — the dispatcher can hand out a minigame as a billable job, a bonus earner, or a narrative gate; some are mandatory, most are optional side-revenue.
5. **Lives in a gallery** — every minigame is registered in a central registry and can be booted from a debug floor (and a URL flag) without running the full quest.

---

## 1. Design pillars

**P1. One descriptor, many minigames.** The PeekSystem variant-registry pattern (`PEEK_SYSTEM_ROADMAP.md` §2) already does for peeks what we need for minigames. We extend the descriptor with an optional `minigame` block and a standard mount/unmount lifecycle. No per-minigame lifecycle plumbing in game.js.

**P2. Three input tiers, always.** Every minigame specifies: `pointer` (Magic Remote pointer or mouse), `dpad` (OK/arrows/color buttons), and `motion` (optional — never mandatory). Motion is a showcase layer on top, not a gate. Cursor and D-pad each fully play the game.

**P3. Tile modularity = placement stamping.** A minigame isn't "a tile" — it's a **minigame kind** that binds to a tile type + visual recipe + peek descriptor + input module + reward profile. FloorManager stamps a kind into a biome's tile grid the same way it stamps a door target. Adding a new minigame adds an entry to one registry, not edits to seven files.

**P4. Scope-complete or cut.** Per CLAUDE.md's rule, we don't ship a half-minigame. If a kind can't hit correct-mode quality (three inputs, visual fidelity, work-order hook, gallery entry) it stays out of the pool.

**P5. Grade by session-fit, not novelty.** A minigame that Gleaner would plausibly do twice a shift ranks higher than a one-time spectacle. Repeat-play loops (pump the well, ladle the soup, hammer a repair) get more juice budget than narrative one-shots.

---

## 2. Minigame roster (proposed)

Organized by input archetype, not by tile. Each row names the tile that hosts it, the minigame kind, the primary interaction, and the narrative verb. Tier 1 is "first five" (the existing MINIGAME_TILES.md candidates, now formalized). Tier 2 adds the Magic Remote showcase set. Tier 3 adds card-reuse. Tier 4 is arcade/casual. Tier 5 is narrative-gated investigation. Each kind is a unique ID; multiple kinds may share a tile (`ANVIL` hosts both `ANVIL_HAMMER` and `ANVIL_SHARPEN` via context).

### Tier 1 — Tactile clicky (repeat-play, work-order core)

| Kind | Tile | Verb | Primary input | Pointer showcase | Cursor fallback | D-pad fallback | Motion extra |
|---|---|---|---|---|---|---|---|
| `WELL_PUMP` | WELL (40) | Draw water | Tap cadence | Pointer over handle, click-hold to cycle | Mouse click-hold | OK hold | Motion pump (down-up) |
| `SOUP_LADLE` | SOUP_KITCHEN (47) | Serve food | Scoop arc | Pointer sweep bowl→pot→bowl | Click pot, click bowl | OK repeat | — |
| `ANVIL_HAMMER` | ANVIL (43) | Repair / sharpen | Tap at peak | Pointer at ember, click to strike | Click target | OK press | Wrist-flick gesture |
| `BARREL_TAP` | BARREL (44) | Pour liquid | Spigot hold | Pointer on spigot, hold to pour | Mouse hold | OK hold | Tilt-pour (down) |
| `FUNGAL_HARVEST` | FUNGAL_PATCH (52) | Pick glowing crop | Precision tap | Point + click each glow | Click | Arrows + OK | — |

### Tier 2 — Magic Remote showcase (pointer + gesture)

| Kind | Tile | Verb | Primary input | Pointer showcase | Cursor fallback | D-pad fallback | Motion extra |
|---|---|---|---|---|---|---|---|
| `MOP_CIRCLE` | *(overlay on DETRITUS 39 or grime)* | Scrub grime | Draw circles | Pointer circle-sweep clears grime | Mouse drag | Auto-sweep w/ OK hold | — |
| `HOSE_SPRAY` | DUMP_TRUCK (38) equipped state | Pressure wash | Aim + hold trigger | Crosshair at wall, OK to spray | Mouse aim + click | Arrows aim + OK | Tilt to aim |
| `TORCH_RELIGHT` | TORCH_UNLIT (31) | Transfer flame | Aim ember | Drag flame from lit to unlit with pointer | Click source, click target | Select source (D-pad), confirm OK | — |
| `SAFE_DIAL` | *(overlay on BOOKSHELF/TERMINAL)* | Crack combination | Rotation | Pointer circle-gesture rotates dial | Mouse drag-rotate | L/R arrows step ±1 | Twist wrist |
| `NEST_SWAT` | NEST (50) | Clear vermin | Whack-a-mole | Point + click emerging pests | Click | Arrow-select + OK | Swing swat |
| `DART_THROW` | *(promenade festival overlay)* | Toss pin at board | Aim + release | Pointer aim + OK release (power on hold) | Drag-aim | Charge OK, release | Throw motion |
| `FISHING_CAST` | *(seaway floor — see SEAWAY_FLOOR_DESIGN.md)* | Cast + reel | Cast + rotate | Pointer flick + circular reel | Drag cast, scroll reel | OK cast, arrows reel | Cast flick + reel twist |
| `CRANK_TURN` | MUSIC_BOX / CHARGING_CRADLE (45) | Wind / charge | Circular gesture | Pointer circle draws winding rotation | Mouse circle | OK repeat | Wrist-rotate |

### Tier 3 — Card-reuse (CardSystem doubles as minigame art)

All Tier 3 uses the existing combat-card art/suits (♣/♦/♠/♥) and seeds decks from the starter deck or a kind-specific stub. Hosted on a shared `CARD_TABLE` peek that switches ruleset based on the encountered tile.

| Kind | Tile | Verb | Ruleset | Pointer | Cursor | D-pad | Motion extra |
|---|---|---|---|---|---|---|---|
| `CARD_SOLITAIRE` | CARD_TABLE (unassigned) | Idle pastime | Klondike 7-column | Drag cards | Drag | Arrows select + OK move | — |
| `CARD_MEMORY` | CARD_TABLE / BENCH (41) | Match pairs | Concentration | Click card | Click | Arrows + OK | — |
| `THREE_CARD_MONTE` | *(lantern row hustler)* | Follow the queen | Shuffle then pick | Click card | Click | Arrows + OK | Eye tracking (future) |
| `CARD_SUIT_POKER` | BAR_COUNTER (26) at inn | Tavern stakes | 4-suit triangle poker | Drag bet chips + cards | Drag | Arrows + OK | — |
| `CARD_TRICK_TAKING` | DISPATCHER table | Hearts/spades variant | Trick-taking for work-order bonuses | Drag cards | Drag | Arrows + OK | — |

*Card-reuse is highest-leverage: each new ruleset is ~300-400 lines and the art/data already exists. See `CARD_SYNERGY_SYSTEM.md` and `CARD_AUTHORITY.md` for the existing card surface.*

### Tier 4 — Arcade/casual (pattern-recognition + speed)

| Kind | Tile | Verb | Model | Pointer | Cursor | D-pad | Motion extra |
|---|---|---|---|---|---|---|---|
| `SWEEP_MINE` | *(HERO'S WAKE B1/B2 floor tile)* | Clear booby traps | Minesweeper on the dungeon grid | Click tile | Click | Arrow cursor + OK | — |
| `JEZZBALL_CLEAR` | *(any infested interior)* | Claim territory from spawners | Jezzball (draw lines) | Drag line | Drag | Select edge + OK | — |
| `LIGHTS_OUT` | TORCH_LIT network in a hall | Relight in pattern | Lights Out 5×5 | Click torch | Click | Arrow + OK | — |
| `TETRIS_STACK` | BREAKABLE restock queue | Stack crates | Cascading block-fit (restock-flavored) | Drag block | Drag | Arrows + OK | — |
| `MATCH_THREE` | Coral Bazaar shelves | Sort gems into stacks | Match-3 cascade | Swap tile | Click-swap | Arrows + OK swap | — |
| `KITE_FLIGHT` | Lantern Row festival | Lantern kite game | Flappy-style gravity dodge | Pointer up=rise | Click | OK hold | Tilt-steer |

### Tier 5 — Narrative investigation (conspiracy layer)

These are gated by story phase — they unlock as Gleaner descends and the conspiracy reveal advances (`STREET_CHRONICLES_NARRATIVE_OUTLINE.md`).

| Kind | Tile | Verb | Model | Gate |
|---|---|---|---|---|
| `NOTICE_PIN` | NOTICE_BOARD (42) | Organize dispatches | Drag notices onto pegs in correct cluster | Act 1 dispatcher |
| `CLUE_BOARD` | NOTICE_BOARD (42) advanced state | Connect evidence | String-pinning clue board (yarn between notices) | Act 1 end — faction reveal |
| `CIPHER_DECRYPT` | TERMINAL (36) | Decrypt dispatch | Swap-letter cipher puzzle | Dispatcher's office discovery |
| `CORPSE_TAG` | REFRIG_LOCKER (59) | Tag & file | Match corpse → ID card → shelf | Watchman's Post arc |
| `RITUAL_ALIGN` | *(cellar shrine)* | Align protective sigil | Concentric-ring rotation puzzle | Religious-order thread |

### Tier 6 — Chain meta-games (multi-phase work stations)

A station isn't a single minigame — it chains 2-4 sub-games into a loop. Each sub-game is reusable from the tier lists above; the chain just orchestrates them.

| Chain | Sub-games | Station |
|---|---|---|
| **Foundry repair** | `BELLOWS_PUMP` → `ANVIL_HAMMER` → `ANVIL_SHARPEN` → `BARREL_TAP` (quench) | Foundry biome |
| **Kitchen prep** | `COOK_CHOP` → `COOKING_POT` (stir) → `SOUP_LADLE` | Any inn/kitchen |
| **Charge construct** | `CRANK_TURN` → `CHARGING_DIAL` → `ENERGY_HOLD` | Lantern Row / sealab |
| **Dungeon reset cycle** | `SWEEP_MINE` → `TORCH_RELIGHT` → `BARREL_TAP` (restock oil) → `JEZZBALL_CLEAR` | Any dungeon floor |

---

## 3. Magic Remote showcase policy

The LG webOS Magic Remote (per `INPUT_CONTROLLER_ROADMAP.md` §Phase 1) ships as: Wii-style pointer, 5-way D-pad, OK, Back, color buttons, pointer-move events, scroll wheel, and webOS-keycode special buttons (Red/Green/Yellow/Blue, Channel +/-, Play/Pause). It exposes `pointermove` in the DOM natively. Motion/gyro is available through `DeviceMotion` in the WebView but is noisy — we use it for flavor, never for gates.

**Pointer showcase categories we deliberately hit:**

- *Aim-and-click* — `NEST_SWAT`, `DART_THROW`, `FUNGAL_HARVEST`, `TORCH_RELIGHT`
- *Drag/sweep* — `MOP_CIRCLE`, `HOSE_SPRAY` (aim), `JEZZBALL_CLEAR`
- *Gesture-rotation* — `CRANK_TURN`, `SAFE_DIAL`, `FISHING_CAST` (reel)
- *Hold-with-modulation* — `WELL_PUMP` (cadence), `BARREL_TAP` (stop on time), `ANVIL_HAMMER` (release at peak)
- *Drag-arrange* — `NOTICE_PIN`, `CLUE_BOARD`, all card games

**Accessibility contract:** every minigame publishes a `controlSchema` object like:

```javascript
{
  pointer: { actions: [{id: 'aim', dom: 'pointermove'}, {id: 'fire', dom: 'pointerdown'}] },
  dpad:    { actions: [{id: 'aim', keys: ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']}, {id: 'fire', keys: ['Enter']}] },
  motion:  { optional: true, actions: [{id: 'aim', source: 'gyro.y'}] }
}
```

Test harness (see §6) verifies every kind has a full `pointer` and `dpad` schema before allowing the minigame to be flagged shippable. Motion may be absent; motion-only inputs are an automatic fail.

---

## 4. Modular/stampable minigame tile contract

A minigame kind is a frozen registration object. Adding a new kind = one PR to one file.

### 4.1 Registration schema

```javascript
MinigameRegistry.register('WELL_PUMP', {
  // Identity
  kindId:       'WELL_PUMP',
  tile:         TILES.WELL,
  narrative:    'draw-water',       // maps to quest verb vocabulary
  tier:         1,
  repeatPlay:   true,                // appears in daily work orders
  unlockPhase:  0,                   // dispatcher phase required

  // 3D viewport visual (read by FloorManager + Raycaster)
  visual: {
    wallHeight:   { exterior: 0.5, interior: 0.5, dungeon: 0.5 },
    tileOffset:   -0.10,              // step-fill cavity depth (well basin)
    texture:      'well_stone_rim',
    wallDecor:    'decor_well_water', // reflective water sprite inside the cavity
    billboard:    null,
    freeform:     null,
    walkable:     false,
    opaque:       true
  },

  // Peek descriptor (plugs into PeekSystem)
  peek: {
    variant:      'bar_counter_clicky',  // reuse existing peek box
    innerLabel:   'Pump',
    subLabel:     '🪣 water pail',
    juice:        { entryAnim: 'slide-up', glowPulse: true, particles: 'dust' },
    onOpen:       'Minigame.mount',      // PeekSystem calls Minigame.mount(kind, ctx)
    onHide:       'Minigame.unmount'
  },

  // Minigame module wiring
  minigame: {
    module:       'WellPumpMinigame',    // Layer 3 module
    controlSchema: { /* pointer/dpad/motion spec — see §3 */ },
    difficulty:    [{ easy: 4, medium: 6, hard: 10 }], // tap counts
    durationMs:    [3000, 6000],         // target min/max play length
    rewards:       { water: 1, gold: 0, readiness: 0.02 }
  },

  // Work-order integration
  workOrder: {
    mandatoryIn:  ['tutorial-well'],     // quest IDs that require this
    bonusTag:     'daily-water',         // recurring bonus
    groupTag:     'sanitation'
  },

  // Test harness
  harness: {
    galleryFloor:  'test.gallery',
    galleryCoord:  [3, 4],
    seedState:     { initialTaps: 0, bucketFull: false }
  }
});
```

### 4.2 How FloorManager consumes this

Floor data shifts from `grid[y][x] = TILES.WELL` to a minigame stamp when the tile is a minigame host:

```javascript
// In floor data:
minigames: {
  "3,4": { kindId: 'WELL_PUMP' },
  "3,9": { kindId: 'ANVIL_HAMMER', difficulty: 'hard' }
}
```

FloorManager on generate:
1. Iterates `minigames` map.
2. For each stamp, places the registered `tile` at `(x,y)`.
3. Pulls `visual` into `tileWallHeights`, `textures`, `wallDecor`, `tileHeightOffsets`.
4. Registers the peek descriptor (if not already global) with PeekSystem.
5. Notifies GameActions of the stamp so work-order bindings pick it up.

### 4.3 Per-tile visual language

Every minigame kind chooses one or more techniques from the 3D viewport toolbox (the same toolbox that already built HEARTH and DOOR_FACADE):

| Technique | Engine hook | When to use |
|---|---|---|
| **Wall-height stratum** | `tileWallHeights` per biome | Base read: is this tile at your foot (0.0-0.5), waist (0.5-1.0), full wall (1.0+)? |
| **Step-fill cavity** | Negative `tileHeightOffset` | Basins: WELL, SOUP pot rim, BARREL top, sunken fire pit |
| **Wall decor billboard** | `wallDecor` sprite | Fire, water ripple, smoke, sparks — renders inside the cavity or on the wall face |
| **Freeform alpha mask** | `freeform` recipe | Arch openings, portholes, door insets — DOOR_FACADE pattern |
| **Floating strip** | Canopy/ROOF_EAVE system | Overhead fixtures — bell, lantern, hanging brazier |
| **Pedestal sprite** | BillboardSprite + z-buffer occlusion | Standalone object centered on a walkable tile (notice board post, pump handle) |
| **Animated texture** | Frame-cycled atlas entry | Flame, dial glow, meter needle |

A minigame's spec row in §5 picks exactly which of these it uses — no ad-hoc inventions.

### 4.4 Peek + minigame lifecycle

The PeekSystem FSM (IDLE → SHOWING → OPEN → CLOSING) remains authoritative for facing/debounce. When the peek enters OPEN and the descriptor has a `minigame` block, PeekSystem calls `Minigame.mount(kindId, ctx)`. Minigame mount returns a canvas overlay + DOM controls layer with its own input listeners. On CLOSING (player turns away or presses OK), Minigame.unmount is called and any in-flight session is either committed (submit) or abandoned (save partial progress for repeat-play kinds). Minigame owns its own input — it doesn't compete with MovementController because MovementController is already paused during a peek open state.

### 4.5 Captured-input exit contract (PF-5)

Tier 1 clickies never steal WASD — the player walks away and the peek dismisses itself (see PF-4's approach-signal semantics). Tier 2+ kinds that remap WASD for in-minigame use (`SAFE_DIAL` rotation, `LIGHTS_OUT` cursor, `TETRIS_STACK` move/rotate, `MATCH_THREE` swap, `CARD_SOLITAIRE` pile navigation, etc.) can't rely on "walk away to exit" because movement is captured. They publish a `captures` flag on the registration object and in return get a **shared exit overlay** supplied by `MinigameExit`.

A captured minigame MUST:

1. Set `captures: true` on its registration (`controlSchema` still required).
2. Call `MinigameExit.mount({ kindId, controls, onExit })` on session start. `controls` is a terse array of `{keys: ['W','A','S','D'], label: 'move'}` entries used to render the input banner.
3. Call `MinigameExit.unmount()` on session end (win, abandon, forced close).
4. Route in-minigame Back/Escape keys through `MinigameExit.handleKey(key)` **first** — if the exit overlay consumed the key (first Back = confirm prompt, second Back = commit exit), it returns `true` and the minigame skips its own handler.

The exit overlay renders on top of the minigame canvas with:

- **Top-edge input banner** — scrolling left-to-right, chips of `[W A S D] move · [SPACE] rotate · [ESC] exit`. Rendered at `HUD.getSafeTop(vpH) + 8` (new helper parallel to `getSafeBottom`). High-contrast so it reads on any minigame background.
- **[×] corner target** — bottom-right of the viewport (not footer-colliding), 44×44px Magic Remote–friendly hitbox, tier-appropriate tint (red on confirm-pending). Labeled "EXIT" on hover/focus.
- **300ms exit grace** — after `mount()` the [×] ignores clicks for 300ms so the player who just clicked through to enter the minigame can't accidentally click-through to exit it. Input-banner fades in over the same 300ms so it doesn't flash.
- **Two-stage exit** — first `[×]` press or Back press shows "Exit? Progress will be lost" with `[OK] Cancel` / `[BACK] Exit`. Second Back commits; OK cancels. This prevents fat-finger exits on the Magic Remote without blocking intentional ones.

`MinigameExit.isActive()` returns true between mount and unmount (including the confirm stage). `InteractPrompt.check()` and `CobwebNode.update()` must yield when `isActive()` is true, same precedent as they yield to peek overlays. MovementController is paused via the same Game-layer hook used for peeks.

Registration-schema addition (non-breaking — optional fields):

```javascript
MinigameRegistry.register('SAFE_DIAL', {
  // ... existing fields ...
  minigame: {
    module: 'SafeDialMinigame',
    captures: true,                // ← new: subscribes to MinigameExit
    controlSchema: {
      dpad: {
        actions: [
          { id: 'rotate', keys: ['ArrowLeft','ArrowRight'], label: 'rotate ±1' },
          { id: 'commit', keys: ['Enter'], label: 'commit number' },
          { id: 'exit',   keys: ['Escape','Backspace'], label: 'exit' }
        ]
      },
      pointer: { /* ... */ }
    }
  }
});
```

The `label` field on each action is what the input banner displays — it's the one new piece authors need to supply.

**Harness check** (§6 addition): before a captured kind is flagged shippable, the harness must verify (a) `mount()` was called within 120ms of peek-OPEN, (b) the banner shows at least one chip per `dpad.actions` entry, (c) `[×]` hitbox is ≥40px on each side, (d) exit grace actually suppresses clicks for the first 300ms.

---

## 5. Per-kind spec rows (living table)

This section will grow as kinds are spec'd. Each row: kind id · tile · visual recipe · peek variant · minigame module · reward profile · work-order hook · status.

> **Template** (copy for each kind):
>
> **`KIND_ID`** — Tile, verb. Visual: wallHeight/offset/texture/decor. Peek: variant, labels, juice. Minigame: module, input schema, duration, win condition. Rewards: resource type + quantity. Work-order: daily? bonus? gated? Status: spec / stub / impl / gallery / shipped.

Populated in the brainstorm phase for Tier 1, stubs for the rest. Agents picking up slice work fill in their tier's rows as implementation proceeds.

### Tier 1 (first-five) — spec

**`WELL_PUMP`** — WELL (40), draw water. Visual: 0.5× height, -0.10 offset, `well_stone_rim` texture, `decor_well_water` cavity sprite, no billboard. Peek: `bar_counter_clicky`, "Pump" / "🪣 water pail", slide-up + glow pulse + dust particles, `peek_creak` sfx. Minigame: `WellPumpMinigame` — 4/6/10 tap cadence with overflow risk if too fast; pointer hold-modulation, D-pad OK hold, motion pump. Duration 3-6s. Win: bucket fills without overflow. Rewards: 1 water, +0.02 readiness. Work-order: daily-water bonus. Status: spec.

**`SOUP_LADLE`** — SOUP_KITCHEN (47), serve food. Visual: 0.7× height, -0.15 offset, `cauldron_iron` texture, `decor_soup_steam` cavity sprite. Peek: `bar_counter_clicky`, "Ladle" / "🍲 rations". Minigame: `SoupLadleMinigame` — pointer sweep arc (scoop-and-serve) or tap-to-ladle each bowl. 3 bowls per session. Rewards: 3 rations (clears hunger for self + NPCs within N tiles). Work-order: daily-meal bonus. Status: spec.

**`ANVIL_HAMMER`** — ANVIL (43), repair/sharpen. Visual: 0.5× height, 0 offset, `anvil_iron_dark` texture, `decor_anvil_ember` glow sprite. Peek: `bar_counter_clicky`, "Strike" / "🔨 repair". Minigame: `AnvilHammerMinigame` — ember glow swells and fades; strike at peak brightness for perfect hit (3/5 perfect = repair, sharpen, or quick-buff). Rewards: repair equipped tool, sharpen bonus, or forge quest item. Work-order: foundry gate. Status: spec.

**`BARREL_TAP`** — BARREL (44), pour liquid. Visual: 0.6× height, 0 offset, `barrel_oak_banded` texture, `decor_barrel_spigot` wall decor. Peek: `bar_counter_clicky`, "Tap" / "🍺 vessel". Minigame: `BarrelTapMinigame` — hold to pour, release at target line (variable vessel capacities). Rewards: liquid fills container (water, oil, ale). Work-order: restock-oil, daily-ale. Status: spec.

**`FUNGAL_HARVEST`** — FUNGAL_PATCH (52), pick glow. Visual: 0.0× (walkable, floor glow), 0 offset, `fungal_floor_glow` animated texture, `decor_mushroom_bloom` billboard. Peek: `bar_counter_clicky`, "Harvest" / "🍄 glow-crop". Minigame: `FungalHarvestMinigame` — N mushrooms visible, each is a pointer-click target; risk: picking disturbs nearby creature eat-node (EnemyAI hook). Rewards: N glow-crop items. Work-order: dungeon-ingredients. Status: spec.

### Tier 2+ — stubs (to be expanded in Phase 1-5)

| Kind | Row status |
|---|---|
| `MOP_CIRCLE` | stub |
| `HOSE_SPRAY` | stub (partial impl exists in PressureWashSystem) |
| `TORCH_RELIGHT` | stub (TorchPeek exists, pointer transfer is the new piece) |
| `SAFE_DIAL` | stub |
| `NEST_SWAT` | stub |
| `DART_THROW` | stub |
| `FISHING_CAST` | stub (blocked on seaway floor) |
| `CRANK_TURN` | stub |
| `CARD_SOLITAIRE` | stub |
| `CARD_MEMORY` | stub |
| `THREE_CARD_MONTE` | stub |
| `CARD_SUIT_POKER` | stub |
| `CARD_TRICK_TAKING` | stub |
| `SWEEP_MINE` | stub |
| `JEZZBALL_CLEAR` | stub |
| `LIGHTS_OUT` | stub |
| `TETRIS_STACK` | stub |
| `MATCH_THREE` | stub |
| `KITE_FLIGHT` | stub |
| `NOTICE_PIN` | stub (cozy-interiors notice board already called out) |
| `CLUE_BOARD` | stub (Act 1 narrative gate) |
| `CIPHER_DECRYPT` | stub |
| `CORPSE_TAG` | stub |
| `RITUAL_ALIGN` | stub |

---

## 6. Testing gallery + test harness

### 6.1 Gallery floor

**Already exists**: Floor `"1.9"` — `engine/floor-blockout-test-gallery.js`. 24×20 interior (inn biome) with five alcove clusters off a central corridor plus a final bay:

- Row 2 alcoves: **WELL**, **ANVIL**, **SOUP_KITCHEN**, **BARREL** (tier-1 clicky set)
- Row 7 alcoves: **NOTICE_BOARD**, **CHARGING_CRADLE**, **SWITCHBOARD**, **BENCH** (tier-2/5 surfaces)
- Row 12 alcoves: **COT**, **BAR_COUNTER**, **HEARTH**, **TABLE** (rest/reference tiles)
- Row 17 bay: **FUNGAL_PATCH** scatter + **BONFIRE** + **PILLAR** (open-floor tier-1 + reference)
- Spawn at `(21, 18)` facing north; DOOR_EXIT at `(21, 19)` returns to floor `"1"` (Promenade).

Access today: `test-harness.html?debug=1&floor=1.9` (debug launcher). This roadmap adopts that path rather than inventing a new one.

**What Phase 1 adds to the existing gallery**, not replaces:
1. Per-alcove floor placard sprites with minigame kind name (reusing NPC nameplate render).
2. A "next minigame" teleport pedestal inside each alcove that advances the tester to the next kind in registration order (Magic Remote-friendly — no long walks).
3. A second gallery pass once Tier 2+ kinds land (currently the physical gallery covers Tier 1 + scaffolding tiles; Tier 2-5 kinds will need either additional stamps on 1.9 or a sibling floor `"1.9.1"`).
4. A harness HUD overlay (on by default in this floor only) showing the current kind, elapsed ms, and input-schema coverage counters.

### 6.2 Test harness (`minigame-harness.js`, Layer 5 dev-only)

A small module that:

1. **Registers a harness HUD** — shows the current kind, elapsed ms, input schema coverage, click/keypress counters, and a Pass/Fail toggle.
2. **Runs a scripted sweep** — `Harness.runAll()` walks every registered kind, mounts its minigame programmatically at the gallery tile, simulates a reference run (or waits for human input if `auto:false`), records outcome, moves on.
3. **Emits a report** — JSON blob with per-kind `{ kindId, duration, inputsExercised, rewardsGranted, errors[] }`. Copy-to-clipboard via the existing `DebugPerfMonitor.copyReport()` pattern.
4. **Publishes a coverage gate** — a kind only ships (graduates from "stub" to "shipped" in §5) when the harness has three clean runs with pointer-only, D-pad-only, and motion-optional schemas exercised.

The harness lives next to `debug-perf-monitor.js` and activates on the same URL flag. Perf monitor + harness share a boot sequence so we can measure minigame runtime cost on-device.

### 6.3 What the harness does NOT do

- It does not assert game-feel. Feel is a human playtest pass after the harness signs off on correctness/coverage/perf.
- It does not automate motion/gyro. Those are human-only.
- It does not gate implementation order — any kind can be built in any order; the harness just tells you when a kind is integration-ready.

### 6.4 PF-5 captured-exit harness stub

For any kind registered with `minigame.captures: true` (see §4.5), the harness adds a dedicated captured-exit sub-test before the kind can graduate past "impl":

```js
// minigame-harness.js — pseudocode, lives next to the per-kind runners
function runCapturedExitSuite(kindId) {
  var reg = MinigameRegistry.get(kindId);
  if (!reg || !reg.minigame || !reg.minigame.captures) return { skipped: true };

  var results = { kindId: kindId, checks: [] };

  // (a) mount() was called within 120ms of peek-OPEN
  var t0 = performance.now();
  Harness.openPeek(kindId);
  Harness.waitForMinigameMount(kindId);
  var mountDt = performance.now() - t0;
  results.checks.push({ id: 'mount_latency_ms', value: mountDt, pass: mountDt <= 120 });

  // (b) banner shows ≥1 chip per dpad.actions entry
  var dpadActions = reg.minigame.controlSchema.dpad.actions.length;
  var chipCount   = MinigameExit._debug_chipCount ? MinigameExit._debug_chipCount() : 0;
  results.checks.push({ id: 'banner_chip_coverage', value: chipCount, expected: dpadActions,
                        pass: chipCount >= dpadActions });

  // (c) [×] hitbox is ≥40px on each side
  var cfg = MinigameExit._CONFIG;
  results.checks.push({ id: 'close_hitbox_min', value: cfg.CLOSE_SIZE, pass: cfg.CLOSE_SIZE >= 40 });

  // (d) grace actually suppresses clicks for 300ms
  var consumedDuringGrace = Harness.simulateCloseClick();  // fires immediately after mount
  results.checks.push({ id: 'grace_suppresses_click', value: consumedDuringGrace,
                        pass: consumedDuringGrace === true && MinigameExit.isActive() });

  // (e) after grace, second Back commits (two-stage confirm)
  Harness.sleep(cfg.GRACE_MS + 20);
  MinigameExit.handleKey('Escape');
  results.checks.push({ id: 'back_arms_confirm', pass: MinigameExit.isConfirming() });
  MinigameExit.handleKey('Escape');
  results.checks.push({ id: 'back_commits_exit', pass: !MinigameExit.isActive() });

  return results;
}
```

A kind fails the captured-exit suite if any check returns `pass: false`. The sub-test runs once per kind per harness sweep; results feed into the §6.2 JSON report alongside the standard per-kind row.

Dev-only hooks the harness relies on (expose from `minigame-exit.js` behind a `window.__DEV__` guard when added):

- `_debug_chipCount()` — number of rendered banner chips
- `_debug_bannerBounds()` — `{ x, y, w, h }` for on-screen banner
- `_debug_closeBounds()` — `{ x, y, w, h }` for [×] hitbox

These stay un-exported in production; adding them is a separate follow-up when the harness module lands. PF-5's module already exposes `_CONFIG` (frozen), `isActive()`, `isConfirming()`, and `isInGrace()`, which cover the structural checks above.

---

## 7. Phased execution order

**Phase 0 — Regroup (this doc).** Land this MINIGAME_ROADMAP.md, cross-reference from `TABLE_OF_CONTENTS_CROSS_ROADMAP.md` and `DOC_GRAPH_BLOCKOUT_ARC.md`. Lock the Tier 1 set. Open questions in §8.

**Phase 1 — Modular infrastructure (no minigames yet).**
1. `engine/minigame-registry.js` — Layer 1 IIFE. Register, lookup, iterate, validate controlSchema.
2. Extend `peek-system` descriptor with optional `minigame: { module, controlSchema, config }` field.
3. `engine/minigame-base.js` — Layer 3 IIFE. Abstract mount/unmount/tick/render. Canvas overlay + DOM controls layer. Input routing (pointer/keyboard/gamepad/webOS keycode aware).
4. Create `test.minigames` floor + harness scaffold. No real minigames yet — the harness runs a `Null` minigame to prove the plumbing works.
5. Ship gate: can navigate to gallery floor, mount/unmount a Null minigame, harness records the run, no stutters.

**Phase 2 — Tier 1 clicky set.**
1. `WELL_PUMP`, `SOUP_LADLE`, `ANVIL_HAMMER`, `BARREL_TAP`, `FUNGAL_HARVEST`.
2. All share the `bar_counter_clicky` peek variant; each gets its own Minigame module.
3. Stamp one of each at the gallery and one in the live world (promenade well, inn soup kitchen, foundry anvil, cellar barrel, fungal cellar patch).
4. Work-order: dispatcher adds `daily-water`, `daily-meal`, `foundry-repair`, `daily-ale`, `dungeon-ingredients` to the rotation.
5. Ship gate: harness passes all five, live-world instances feel identical to gallery instances.

**Phase 3 — Magic Remote showcase set.**
1. `MOP_CIRCLE`, `HOSE_SPRAY` (finish), `TORCH_RELIGHT` (pointer transfer), `SAFE_DIAL`, `NEST_SWAT`.
2. `CRANK_TURN` as the final rotation primitive (reused by music-box, construct charger, safe dial variants).
3. Ship gate: each passes with motion layer off (cursor + D-pad only).

**Phase 4 — Card-reuse set.**
1. `CardTable` peek — one peek descriptor that hosts a ruleset parameter.
2. Rulesets: `CARD_SOLITAIRE`, `CARD_MEMORY`, `THREE_CARD_MONTE`, `CARD_SUIT_POKER`, `CARD_TRICK_TAKING`.
3. Decks pull from `CardSystem`; wins grant gold + small stat bumps.

**Phase 5 — Arcade/casual set.**
1. `SWEEP_MINE`, `JEZZBALL_CLEAR`, `LIGHTS_OUT`, `TETRIS_STACK`, `MATCH_THREE`, `KITE_FLIGHT`.
2. These are the "proof that the modular system scales" entries.

**Phase 6 — Narrative investigation + chains.**
1. `NOTICE_PIN`, `CLUE_BOARD`, `CIPHER_DECRYPT`, `CORPSE_TAG`, `RITUAL_ALIGN`.
2. Wire Tier 6 chain meta-games from existing sub-games.
3. Gate on dispatcher phase + narrative flags.

**Phase 7 — Harness maturity + benchmarking.**
1. Export harness report off-device (LG webOS TV target).
2. Per-minigame frame budget gate (≤2% framerate regression per PEEK_SYSTEM juice budget norms).
3. Polish pass, accessibility audit (design:accessibility-review skill, WCAG AA).

---

## 8. Regroup decisions (locked 2026-04-16)

- **Tier 1 roster**: LOCKED. `WELL_PUMP`, `SOUP_LADLE`, `ANVIL_HAMMER`, `BARREL_TAP`, `FUNGAL_HARVEST`. All five ship in Phase 2 as spec'd. No substitutions.
- **Work-order gating**: Mostly optional. All minigames default to bonus-revenue / side-earner. Only explicit narrative gates (Tier 5 investigation kinds) block quest progression. Tier 1 kinds are dispatcher-advertised but **not required** to clear a shift.
- **Card-reuse architecture**: One shared `CardTable` peek hosting a ruleset parameter. New rulesets register with `CardTable.registerRuleset(id, rules)` rather than creating new peek modules.
- **Gallery access**: Use the existing `engine/floor-blockout-test-gallery.js` floor `"1.9"`. Access via `test-harness.html?debug=1&floor=1.9`. No new gallery floor invented; no debug door on floor 1.6 (reject that earlier speculation — URL / debug launcher is the path).
- **Build priority**: **Living-infrastructure tiles first, dungeon embellishment second.** Tier 1 (WELL/SOUP/ANVIL/BARREL/FUNGAL) and the Tier 2 kinds that hang off living-infra surfaces (NOTICE_PIN, CRANK_TURN on CHARGING_CRADLE, SWITCHBOARD puzzle) come ahead of dungeon-only kinds (`SWEEP_MINE`, `JEZZBALL_CLEAR`, chain meta-games that live in dungeons). Tier 5 narrative investigation stays deferred behind these — the world gets "more breath" before it gets conspiracy gates.
- **Reward model**: First-perfect-score grants a **small currency / item / card** one-time reward. Subsequent plays are flavor (no reward, or a negligible ambient reward). Economy balancing deferred — update `RESOURCE_ECONOMY.md` (or equivalent resource-balance doc) once Tier 1 kinds are playable and we can measure throughput.
- **Next step**: Regroup first. This doc lands; Phase 1 infrastructure does not start until the next cowork session.

### 8.1 Phase reordering per build priority

The original §7 phases are reshuffled to match the "living-infra first, dungeon second" priority:

1. **Phase 1** — Modular infrastructure (unchanged).
2. **Phase 2** — Tier 1 tactile clicky (unchanged — these are all living-infrastructure tiles).
3. **Phase 3 (was Phase 3 + 5 interleaved)** — Living-infra-hosted kinds from Tier 2 and Tier 5: `NOTICE_PIN` (notice board), `CRANK_TURN` + `CHARGING_DIAL` (cradle), `SWITCHBOARD_ROUTE` puzzle. These extend the surface density of the promenade and interior floors before the dungeon pass.
4. **Phase 4** — Magic Remote showcase that spans both surfaces: `MOP_CIRCLE`, `HOSE_SPRAY`, `TORCH_RELIGHT`, `SAFE_DIAL`, `NEST_SWAT`.
5. **Phase 5** — Card-reuse (`CardTable`) rulesets. Living-infra hosts (inn bar counter, dispatcher table, bench).
6. **Phase 6** — Dungeon embellishment: `SWEEP_MINE`, `JEZZBALL_CLEAR`, `LIGHTS_OUT`, `TETRIS_STACK`, chain meta-games.
7. **Phase 7** — Narrative investigation (`CLUE_BOARD`, `CIPHER_DECRYPT`, `CORPSE_TAG`, `RITUAL_ALIGN`).
8. **Phase 8** — Harness maturity + benchmarking (was Phase 7).

§7 above reflects the original numbering; the sequence here is authoritative once Phase 1 ships.

## 8b. Still-open questions (for next regroup)

1. **Motion layer default.** Motion input off (user opts in) or on (toggle to disable)? Accessibility instinct says off-by-default.
2. **Per-kind LOC budget.** Working estimate: 300-500 lines per tactile Tier 1 module, 400-700 for card rulesets, 500-900 for arcade. Flag if too generous.
3. **Motion noise floor.** Target gyro dead zone / gesture window. My placeholder: 3° dead zone, 300ms recognizer window. Tune on-device.
4. **Resource-economy doc target.** Does `RESOURCE_ECONOMY.md` exist or should we create it? (Checked `docs/RESOURCE_DESIGN.md` exists — is that the update target, or a dedicated economy doc?)
5. **Gallery 1.9 evolution.** Floor 1.9 covers Tier 1 + scaffolding. When Tier 2+ kinds land, do we extend 1.9 (stamp more tiles), create sibling `"1.9.1"`, or convert 1.9 into an index-floor that portals to per-tier showcase floors?
6. **First-perfect reward table.** Currency amount, item pool, card pool — draft a 3-column table as part of the `RESOURCE_ECONOMY` update, or inline in each minigame descriptor's `rewards` block?


---

## 9. Cross-references

- `MINIGAME_TILES.md` — original tier survey (kept as historical artifact; Tier 1 matches).
- `INTERACTIVE_OBJECTS_AUDIT.md` — rendering audit; every minigame kind must keep its tile's audit row green.
- `PEEK_SYSTEM_ROADMAP.md` — peek descriptor + lifecycle FSM that minigames mount into.
- `UNIFIED_RESTOCK_SURFACE_ROADMAP.md` — restock wheel is adjacent; restock-centric minigames (crates, torches) should feed into the wheel, not replace it.
- `INPUT_CONTROLLER_ROADMAP.md` — Magic Remote + D-pad + gamepad; controlSchema consumers live here.
- `TEST_HARNESS_ROADMAP.md` — gallery floor + harness plug into the existing `test-harness.html` and `debug-perf-monitor.js` plumbing.
- `Biome Plan.html` — biome → minigame kind legal-combinations table (to be added as Biome Plan v6 addendum).
- `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` — narrative gates for Tier 5.
- `DOC_GRAPH_BLOCKOUT_ARC.md` — register this doc in the doc graph (green cluster — implementation spec).
- `TABLE_OF_CONTENTS_CROSS_ROADMAP.md` — assign a DOC-nnn number.
- `engine/floor-blockout-test-gallery.js` — floor `"1.9"` gallery with every Tier 1 tile already laid out in alcoves. Phase 1 extends it rather than replacing.
- `test-harness.html` — debug launcher; the minigame harness plugs into the same UI.
- `RESOURCE_DESIGN.md` (likely target for the deferred economy update; confirm whether a dedicated `RESOURCE_ECONOMY.md` is needed).

---

*End of Phase 0 brainstorm. Next: regroup on the §8 questions, then start Phase 1 infrastructure.*

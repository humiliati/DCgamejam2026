# DC Jam 2026 — Extraction Roadmap

> 8 passes to go from EyesOnly scaffold → playable first-person dungeon crawler.
> Each pass produces a testable, runnable state.

---

## Pass 1 — Foundation (Scaffold + Grid + Raycaster)

**Goal:** Walk around a hardcoded dungeon in first-person.

**Extract from EyesOnly:**
- `GameLoop` → `engine/game-loop.js` (already clean IIFE, copy direct)
- `TILES` constants → `engine/tiles.js` ✅ done
- `SeededRNG` → `engine/rng.js` ✅ done

**Build new:**
- `engine/raycaster.js` — Wolfenstein-style raycaster reading from `grid[y][x]`
  - Wall casting with textured or flat-colored walls
  - Floor/ceiling gradient
  - Camera at player position, 90° FOV
- `engine/input.js` — Input abstraction layer
  - `InputManager.onAction(name, callback)` pattern
  - Keyboard backend: WASD/arrows → `step_forward`, `step_back`, `turn_left`, `turn_right`, `interact`
  - Stub for future Magic Remote backend
- `engine/minimap.js` — Top-down 160×160 canvas overlay showing explored tiles
- `engine/game.js` — Thin orchestrator: init grid, init player, wire loop → raycaster render
- `index.html` ✅ done (shell with canvas, HUD, card tray, minimap)

**Test state:** Open in browser. WASD moves through a hand-authored 16×16 dungeon. First-person walls render. Minimap shows position.

**Source files to read:**
- `/public/js/game-loop.js` (107 lines — copy almost verbatim)
- `/public/js/gone-rogue-canvas.js` (understand camera transform for minimap)

---

## Pass 2 — Procedural Dungeons (Floor Gen + Biomes)

**Goal:** Generate a new random dungeon each floor with themed visuals.

**Extract from EyesOnly:**
- `FloorGenCore.generateFloor()` → `engine/grid-gen.js`
  - Strip: tutorial floor logic, projectile reset, NPC/shop/breakable spawning, ARG refs
  - Keep: BSP room placement, A* corridor carving, room connectivity validation
  - Adapt: output a clean `{ grid[][], rooms[], doors[] }` object instead of mutating monolith ctx
- `BiomeConfig.getFloorType()` / `getBiome()` → `engine/biomes.js`
  - Retheme: FOREST→CRYPT, MALL→SEWER, INDUSTRIAL→FORTRESS, AEROSPACE→ABYSS, GREY_CAVE→CAVERN
  - Keep: weighted selection by floor depth, boss floor overrides
- `BiomeVisuals.buildVisualGrid()` → adapt for wall texture selection per biome
  - Map biome color palettes to raycaster wall tint colors

**Build new:**
- Floor transition UI (fade to black → "Descending to Floor N" → fade in)
- Stairs placement logic (STAIRS_DN placed in a dead-end room, STAIRS_UP at player spawn)

**Test state:** Press `>` to descend. New floor generates with different room layouts. Biome colors shift as you go deeper. Minimap updates.

**Source files to read:**
- `/public/js/floor-gen-core.js` (~300 lines, core BSP + A*)
- `/public/js/floor-generator.js` (~500 lines, spawning orchestration)
- `/public/js/biome-config.js` (~150 lines, floor type + biome weights)
- `/public/js/biome-visuals.js` (visual grid generation)

---

## Pass 3 — Door Contracts + Multi-Floor Navigation

**Goal:** Stairs work correctly with spawn protection and seamless transitions.

**Extract from EyesOnly:**
- `DoorContractSystem` → `engine/door-contracts.js` (copy near-verbatim)
  - `findSpawnNearDoor()` — expanding ring search for spawn tile
  - `tickDoorSpawnProtect()` — guardrail countdown
  - Contract patterns: advance (stairs down), retreat (stairs up)
- `FloorTransitionSystem.applyDoorContract()` logic
  - Wire into floor gen: after grid generated, apply contract to place player near correct staircase

**Build new:**
- Floor stack (array of previously visited floors for backtracking)
  - Store `{ grid, rooms, doors, enemies, items, biome }` per visited floor
  - Regenerate or cache — cache is simpler for jam scope
- "You feel a draft..." proximity hint near stairs

**Test state:** Descend via stairs, arrive near the up-staircase on the new floor. Ascend back, arrive near the down-staircase. 5-step guardrail prevents accidental re-entry.

**Source files to read:**
- `/public/js/door-contract-system.js` (~250 lines — nearly standalone)
- `/public/js/floor-transition-system.js` (transition orchestration)

---

## Pass 4 — Enemies + Stealth

**Goal:** Enemies patrol the dungeon. Player can sneak or be detected.

**Extract from EyesOnly:**
- `EnemyAISystem` → `engine/enemy-ai.js`
  - `updateEnemyPath()` — patrol (back-and-forth), circular, stationary rotation
  - `_moveEnemyToPoint()` — grid movement with collision
  - Sight cone + LOS raycasting
  - Awareness states: UNAWARE (0-30) → SUSPICIOUS (31-70) → ALERTED (71-100) → ENGAGED
  - Awareness decay (5 pts/sec)
  - Strip: ARG-specific enemy types, monolith ctx coupling
  - Adapt: enemies need `facing` direction for first-person encounter rendering

**Build new:**
- Enemy spawner (place 2-5 enemies per floor based on floor type)
- First-person enemy rendering in raycaster (sprite billboarding or simple scaled quads)
- Awareness indicator in HUD (eye icon: green → yellow → red)
- Stealth modifier from player stats

**Test state:** Enemies wander on patrol paths visible on minimap. Walk into sight cone → awareness rises → "!" appears in viewport. Sneak behind them = no detection.

**Source files to read:**
- `/public/js/enemy-ai-system.js` (~400 lines)
- `/public/js/enemy-intent-system.js` (chase behavior)
- `/public/js/gone-rogue-movement.js` (A* for enemy chase pathing)

---

## Pass 5 — Combat Engine (STR + Cards)

**Goal:** Engage enemies in simultaneous-turn-resolution card combat.

**Extract from EyesOnly:**
- `StrCombatEngine` → `engine/combat-engine.js`
  - State machine: idle → countdown → selecting → resolving → post_resolve
  - `calculateAdvantage()` — ambush/neutral/disadvantaged/flanked
  - `calculateHit()` — 70% base + DEX delta ± advantage ± distance
  - `calculateDamage()` — 2 + STR delta + card bonus + advantage modifiers
  - `checkFlanking()` — directional attack logic
  - Strip: terminal output formatting, emoji rendering
  - Adapt: output combat events as structured objects for HUD rendering
- `CardSystem` → `engine/card-system.js`
  - Card definition loading from `data/cards.json`
  - Quality rolls (Cracked → Perfect)
  - Hand management (draw 5, play 1 per round)
  - Card cost validation (ammo, energy, focus)
- Card data → `data/cards.json`
  - Retheme ~15 core cards for dungeon fantasy (sword slash, shield block, fireball, heal, etc.)
  - Keep the JSON schema and effect system identical

**Build new:**
- Combat viewport overlay (enemy portrait, health bar, advantage indicator)
- Card tray activation (click card to play during selection phase)
- Combat log (scrolling text at bottom of viewport)
- Victory/defeat flow

**Test state:** Walk into an alerted enemy → combat begins. 3-beat countdown. Select a card from tray. Both resolve simultaneously. Damage numbers appear. Enemy dies → loot drop. Player dies → game over screen.

**Source files to read:**
- `/public/js/str-combat-engine.js` (~500 lines)
- `/public/js/card-system.js` (~400 lines)
- `/public/js/card-play-system.js` (card cost/play validation)
- `/public/js/card-action-system.js` (effect resolution)
- `/public/data/gone-rogue/cards.json` (card definitions)
- `/public/data/gone-rogue/gr_cards.schema.json` (schema reference)

---

## Pass 6 — Synergies + Loot

**Goal:** Cards have combo synergies. Enemies drop loot. Chests contain items.

**Extract from EyesOnly:**
- `SynergyEngine` → `engine/synergy-engine.js`
  - Synergy tags (FIRE, EXPLOSIVE, MELEE, RANGED, etc.)
  - Synergy definitions (enabler → payoff)
  - Cascade resolver (chain combos)
  - Retheme tags for fantasy: FIRE, ICE, HOLY, DARK, PHYSICAL, ARCANE
- `LootTableManager` → `engine/loot-tables.js`
  - Tier-based drop tables (standard, elite, boss)
  - Weighted rolls with floor-depth scaling
  - Card quality generation
- `ItemSpawner` → integrated into grid-gen
  - Place chests with loot on floor gen
  - Breakable containers (barrels, crates)
- Loot data → `data/loot-tables.json`
  - Retheme for fantasy items (potions, scrolls, weapons)

**Build new:**
- Synergy visual feedback (combo text flash in viewport: "FIRE CHAIN! 2x damage")
- Loot pickup interaction (walk over → auto-collect currency, prompt for cards/items)
- Inventory screen (press I — grid of collected cards and items)

**Test state:** Play a Fire card then an Explosive card → cascade triggers bonus damage. Kill enemy → card drops on ground → walk over to collect. Open chest → get item. Inventory shows collection.

**Source files to read:**
- `/public/js/synergy-engine.js` (~300 lines)
- `/public/js/cascade-resolver.js` (chain resolution)
- `/public/js/loot-table-manager.js` (~250 lines)
- `/public/js/item-spawner.js` (floor item placement)
- `/public/js/world-items.js` (item pickup logic)

---

## Pass 7 — Audio + Lighting

**Goal:** Dynamic audio and lighting bring the dungeon to life.

**Extract from EyesOnly:**
- `AudioSystem` → `engine/audio-system.js`
  - Web Audio API setup (AudioContext, gain buses: master/music/sfx)
  - Manifest-based asset loading (`data/audio-manifest.json`)
  - `play(name)` fire-and-forget SFX
  - `playMusic(name)` with crossfade
  - Volume controls, mute toggle
  - SFX rate limiter (prevent spam)
  - WebM/Opus + MP3 fallback codec detection
  - Strip: onboarding music guard, interior dim multiplier, localStorage persistence keys (use generic)
- `LightingSystem` → `engine/lighting.js`
  - Tile opacity model (wall=1.0, floor=0.0, breakable=0.7)
  - Light source definitions (torch=radial warm, magic=radial cool)
  - Retheme: FLASHLIGHT→TORCH, LIGHTER→CANDLE, NIGHT_VISION→DARKVISION
  - Per-tile light map calculation
  - Apply light map to raycaster wall brightness
- Audio manifest → `data/audio-manifest.json`
  - Port subset of 167 assets (footsteps, combat hits, door opens, ambient, music)
  - Use EyesOnly's sound designer portal for assignment
- Sound designer portal → `portal/sound-designer.html`
  - Copy from EyesOnly, update paths to point at jam project's audio directory

**Build new:**
- Biome-specific ambient loops (dripping water in sewer, wind in crypt)
- Footstep SFX on movement (vary by biome floor type)
- Combat SFX hooks (hit, miss, crit, card play, death)
- Torch flicker effect in raycaster (light intensity oscillation)

**Test state:** Footsteps echo as you walk. Torch flicker visible on walls. Music shifts per biome. Combat has impact sounds. Ambient fills silence between actions.

**Source files to read:**
- `/public/js/audio-system.js` (~500 lines)
- `/public/js/lighting-system.js` (~400 lines)
- `/public/audio/audio-manifest.json` (asset registry)
- `/public/portal/sound-designer.html` (designer tool)

---

## Pass 8 — Polish + Jam Submission

**Goal:** Complete game with win/lose conditions, theme integration, and polish.

**Build new:**
- Character creation (pick name, allocate 3 stat points across STR/DEX/stealth)
- Win condition (reach Floor 5 boss, defeat it)
- Lose condition (HP hits 0 → game over with stats summary)
- Title screen with "New Game" button
- Theme integration (DC Jam theme TBA — weave into dungeon narrative/visual flavor)
- Stat modification (level up on floor transition: +1 to chosen stat)
- 5-floor dungeon with boss on floor 5 (jam scope)
- Wall textures or colored walls per biome (even flat colors + edge lines work)
- Performance pass (ensure 60fps on modest hardware)
- itch.io build (zip the project folder, upload)

**Test state:** Full playthrough: title → create character → explore 5 floors → fight boss → win screen. Death → game over → retry. Audio throughout. Card synergies matter for boss fight.

---

## Post-Jam: LG webOS Port Passes

### Pass 9 — Input Remapping for Magic Remote
- Add Magic Remote backend to InputManager
  - D-pad → grid movement (step/turn)
  - Pointer → combat targeting, UI interaction, wall inspection
  - Scroll wheel → card/spell cycling
  - OK button → interact/confirm
  - Gyro gestures → spell casting (stretch goal)
- TV-distance UI scaling (larger fonts, thicker HUD elements)
- Resolution handling (1080p / 4K)

### Pass 10 — webOS Packaging + Content Expansion
- `appinfo.json` + webOS app packaging
- LG Seller Lounge submission prep
- More floors (expand to 10-15)
- More enemies, cards, synergies
- Sound designer portal as companion webOS app (stretch)
- Dungeon Maker level editor (stretch — Magic Remote as paint tool)

---

## File Map (Jam Scope)

```
dcjam2026/
├── index.html              ✅ done
├── ROADMAP.md              ✅ this file
├── engine/
│   ├── rng.js              ✅ done
│   ├── tiles.js            ✅ done
│   ├── game-loop.js        Pass 1 — extract from EyesOnly
│   ├── input.js            Pass 1 — new
│   ├── raycaster.js        Pass 1 — new (core new engineering)
│   ├── minimap.js          Pass 1 — new
│   ├── hud.js              Pass 1 — new
│   ├── game.js             Pass 1 — new (orchestrator)
│   ├── grid-gen.js         Pass 2 — extract BSP + A* from FloorGenCore
│   ├── biomes.js           Pass 2 — extract + retheme from BiomeConfig
│   ├── door-contracts.js   Pass 3 — extract from DoorContractSystem
│   ├── enemy-ai.js         Pass 4 — extract from EnemyAISystem
│   ├── combat-engine.js    Pass 5 — extract from StrCombatEngine
│   ├── card-system.js      Pass 5 — extract from CardSystem
│   ├── synergy-engine.js   Pass 6 — extract from SynergyEngine
│   ├── loot-tables.js      Pass 6 — extract from LootTableManager
│   ├── lighting.js         Pass 7 — extract from LightingSystem
│   └── audio-system.js     Pass 7 — extract from AudioSystem
├── data/
│   ├── cards.json          Pass 5 — rethemed from EyesOnly cards
│   ├── items.json          Pass 6 — rethemed from EyesOnly items
│   ├── loot-tables.json    Pass 6 — adapted drop tables
│   └── audio-manifest.json Pass 7 — subset of EyesOnly audio
├── audio/
│   ├── sfx/                Pass 7 — ported from EyesOnly
│   └── music/              Pass 7 — ported from EyesOnly
├── portal/
│   └── sound-designer.html Pass 7 — copy from EyesOnly
└── assets/
    └── (wall textures, sprites — Pass 8)
```

## EyesOnly Source Reference

| Jam Module | EyesOnly Source | Lines | Extraction Difficulty |
|---|---|---|---|
| game-loop.js | `public/js/game-loop.js` | 107 | Trivial (copy) |
| grid-gen.js | `public/js/floor-gen-core.js` | ~300 | Medium (strip ctx coupling) |
| biomes.js | `public/js/biome-config.js` | ~150 | Easy (retheme + decouple) |
| door-contracts.js | `public/js/door-contract-system.js` | ~250 | Easy (nearly standalone) |
| enemy-ai.js | `public/js/enemy-ai-system.js` | ~400 | Medium (strip monolith ctx) |
| combat-engine.js | `public/js/str-combat-engine.js` | ~500 | Medium (strip terminal output) |
| card-system.js | `public/js/card-system.js` | ~400 | Medium (strip terminal refs) |
| synergy-engine.js | `public/js/synergy-engine.js` | ~300 | Easy (already modular) |
| loot-tables.js | `public/js/loot-table-manager.js` | ~250 | Easy (async JSON loader) |
| audio-system.js | `public/js/audio-system.js` | ~500 | Easy (strip ARG-specific keys) |
| lighting.js | `public/js/lighting-system.js` | ~400 | Medium (adapt for raycaster) |

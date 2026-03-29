# DC Jam 2026 — Extraction Roadmap

> 8 passes to go from EyesOnly scaffold → playable first-person dungeon crawler.
> Each pass produces a testable, runnable state.

---

## Pass 1 — Foundation (Scaffold + Grid + Raycaster) ✅ DONE

**Goal:** Walk around a hardcoded dungeon in first-person.

**Extract from EyesOnly:**
- `GameLoop` → `engine/game-loop.js` ✅
- `TILES` constants → `engine/tiles.js` ✅
- `SeededRNG` → `engine/rng.js` ✅

**Build new:**
- `engine/raycaster.js` ✅ — Wolfenstein-style raycaster with textured walls, per-tile height offsets (Doom rule), DoorAnimator integration
- `engine/input.js` ✅ — InputManager + InputPoll (pointer events for Magic Remote)
- `engine/minimap.js` ✅ — Canvas minimap with fog-of-war, floor stack
- `engine/game.js` ✅ — Full orchestrator (900+ lines)
- `engine/player.js` ✅ — State authority with inventory containers
- `engine/movement.js` ✅ — Grid-locked movement controller
- `engine/mouse-look.js` ✅ — Free-look for pointer/Magic Remote
- `engine/hud.js` ✅ — HP/energy/battery pip display
- `index.html` ✅ — Full CRT terminal theme with all overlay layers

---

## Pass 2 — Procedural Dungeons (Floor Gen + Biomes) ✅ DONE

**Goal:** Generate a new random dungeon each floor with themed visuals.

**Extract from EyesOnly:**
- `FloorGenCore` → `engine/grid-gen.js` ✅ — BSP + A* corridor carving
- `BiomeConfig` → integrated into `engine/floor-manager.js` ✅
- `BiomeVisuals` → `engine/spatial-contract.js` ✅ — depth-aware rendering contracts (street/interior/dungeon)

**Build new:**
- `engine/floor-manager.js` ✅ — Floor stack, biome management, generation orchestration
- `engine/texture-atlas.js` ✅ — 15+ procedural textures (brick, stone, wood, doors, stairs, locked)
- `engine/spatial-contract.js` ✅ — Per-depth raycaster rules (wall height, fog, textures, tile height offsets)
- `engine/skybox.js` ✅ — Parallax sky rendering for exterior floors

---

## Pass 3 — Door Contracts + Multi-Floor Navigation ✅ DONE

**Goal:** Stairs work correctly with spawn protection and seamless transitions.

**Extract from EyesOnly:**
- `DoorContractSystem` → `engine/door-contracts.js` ✅
- `DoorContractAudio` → `engine/door-contract-audio.js` ✅ — Depth-specific door SFX sequences

**Build new:**
- `engine/floor-transition.js` ✅ — Full transition orchestrator with TransitionFX integration + locked door system
- `engine/transition-fx.js` ✅ — Canvas-overlay vignette/fade with depth-specific presets (enter_building, descend, ascend, walk_through)
- `engine/door-animator.js` ✅ — Raycaster-level door-open animation with directional reveal textures (steps up/down through opening door)
- Directional stair/door textures ✅ — `stairs_down` (chevron ▼), `stairs_up` (chevron ▲), `door_locked` (chain + padlock)
- Locked BOSS_DOOR system ✅ — Key-item requirement, inventory consumption, visual state change in viewport
- `engine/interact-prompt.js` ✅ — Context-sensitive interaction hints near interactable tiles

---

## Pass 4 — Enemies + Stealth ✅ DONE

**Goal:** Enemies patrol the dungeon. Player can sneak or be detected.

**Extract from EyesOnly:**
- `EnemyAISystem` → `engine/enemy-ai.js` ✅ — Patrol, awareness states, LOS
- Enemy sprites → `engine/enemy-sprites.js` ✅ — Procedural emoji-based sprite rendering with state variations

**Build new:**
- `engine/pathfind.js` ✅ — A* pathfinding for enemy chase
- First-person enemy rendering in raycaster ✅ — Billboard sprites with distance scaling
- Awareness-based combat engagement ✅

---

## Pass 5 — Combat Engine (STR + Cards) ✅ DONE

**Goal:** Engage enemies in simultaneous-turn-resolution card combat.

**Extract from EyesOnly:**
- `StrCombatEngine` → `engine/combat-engine.js` ✅
- `CardSystem` → `engine/card-system.js` ✅ — Registry, collection, deck, hand management

**Build new:**
- `engine/combat-bridge.js` ✅ — Combat orchestrator (init, playCard, flee, victory/defeat, loot awards)
- `engine/card-fan.js` ✅ — Canvas-rendered card tray for combat selection
- `engine/combat-report.js` ✅ — Post-combat XP/loot summary overlay
- `engine/death-anim.js` ✅ — Enemy death animations (origami fold / poof)
- Card data → `data/cards.json` ✅

---

## Pass 6 — Synergies + Loot + Economy ✅ DONE

**Goal:** Cards have combo synergies. Enemies drop loot. Full faction economy.

**Extract from EyesOnly:**
- `SynergyEngine` → `engine/synergy-engine.js` ✅
- `LootTableManager` → `engine/loot-tables.js` ✅ — Breakable, combat, and chest drop tables

**Build new:**
- `engine/world-items.js` ✅ — Walk-over pickups (gold, battery, food)
- `engine/breakable-spawner.js` ✅ — Destructible props with HP + loot spill
- `engine/salvage.js` ✅ — Corpse harvesting, faction-tagged parts, sell economy
- `engine/shop.js` ✅ — Faction card shop with buy/sell/sellPart, rep tiers
- `engine/menu-box.js` ✅ — OoT-style rotating 4-face menu box (canvas-rendered)
- `engine/menu-faces.js` ✅ — Face content renderers (minimap, journal, inventory, shop)
- `engine/nch-widget.js` ✅ — NCH capsule sidebar widget
- `engine/quick-bar.js` ✅ — Equipped item quick-bar
- Inventory UI ✅ — Equip/unequip, bag grid, equipped quick-slots with hit zones
- Sell Parts UI ✅ — Salvage part selling through shop with faction-adjusted prices

---

## Pass 7 — Audio + Lighting ✅ DONE

**Goal:** Dynamic audio and lighting bring the dungeon to life.

**Extract from EyesOnly:**
- `AudioSystem` → `engine/audio-system.js` ✅ — Web Audio API, manifest loading, SFX + music playback
- `LightingSystem` → `engine/lighting.js` ✅ — Tile-based light map with raycaster integration

**Build new:**
- `engine/hazard-system.js` ✅ — Environmental hazards (fire, spikes, poison) + bonfire rest
- Audio sequences for door transitions (DoorContractAudio) ✅
- Biome-specific ambient + footsteps ✅

---

## Pass 8 — Polish + Jam Submission 🔧 IN PROGRESS

**Goal:** Complete game with win/lose conditions, theme integration, and polish.

**Done:**
- `engine/title-screen.js` ✅ — CRT terminal-style title screen
- `engine/splash-screen.js` ✅ — Splash/intro screen
- `engine/screen-manager.js` ✅ — State machine (title → playing → paused → game over → victory)
- `engine/game-over-screen.js` ✅ — Death screen with stats
- `engine/victory-screen.js` ✅ — Win screen
- `engine/session-stats.js` ✅ — Per-run stat tracking
- `engine/debrief-feed.js` ✅ — CRT sidebar with event log + resource display
- `engine/status-bar.js` ✅ — Bottom status bar
- `engine/dialog-box.js` ✅ — Canvas-rendered dialog with typewriter, portraits, Morrowind-style branching choices
- `engine/toast.js` ✅ — Transient toast notifications
- `engine/i18n.js` ✅ — Internationalization for LG store
- `engine/ui-sprites.js` ✅ — Procedural UI sprite rendering
- `engine/box-anim.js` ✅ — Box rotation animation for MenuBox
- Vendor NPC greeting dialogs ✅ — Per-faction NPCs (Kai/Renko/Vasca) with first-visit + return-visit lines
- Battery pip row in HUD ✅ — Always-visible discrete pips with spent animation
- Inventory pipeline complete ✅ — See GAP_COVERAGE_TO_DEPLOYABILITY.md (Tier 0: 8/8 ✅)
- Floor texture casting ✅ — ImageData-based floor rendering (cobble/wood/stone/dirt)
- Wall stretch fix ✅ — Proper texture UV clipping, no lineHeight cap, free-look compatible
- Biome-specific textures ✅ — cellar=stone, foundry=metal, sealab=concrete wall + floor
- `engine/door-peek.js` ✅ — BoxAnim door reveal when facing transition tiles

**Remaining (see GAP_COVERAGE_TO_DEPLOYABILITY.md):**
- Tier 1: Combat polish (particle FX, synergy toast, card play anim, telegraph, corpse render)
- Tier 2: Economy loop closure (stash transfer, rep feedback, deck reshuffle, victory stats)
- Playtesting + balance tuning
- itch.io build

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

## File Map (Current — 58 engine files)

```
dcjam2026/
├── index.html                  ✅ Full CRT terminal theme
├── docs/
│   ├── ROADMAP.md              ✅ This file
│   ├── GAP_COVERAGE_TO_DEPLOYABILITY.md  ✅ Sprint tracker
│   ├── DOOR_EFFECTS_ROADMAP.md ✅ Door visual/lock specs
│   ├── GAME_FLOW_ROADMAP.md    Screen flow documentation
│   ├── HUD_ROADMAP.md          HUD layout specs
│   ├── UI_ROADMAP.md           UI component specs
│   └── UNIFIED_INVENTORY_METADATA_CONTRACT.md  Item/card/enemy schemas
├── engine/
│   ├── rng.js                  Layer 0 — SeededRNG
│   ├── tiles.js                Layer 0 — Tile type constants
│   ├── game-loop.js            Layer 0 — Fixed-timestep game loop
│   ├── i18n.js                 Layer 0 — i18n for LG webOS store
│   ├── input.js                Layer 1 — InputManager (keyboard + pointer events)
│   ├── input-poll.js           Layer 1 — InputPoll (per-frame state queries)
│   ├── movement.js             Layer 1 — MovementController (grid-locked)
│   ├── mouse-look.js           Layer 1 — Free-look for pointer/Magic Remote
│   ├── player.js               Layer 1 — Player state authority (HP/energy/battery/inventory)
│   ├── texture-atlas.js        Layer 1 — 15+ procedural wall/door/stair textures
│   ├── spatial-contract.js     Layer 1 — Depth-aware raycaster rendering rules
│   ├── raycaster.js            Layer 1 — Wolfenstein-style raycaster + DoorAnimator integration
│   ├── skybox.js               Layer 1 — Parallax sky for exterior floors
│   ├── lighting.js             Layer 1 — Tile-based light map
│   ├── grid-gen.js             Layer 2 — BSP + A* floor generation
│   ├── floor-manager.js        Layer 2 — Floor stack + biome management
│   ├── floor-transition.js     Layer 2 — SFX-sequenced transitions + locked door system
│   ├── transition-fx.js        Layer 2 — Canvas-overlay vignette/fade
│   ├── door-contracts.js       Layer 2 — Spawn protection contracts
│   ├── door-contract-audio.js  Layer 2 — Depth-pair SFX sequences
│   ├── door-animator.js        Layer 2 — Door-open animation with reveal textures
│   ├── pathfind.js             Layer 2 — A* for enemy pathfinding
│   ├── enemy-ai.js             Layer 2 — Patrol, awareness, LOS
│   ├── enemy-sprites.js        Layer 2 — Procedural enemy billboard sprites
│   ├── combat-engine.js        Layer 2 — STR combat state machine
│   ├── card-system.js          Layer 2 — Card registry, deck, hand management
│   ├── synergy-engine.js       Layer 2 — Tag-based cascade combos
│   ├── loot-tables.js          Layer 2 — Drop tables + combat rewards
│   ├── world-items.js          Layer 2 — Walk-over pickups
│   ├── breakable-spawner.js    Layer 2 — Destructible props
│   ├── salvage.js              Layer 2 — Corpse harvesting + faction economy
│   ├── hazard-system.js        Layer 2 — Environmental hazards + bonfire
│   ├── hud.js                  Layer 3 — HP/energy/battery pip display
│   ├── minimap.js              Layer 3 — Canvas minimap with fog-of-war
│   ├── dialog-box.js           Layer 3 — Canvas dialog + branching conversations
│   ├── toast.js                Layer 3 — Transient notifications
│   ├── interact-prompt.js      Layer 3 — Context-sensitive interaction hints
│   ├── card-fan.js             Layer 3 — Combat card selection tray
│   ├── combat-bridge.js        Layer 3 — Combat orchestrator
│   ├── combat-report.js        Layer 3 — Post-combat summary
│   ├── death-anim.js           Layer 3 — Enemy death FX
│   ├── shop.js                 Layer 3 — Faction card shop
│   ├── menu-box.js             Layer 3 — OoT rotating 4-face menu
│   ├── menu-faces.js           Layer 3 — Face content renderers
│   ├── box-anim.js             Layer 3 — Menu box rotation animation
│   ├── debrief-feed.js         Layer 3 — CRT sidebar event log
│   ├── status-bar.js           Layer 3 — Bottom status bar
│   ├── nch-widget.js           Layer 3 — NCH capsule sidebar
│   ├── quick-bar.js            Layer 3 — Equipped item quick-bar
│   ├── ui-sprites.js           Layer 3 — Procedural UI sprites
│   ├── door-peek.js            Layer 3 — BoxAnim door proximity reveal
│   ├── screen-manager.js       Layer 4 — State machine
│   ├── title-screen.js         Layer 4 — CRT title screen
│   ├── splash-screen.js        Layer 4 — Intro splash
│   ├── game-over-screen.js     Layer 4 — Death screen
│   ├── victory-screen.js       Layer 4 — Win screen
│   ├── session-stats.js        Layer 4 — Per-run stat tracking
│   ├── audio-system.js         Layer 4 — Web Audio API
│   └── game.js                 Layer 5 — Main orchestrator
├── data/
│   ├── cards.json              Card definitions
│   ├── strings.json            i18n string table
│   └── audio-manifest.json     Audio asset registry
└── audio/
    ├── sfx/                    Sound effects
    └── music/                  Ambient + biome tracks
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

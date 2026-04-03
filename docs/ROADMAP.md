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

## Pass 8 — Polish + Jam Submission ✅ DONE (core), 🔧 Final polish

**Goal:** Complete game with win/lose conditions, theme integration, and polish.

**Core systems (all ✅):**
- Screen flow: `splash-screen.js`, `title-screen.js`, `screen-manager.js`, `game-over-screen.js`, `victory-screen.js` ✅
- Session: `session-stats.js` ✅ — per-run tracking with arc summary + ending variant injection
- HUD: `debrief-feed.js`, `status-bar.js`, `hud.js` (battery pips, readiness bar w/ celebration FX) ✅
- Dialog: `dialog-box.js` ✅ — Canvas typewriter + Morrowind branching + vendor greetings
- Notifications: `toast.js` ✅, `i18n.js` ✅, `ui-sprites.js` ✅, `box-anim.js` ✅
- Floor polish: floor texture casting ✅, wall stretch fix ✅, biome-specific textures ✅
- Peek overlays: `door-peek.js`, `bookshelf-peek.js`, `bar-counter-peek.js`, `bed-peek.js`, `crate-peek.js`, `corpse-peek.js`, `mailbox-peek.js`, `torch-peek.js`, `chest-peek.js`, `locked-door-peek.js`, `merchant-peek.js`, `monologue-peek.js`, `puzzle-peek.js` ✅
- Combat polish: `enemy-intent.js` (telegraph) ✅, `corpse-registry.js` + `corpse-peek.js` ✅, `combat-fx.js` + `particle-fx.js` ✅

**Inventory overhaul (Sprint 0, see UNIFIED_EXECUTION_ORDER.md):**
- `card-authority.js` ✅ — Single read/write gateway for all card/inventory state
- `card-transfer.js` ✅ — Validated zone-to-zone moves with rollback
- 16 files migrated, all proxy stubs stripped ✅
- `card-draw.js` ✅ — Unified card renderer (replaced card-renderer.js)

**Gleaner loop systems (all ✅):**
- `cleaning-system.js` ✅ — Tile scrub w/ battery cost + readiness integration
- `crate-system.js` + `crate-peek.js` + `crate-ui.js` ✅ — Restocking loop
- `trap-rearm.js` ✅ — Trap restoration w/ readiness credit
- `torch-state.js` + `torch-peek.js` ✅ — 3-slot torch model w/ fuel + hero damage
- `cobweb-system.js` + `cobweb-node.js` + `cobweb-renderer.js` ✅ — Trap webs
- `readiness-calc.js` ✅ — CORE/EXTRA split scoring (0.0–2.0)
- `work-order-system.js` ✅ — Per-floor work order tracking

**Schedule + win-state (all ✅):**
- `day-cycle.js` ✅ — 8-phase day/night clock
- `dungeon-schedule.js` ✅ — Per-group hero day state machine, combo multiplier, death-shift
- `hero-run.js` ✅ — Hero run simulation per-group
- `morning-report.js` ✅ — Dawn Toast sequence with per-group status
- `mailbox-sprites.js` + `mailbox-peek.js` ✅ — Report delivery + history
- Victory/GameOver extended with arc summary, combo streak, ending variants ✅
- Readiness bar: full animation state machine + tier-4 celebration FX + extra credit coin drip ✅

**NPC + narrative (all ✅):**
- `npc-system.js` + `npc-composer.js` ✅ — NPC placement + dialogue
- `bark-library.js` ✅ — Context-sensitive bark pools
- `cinematic-camera.js` ✅ — 7 presets (3 wired for jam)
- `intro-walk.js` ✅ — Floor 0 auto-walk
- `deploy-cutscene.js` ✅ — Deploy animation

**Remaining for jam:**
- Playtesting + balance tuning
- itch.io build
- Synergy toast (nice-to-have)
- Rep feedback toast (nice-to-have)

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

## File Map (Current — 131 engine files)

131 engine files across 5 layers. Full listing via `ls engine/`. Key additions since Pass 7:

**Layer 0 (constants/utils):** rng.js, tiles.js (37 tile types), game-loop.js, i18n.js

**Layer 1 (pure state, no DOM):**
- Core: input.js, input-poll.js, movement.js, mouse-look.js, player.js
- Renderer: raycaster.js (N-layer DDA), texture-atlas.js (20+ procedural), spatial-contract.js, skybox.js, lighting.js (point lights, flicker)
- Inventory: card-authority.js, card-transfer.js, card-system.js (registry only), card-draw.js
- Gleaner: cleaning-system.js, crate-system.js, torch-state.js, cobweb-system.js, cobweb-node.js, trap-rearm.js
- Schedule: day-cycle.js, dungeon-schedule.js, hero-run.js, readiness-calc.js, work-order-system.js
- Combat: combat-engine.js, synergy-engine.js, enemy-intent.js, status-effect.js

**Layer 2 (floor/entity management):**
- Floors: floor-manager.js, grid-gen.js, floor-transition.js, floor-blockout-*.js (5 hand-authored floors)
- Doors: door-contracts.js, door-contract-audio.js, door-animator.js, transition-fx.js
- Enemies: enemy-ai.js, enemy-sprites.js, pathfind.js, awareness-config.js
- NPCs: npc-system.js, npc-composer.js, bark-library.js
- Economy: loot-tables.js, world-items.js, breakable-spawner.js, salvage.js, shop.js

**Layer 3 (UI/peeks/overlays):**
- HUD: hud.js (readiness bar + celebration FX), minimap.js, minimap-nav.js, status-bar.js, debrief-feed.js
- Peeks: bookshelf-peek.js, bar-counter-peek.js, bed-peek.js, crate-peek.js, corpse-peek.js, mailbox-peek.js, torch-peek.js, chest-peek.js, locked-door-peek.js, merchant-peek.js, monologue-peek.js, puzzle-peek.js, door-peek.js, peek-slots.js
- Menu: menu-box.js, menu-faces.js, box-anim.js, slot-wheel.js, inventory-overlay.js
- Combat UI: card-fan.js, combat-bridge.js, combat-report.js, combat-fx.js, death-anim.js, particle-fx.js
- Other: dialog-box.js, toast.js, interact-prompt.js, nch-widget.js, quick-bar.js, ui-sprites.js, vendor-dialog.js, suit-toast.js, world-popup.js, dpad.js, drag-drop.js

**Layer 4 (screens/orchestration):**
- Screens: screen-manager.js, title-screen.js, splash-screen.js, game-over-screen.js, victory-screen.js
- Systems: session-stats.js, audio-system.js, cinematic-camera.js, post-process.js, intro-walk.js, deploy-cutscene.js, morning-report.js, hazard-system.js, hero-system.js, stealth.js, status-effect-hud.js
- Sprites: bonfire-sprites.js, mailbox-sprites.js, cobweb-renderer.js, sprite-sheet.js, corpse-registry.js

**Layer 5:** game.js (main orchestrator, ~3800 lines)

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

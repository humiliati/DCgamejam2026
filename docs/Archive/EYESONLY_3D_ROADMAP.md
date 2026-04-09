# EyesOnly 3D — Convergence Roadmap

> **Created:** 2026-03-31
> **Vision:** EyesOnly's proven game logic (155K lines) behind Dungeon Gleaner's first-person engine
> **Renderer:** DG's Canvas 2D N-layer raycaster (NOT Three.js — the raycaster IS the engine)
> **Narrative:** DG's Gleaner operative, conspiracy layer, faction structure, cleaning mechanic
> **Game systems:** EyesOnly's battle-tested combat, cards, AI, synergies, lighting, status effects

---

## The Convergence

Two codebases, each strong where the other is weak:

**Dungeon Gleaner has:**
- First-person raycaster with N-layer compositing, floor casting, procedural textures
- Skybox system with parallax, clouds, mountains, water, day/night cycle
- Minimap with fog-of-war, floor caching, pathfinding display
- Grid-locked movement controller with input buffering, head bob, smooth lerp
- Keyboard input system (WASD/arrows, E interact, number keys for cards)
- SpatialContract system (exterior/interior/dungeon rendering rules)
- Floor hierarchy ("N" → "N.N" → "N.N.N") with door contracts
- CinematicCamera (letterbox, FOV zoom, shake, input lock)
- MonologuePeek (intrusive thought typewriter overlay)
- PostProcess pipeline (scanlines, chromatic aberration, vignette, grain)
- The entire narrative: Gleaner operative, dragon conspiracy, faction arcs, NPC roster
- DoorContractAudio, TransitionFX, FloorTransition state machine

**EyesOnly has:**
- 1,106-line production LightingSystem (DG has a 63-line stub)
- Tag-based synergy engine (433 lines, zero dependencies)
- Enemy intent/expression system (575 lines, self-contained)
- Status effects with 12 types across 5 categories (577 lines)
- Card quality/affix roll system (Cracked → Perfect, Diablo-style)
- Loot scatter algorithm, weighted drop tables
- Save/load with tiered persistence (lose cards on death, keep keys)
- 940-line audio system with SFX manifest, music crossfade, footstep engine
- Floor generation with biome-specific room placement, cellular automata

**Neither has alone:**
- A complete, working, polished game

---

## What Stays From DG (The Engine)

These are non-negotiable — they ARE the game's identity:

| System | Module | Lines | Status |
|--------|--------|-------|--------|
| Raycaster | raycaster.js | ~1,600 | Working, N-layer planned |
| Skybox | skybox.js | ~800 | Working, day/night planned |
| Minimap | minimap.js | ~500 | Working with fog-of-war |
| Movement | movement.js | 529 | Working, grid-locked lerp |
| Input | input.js + input-poll.js | ~300 | Working, keyboard-first |
| Floor hierarchy | floor-manager.js | ~600 | Working, string IDs |
| Door system | door-contracts.js + door-animator.js | ~500 | Working |
| Spatial rendering | spatial-contract.js | ~300 | Working, 3 depth types |
| Textures | texture-atlas.js | ~800 | Working, 26 procedural textures |
| Cinematic | cinematic-camera.js | 310 | Working, 6 presets |
| Monologue | monologue-peek.js | 290 | Working, typewriter overlay |
| PostProcess | post-process.js | 260 | Working, 6 effects |
| HUD | hud.js | ~400 | Working |
| Tile system | tiles.js | ~200 | Working, 30+ tile types |
| Grid generation | grid-gen.js | ~400 | Working, BSP + A* corridors |
| Dialog | dialog-box.js | 691 | Working, branching trees |

**Also stays:** The entire narrative layer — `STREET_CHRONICLES_NARRATIVE_OUTLINE.md`, `Biome Plan.html`, faction structure, NPC roster, conspiracy arcs, cleaning mechanic design.

---

## What Comes From EyesOnly (The Game Logic)

These are proven systems that DG either lacks or has as stubs:

### Priority 1 — Direct Replacements (DG has stubs)

#### 1a. LightingSystem → Replace DG's 63-line stub

**EyesOnly source:** `lighting-system.js` (1,106 lines)
**DG target:** `engine/lighting.js` (63 lines — player-only radial light)
**Extractability:** VERY HIGH — pure illumination math, zero DOM dependencies

What it brings:
- Tile opacity model (WALL 1.0, FLOOR 0.0, SHADOW 0.3, BREAKABLE 0.7)
- Multiple light source types (flashlight cone, campfire radial, monitor glow, torch flicker)
- Light propagation through transparent tiles
- Per-biome ambient levels (0.085 for deep dungeon, 0.19 for bright interior)
- Flicker functions (torch, neon dropout, steady)

**Adaptation needed:**
- Wrap in DG's `var Lighting = (function() {...})();` IIFE pattern
- Replace EyesOnly's `ctx` parameter with DG's `(player, grid, gridW, gridH)` signature
- Map EyesOnly's tile types to DG's TILES constants
- Wire `Lighting.calculate()` to include `_lightSources[]` from LIGHT_AND_TORCH_ROADMAP
- Raycaster already reads `lightMap[y][x]` — no rendering changes needed

**This single extraction satisfies:**
- LIGHT_AND_TORCH_ROADMAP Phase 1 (dynamic light sources)
- TEXTURE_ROADMAP Layer 3 (sprite light emitters)
- The entire LIGHT_AND_TORCH dependency chain

**Estimated time:** 3h (extract, adapt IIFE, wire to raycaster, test)

#### 1b. Save/Load → DG has none

**EyesOnly source:** `save-load.js` (80 lines) + GAMESTATE persistence patterns
**DG target:** New module `engine/save-load.js`
**Extractability:** VERY HIGH

What it brings:
- localStorage serialization
- Tiered persistence (lose hand on death, keep equipment and keys)
- State validation on load
- Version migration support

**Adaptation needed:**
- Define DG's state shape (Player position, floor ID, inventory, card collection, quest flags)
- Map EyesOnly's GAMESTATE fields to DG's Player + FloorManager state
- webOS localStorage availability check

**Estimated time:** 2h

### Priority 2 — Enhancements (DG has working but simpler versions)

#### 2a. TagSynergyEngine → Layer on top of DG's suit system

**EyesOnly source:** `tag-synergy-engine.js` (433 lines)
**DG current:** `synergy-engine.js` (234 lines — suit RPS only)
**Extractability:** VERY HIGH — zero dependencies, dual CommonJS/browser export

What it brings:
- Tag-based combo detection (FIRE + EXPLOSIVE = chain reaction)
- IMMEDIATE / SEQUENTIAL / STATEFUL synergy types
- Discovered combo tracking
- Environmental interactions (wet + electrical = shock)

**Adaptation:** Don't replace DG's suit system — layer tags ON TOP. Cards already have suit; add optional tags. Suit triangle resolves first (♣>♦>♠>♣), then tag synergies apply bonus effects.

**Estimated time:** 2h (extract, add tag field to cards.json, wire to CombatEngine)

#### 2b. EnemyIntentSystem → Richer enemy feedback

**EyesOnly source:** `enemy-intent-system.js` (575 lines)
**DG current:** Basic enemy sprites with awareness indicators
**Extractability:** VERY HIGH — completely self-contained

What it brings:
- 13 expression states (calm, angry, surprised, dazed, scheming, fearful...)
- Tactical communication (enemy telegraphs next action)
- Face glyph rendering per expression state

**Adaptation:** Render expression as emoji above enemy billboard in raycaster sprite pass. Wire to DG's EnemyAI awareness transitions.

**Estimated time:** 1.5h

#### 2c. StatusEffects → Richer than DG's version

**EyesOnly source:** `status-effects.js` (577 lines)
**DG current:** `status-effect.js` (495 lines — paired effects, stat queries)
**Extractability:** HIGH

What it brings:
- 12 status types across 5 categories (DOT, CONTROL, MENTAL, STEALTH, ENV)
- Burning, bleeding, stunned, suppressed, panic, calm, wet, poison, blind, buff, debuff, sleep
- Duration tracking, tick-based resolution

**Adaptation:** Merge EyesOnly's status catalog into DG's paired-effect architecture. DG's stat query system (getWalkTimeMultiplier, getCoyoteBonus) is good — keep it, expand the effect list.

**Estimated time:** 2h

#### 2d. Audio upgrade — Footstep engine + SFX manifest

**EyesOnly source:** `audio-system.js` (940 lines)
**DG current:** `audio-system.js` (405 lines)
**Extractability:** HIGH — self-contained Web Audio API

What it brings:
- SFX manifest with logical names → file paths
- Footstep cadence engine (biome-aware surface sounds)
- Music crossfade on floor transitions
- Rate limiting (80ms cooldown per SFX)
- Music dim multiplier for interior spaces

**Adaptation:** Backport footstep engine and manifest system. Keep DG's spatial audio positioning. Add biome-specific footstep sounds.

**Estimated time:** 2h

### Priority 3 — Selective Backports (Logic patterns, not wholesale modules)

#### 3a. Card quality/affix system

From EyesOnly's `card-system.js` — the Diablo-style quality roll (Cracked → Perfect) and affix system. Don't replace DG's card system; add quality tiers and proc-gen affixes to the existing card definitions.

```javascript
// Add to DG's CardSystem
var QUALITY_TIERS = [
  { name: 'Cracked',     statMult: 0.6, color: '#888' },
  { name: 'Worn',        statMult: 0.8, color: '#aaa' },
  { name: 'Standard',    statMult: 1.0, color: '#fff' },
  { name: 'Fine',        statMult: 1.2, color: '#4f4' },
  { name: 'Superior',    statMult: 1.5, color: '#44f' },
  { name: 'Elite',       statMult: 1.8, color: '#f4f' },
  { name: 'Masterwork',  statMult: 2.2, color: '#fa0' }
];
```

Cards found in deeper dungeons roll higher quality tiers. Cleaning bonus: relighting all torches on a floor before looting increases quality roll chance.

**Estimated time:** 2h

#### 3b. Loot scatter algorithm

From EyesOnly's `loot-spill-system.js` (125 lines). When a breakable is destroyed or enemy defeated, items scatter to adjacent tiles with sub-tile visual offsets. Pure math, zero dependencies.

**Estimated time:** 30min

#### 3c. Floor generation patterns

Reference EyesOnly's `floor-generator.js` for room placement variety, cellular automata for cave biomes, biome-specific prop density. Don't replace DG's GridGen — extend it with these generation strategies.

**Estimated time:** 3h (selective, iterative)

#### 3d. Tiered death penalty

From EyesOnly's GAMESTATE persistence model:
- **Tier 1 (lost on death):** Cards in hand, loose consumables, unbanked gold
- **Tier 2 (survives death):** Equipped gear, gate keys
- **Tier 3 (permanent):** Quest keys, permanent upgrades, currency in stash

Maps directly to DG's cleaning loop: death means the dungeon resets but your stash at Gleaner's Home (Floor 1.6) persists.

**Estimated time:** 1h (design integration, wire to save/load)

---

## Sprint 0 — Inventory/Card/Menu Rework (15h, PREREQUISITE)

**See:** `INVENTORY_CARD_MENU_REWORK.md` for full spec.

DG's card/inventory/menu architecture is fractured — 3-4 competing storage models,
unregistered drag-drop zones, two card renderers, direct state mutations. Every
subsequent sprint will hit these bugs. Fix the foundation first.

| Step | Work | Hours |
|------|------|-------|
| S0.1 | Build CardAuthority (single state owner) + CardTransfer (validated moves) | 4 |
| S0.2 | Rewire Player, CardFan, Salvage, Shop, CombatBridge, HUD to new authority | 3 |
| S0.3 | Build MenuInventory from scratch (replaces menu-faces.js) | 5 |
| S0.4 | Delete dead code: card-renderer.js, card-stack.js, menu-faces.js | 1 |
| S0.5 | Regression test: combat, salvage, shop, menu, death reset | 2 |

**Kills:** ~3,300 lines of redundant bug-generating code.
**Creates:** ~1,600 lines of clean architecture (CardAuthority, CardTransfer, MenuInventory).
**Ports from EyesOnly:** CardStateAuthority pattern, drop zone registry, event emitter, hydrateCard().

After Sprint 0, there is ONE place cards live, ONE card renderer, ONE way to
transfer items between zones, and ZERO direct array mutations.

---

## What Gets Built New (Neither Codebase Has)

### N1. The Cleaning Loop Integration

The Gleaner's core mechanic: enter hero-damaged dungeon → relight torches → restock crates → re-arm traps → sweep floors → report readiness. This is DG-native design that doesn't exist in EyesOnly.

**Uses:** DG's tile system + EyesOnly's LightingSystem (torches as light sources) + DG's InteractPrompt + readiness scoring.

See LIGHT_AND_TORCH_ROADMAP Phases 2-3 for torch mechanics.

### N2. Conspiracy Evidence System

Environmental storytelling unique to DG's narrative. Dragon scales near combat sites, forged documents in locked rooms, NPC dialogue contradictions. The player pieces together the conspiracy through cleaning.

**Uses:** DG's dialog-box.js + DG's world-items.js + new evidence tracking module.

### N3. Faction Reputation

Three factions (Tide Council, Foundry Collective, Admiralty) with hidden agendas. Cleaning choices affect reputation — do you report what you find, or hide evidence?

**Uses:** New module, wire to dialog choices and quest flags.

---

## Execution Order

### Sprint 1 — Foundation Extraction (8h)

```
S1.1  Extract LightingSystem from EyesOnly                    (3h)
  │   → Adapt to DG IIFE, wire to raycaster lightMap
  │   → Register torch/bonfire tiles as light sources
  │   → Test: dungeon floor with flickering torches
  │
S1.2  Build Save/Load module                                   (2h)
  │   → Define DG state shape
  │   → localStorage persistence with tiered death penalty
  │   → Test: save on bonfire, load on death
  │
S1.3  Backport footstep engine from EyesOnly audio             (1.5h)
  │   → SFX manifest system
  │   → Biome-specific footstep sounds
  │   → Music dim on interior floors
  │
S1.4  Extract LootSpillSystem                                  (30min)
      → Wire to breakable destruction + enemy defeat
```

### Sprint 2 — Combat Depth (6h)

```
S2.1  Layer TagSynergyEngine onto suit system                  (2h)
  │   → Add tag field to cards.json
  │   → Suit resolves first, tags add bonus effects
  │   → Environmental synergies (wet + electric)
  │
S2.2  Extract EnemyIntentSystem                                (1.5h)
  │   → Expression rendering as emoji billboards
  │   → Wire to awareness state transitions
  │
S2.3  Merge StatusEffects catalogs                             (2h)
  │   → 12 status types into DG's paired-effect system
  │   → DOT/CONTROL/MENTAL/STEALTH/ENV categories
  │
S2.4  Card quality tiers from EyesOnly                         (1.5h)
      → Quality rolls on loot, cleaning bonus affects roll
```

### Sprint 3 — DG Engine Roadmaps (10h)

These are DG-native work, not extractions:

```
S3.1  NLAYER raycaster Phase 1 (N-layer hit collector)         (45min)
S3.2  NLAYER Phase 3 (SHRUB tile + texture)                    (1h)
S3.3  NLAYER Phase 5-6 (perf + Floor 0 test)                  (1.5h)
S3.4  SKYBOX Phase 1 (sky color cycling)                       (1.5h)
S3.5  SKYBOX Phase 2 (sun/moon celestial bodies)               (2h)
S3.6  SKYBOX Phase 3 (star parallax)                           (1.5h)
S3.7  SKYBOX Phase 4 (HUD time widget)                         (1h)
```

### Sprint 4 — Cleaning Mechanic (5h)

```
S4.1  TEXTURE Layer 2 (wall decor model)                       (2h)
S4.2  Torch tiles (TORCH_LIT/UNLIT) using new LightingSystem  (1.5h)
S4.3  Torch interaction (relight with fuel)                    (1.5h)
S4.4  Readiness scoring (torch % + corpse % + crate %)         (1h)
```

### Sprint 5 — Narrative Integration (4h)

```
S5.1  Conspiracy evidence items in world-items.js              (1.5h)
S5.2  Faction reputation module                                (1.5h)
S5.3  Morning monologue sequences per faction standing         (1h)
```

---

## Module Pattern Compatibility

All EyesOnly extraction targets use the IIFE pattern:

```javascript
// EyesOnly style:
const LightingSystem = (function() { 'use strict'; ... })();

// DG style:
var Lighting = (function() { 'use strict'; ... return { publicAPI }; })();
```

Changes needed per extraction:
1. `const` → `var` (DG convention)
2. Rename to match DG's module naming
3. Replace `typeof OtherModule !== 'undefined'` checks with DG's module names
4. Add to `index.html` at correct layer position
5. Wire through `Game.js` (Layer 4 orchestrator)

EyesOnly modules that check `typeof X !== 'undefined'` before using dependencies already handle graceful degradation — they'll work in DG even if some EyesOnly dependencies aren't present.

---

## Dependency Graph

```
SPRINT 1 (Foundation)
  │
  ├── S1.1 LightingSystem ──────────────────────┐
  ├── S1.2 Save/Load                             │
  ├── S1.3 Audio footsteps                       │
  └── S1.4 Loot scatter                          │
      │                                          │
SPRINT 2 (Combat)                                │
  │                                              │
  ├── S2.1 Tag synergies                         │
  ├── S2.2 Enemy intents                         │
  ├── S2.3 Status effects                        │
  └── S2.4 Card quality                          │
      │                                          │
SPRINT 3 (DG Engine)                             │
  │                                              │
  ├── S3.1-3 N-layer raycaster                   │
  └── S3.4-7 Skybox day/night                    │
      │                                          │
SPRINT 4 (Cleaning Mechanic)    ←── depends on ──┘
  │                                (LightingSystem)
  ├── S4.1 Wall decor
  ├── S4.2-3 Torch tiles + interaction
  └── S4.4 Readiness scoring
      │
SPRINT 5 (Narrative)
  │
  ├── S5.1 Evidence items
  ├── S5.2 Faction rep
  └── S5.3 Morning monologues
```

---

## What Dies

These DG modules are replaced by EyesOnly extractions and should be archived, not maintained:

| DG Module | Lines | Replaced By |
|-----------|-------|-------------|
| lighting.js (stub) | 63 | EyesOnly LightingSystem (1,106) |

That's it. One replacement. Everything else is additive — EyesOnly systems layer onto DG's existing architecture. DG's working systems (combat, cards, dialog, movement, rendering) stay exactly as they are.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| EyesOnly LightingSystem assumes top-down grid | Raycaster reads wrong values | Verify: DG's raycaster reads lightMap[y][x] same as EyesOnly |
| Tag synergy conflicts with suit RPS | Confusing combat math | Suits resolve FIRST (mandatory), tags apply AFTER (bonus) |
| Save/load localStorage quota on webOS | Can't save | Compress state JSON, LRU eviction for floor cache |
| Footstep audio files missing | Silent movement | Fallback to DG's existing step SFX |
| EyesOnly modules reference missing globals | Runtime errors | All extractions use `typeof X !== 'undefined'` guards |
| Card quality inflates power curve | Trivial late-game | Cap quality by floor depth, cleaning bonus is +1 tier max |

---

## Files Created/Modified Per Sprint

| Sprint | New Files | Modified Files |
|--------|-----------|----------------|
| S1 | engine/save-load.js | engine/lighting.js (rewrite), engine/audio-system.js, engine/loot-tables.js |
| S2 | engine/tag-synergy.js, engine/enemy-intent.js | engine/synergy-engine.js, engine/status-effect.js, engine/card-system.js, data/cards.json |
| S3 | — | engine/raycaster.js, engine/skybox.js, engine/tiles.js, engine/texture-atlas.js, engine/hud.js |
| S4 | — | engine/tiles.js, engine/floor-manager.js, engine/grid-gen.js, engine/interact-prompt.js |
| S5 | engine/faction-rep.js, engine/evidence.js | engine/world-items.js, engine/monologue-peek.js, data/strings/en.js |

---

## Total Estimated Time

| Sprint | Hours | Focus |
|--------|-------|-------|
| **S0 — Inventory/Card/Menu Rework** | **15** | **Kill redundancy, single authority** |
| S1 — Foundation extractions | 7 | Lighting, save/load, audio, loot scatter |
| S2 — Combat depth | 7 | Tag synergies, intents, statuses, card quality |
| S3 — DG engine | 10 | N-layer raycaster + skybox day/night |
| S4 — Cleaning mechanic | 5 | Torch tiles, interaction, readiness scoring |
| S5 — Narrative | 4 | Evidence, factions, monologues |
| **Total** | **48h** | |

**Sprint 0 is non-negotiable.** Every subsequent sprint touches cards, inventory, or
the menu surface. If the foundation is fractured, every sprint re-introduces bugs.

The game becomes playable with working inventory + combat after Sprint 0 (~15h).
Cleaning loop comes online after S0 + S1 + S4 (~27h). Full depth after all sprints.

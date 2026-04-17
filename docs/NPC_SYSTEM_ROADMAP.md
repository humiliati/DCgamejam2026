# NPC System Roadmap
> **DOC-9** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-03-29

---

## Table of Contents

1. [Overview](#1-overview)
2. [NPC Type Taxonomy](#2-npc-type-taxonomy)
3. [Bark System Architecture](#3-bark-system-architecture)
4. [Implemented: NpcSystem.js (Phase A.0)](#4-implemented-npcsystemjs)
5. [Roadmap: Interactive NPCs & Dialogue Trees](#5-roadmap-interactive-npcs--dialogue-trees)
6. [Roadmap: Vendors with Variety Barks](#6-roadmap-vendors-with-variety-barks)
7. [Roadmap: Dispatcher NPCs (Stop + Instruct)](#7-roadmap-dispatcher-npcs-stop--instruct)
8. [Roadmap: Hero NPCs (Rare Rovers)](#8-roadmap-hero-npcs-rare-rovers)
9. [Roadmap: Building Interior NPC Assignment](#9-roadmap-building-interior-npc-assignment)
10. [Module & File Map](#10-module--file-map)
11. [Bare Minimum Deployment Checklist](#11-bare-minimum-deployment-checklist)
12. [Cross-References](#12-cross-references)

---

## 1. Overview

Dungeon Gleaner's world needs to feel inhabited without the compute budget of a traditional AI-driven NPC system. The approach is layered:

**Layer 1 — Data-driven barks (Fable model)**
Every NPC draws ambient speech from named pools in `data/barks/en.js`. Pool keys encode context (`ambient.promenade.morning`, `interior.bazaar`, `npc.dispatcher.gate.intro`). BarkLibrary handles weighted random selection, cooldown anti-repeat, and one-shot lines. Logic files contain only pool keys — no literal text.

**Layer 2 — Patrol bodies (ambient realism)**
Ambient and interactive NPCs patrol 2-point paths at 1–2s/step. They're decoration that moves. The raycaster renders their emoji stacks; the minimap renders them as colored dots. No pathfinding required for 2-point bounce patrol.

**Layer 3 — Interaction verbs (interactive NPCs)**
InteractPrompt already detects `enemy.friendly === true` on the facing tile and shows `[OK] Talk`. NpcSystem.interact() dispatches to BarkLibrary, DialogBox, or the Shop system based on NPC type.

**Layer 4 — Encounter scripting (Dispatcher / Hero)**
High-impact NPCs that stop the player, use combat-style facing initialization, and deliver scripted instructions. These are the narrative pillars — fewer in number, choreographed rather than ambient.

The bark system is documented in TUTORIAL_WORLD_ROADMAP §18 and implemented as of Phase A.0.

---

## 2. NPC Type Taxonomy

| Type | Movement | Interaction | Bark | Blocks | Rarity |
|------|----------|-------------|------|--------|--------|
| **AMBIENT** | 2-pt patrol | None (no Talk prompt) | Proximity (radius 3–4 tiles) | No | Common |
| **INTERACTIVE** | 2-pt patrol | `[OK] Talk` → bark/dialogue | Proximity + on Talk | No | Moderate |
| **VENDOR** | Stationary or 2-pt | `[OK] Talk` → shop + greet bark | On approach + on Talk | No | Per-building |
| **DISPATCHER** | Stationary | `[OK] Talk` → instruction bark | Bump-triggered bark cascade | Yes (blocks movement tile) | Story NPCs |
| **HERO** | Fast multi-pt rove | None (can't be stopped) | Floor-enter bark | No (but destructive) | Rare (hero day) |

---

## 3. Bark System Architecture

### 3.1 What Was Built (Phase A.0)

`engine/bark-library.js` (Layer 1) implements the full Fable bark engine:

- **`register(key, barks, opts)`** — Register a named pool. Entry schema:
  ```
  { text, speaker, style, weight, oneShot }
  ```
- **`fire(key, opts)`** — Pick a bark and display it via the registered displayFn.
- **`pick(key)`** — Pick without displaying (for callers that handle rendering).
- **`setDisplay(fn)`** — Wire the display function. Game sets it at init to route `'toast'` style barks to Toast and `'dialog'` style barks to DialogBox.
- **Weighted random**: `weight` field. Higher weight = more likely.
- **Cooldown anti-repeat**: After firing, an entry enters a 45s cooldown. The oldest cooling entry fires if all are cooling (prevents silence on small pools).
- **One-shot**: `oneShot: true` entries retire after first fire per session.
- **`reset(key?)`** — Reset cooldowns (new day, new game).

### 3.2 Pool Key Convention

```
ambient.<floor>              — Random passerby on a floor (no speaker)
ambient.<floor>.<context>    — Passerby during specific context/time
interior.<building>          — Patron/staff inside a specific building
npc.<id>.<situation>         — Named NPC lines for a situation
home.<object>                — Player's home object interactions
system.<event>               — System-driven narration (day start, curfew, etc.)
```

### 3.3 Bark Firing Hierarchy

1. **Proximity (NpcSystem)** — fires `npc.barkPool` when player within `barkRadius` tiles. Per-NPC timer prevents flood.
2. **Floor arrival (Game._onArriveX)** — fires once per visit, 2.5s after arrival. Sets a recurring ambient interval timer.
3. **Bump (Game._onBump)** — fires Dispatcher bark cascade when player bumps a blocking NPC.
4. **Interact (Game._interact via NpcSystem.interact)** — fires on `[OK] Talk`. Uses `dialoguePool` or starts a DialogBox tree.
5. **Object interaction (Game._interact)** — home chest, mailbox, bed fire their own pools.

### 3.4 Adding New Bark Pools

Add entries to `data/barks/en.js` only. Never add literal text strings to engine files.

```javascript
// In data/barks/en.js:
BarkLibrary.register('interior.armory', [
  { text: '🗣️ "Fresh steel shipment yesterday."', weight: 2 },
  { text: '🗣️ "The blades are guild-certified."',  weight: 1 }
], { cooldownMs: 40000 });
```

---

## 4. Implemented: NpcSystem.js

`engine/npc-system.js` (Layer 3). Covers AMBIENT, INTERACTIVE, VENDOR, DISPATCHER, and HERO (stub).

### 4.1 API

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init()` | → void | Register built-in floor populations |
| `register(floorId, defs)` | → void | Register NPC defs for a floor (append) |
| `registerTree(npcId, tree)` | → void | Attach a DialogBox conversation tree to an NPC |
| `spawn(floorId, enemies, grid)` | → void | Instantiate registered NPCs into enemy list |
| `tick(playerPos, enemies, dt, grid)` | → void | Patrol advance + proximity bark at 10fps |
| `interact(npc, floorId)` | → void | Dispatch Talk interaction by NPC type |
| `clearActive()` | → void | Clear active list (called on floor change) |
| `findAtTile(x, y, enemies)` | → npc\|null | Find first NPC entity at grid position |
| `findById(id, enemies)` | → npc\|null | Find NPC entity by id |
| `isTalkable(x, y, enemies)` | → bool | Is the entity at (x,y) talkable? |

### 4.2 NPC Entity Fields

NPC entities are enemy-compatible objects pushed into `FloorManager.getEnemies()`. They are rendered by the existing raycaster/sprite system with no additional code.

```javascript
{
  id:             string    // Unique stable ID
  name:           string    // Display name
  type:           TYPES.*   // NpcSystem type constant (legacy "type" field)
  npcType:        TYPES.*   // Same value — explicit NPC type marker
  x, y:           number    // Grid position (mutable — patrol advances this)
  facing:         string    // 'north'|'south'|'east'|'west'
  emoji:          string    // Head emoji (fallback for raycaster)
  stack:          object    // NpcComposer triple-layer stack
  hp, maxHp:      999       // Non-combatant (combat system ignores 999hp friendlies)
  str:            0         // No attack
  awareness:      0         // No enemy awareness system
  friendly:       true      // InteractPrompt shows [OK] Talk
  nonLethal:      true      // CombatEngine respects this
  blocksMovement: bool      // Dispatcher NPCs block movement
  talkable:       bool      // Whether [OK] Talk prompt appears
  barkPool:       string    // BarkLibrary pool key
  barkRadius:     number    // Proximity trigger radius in tiles
  barkInterval:   number    // ms between NPC-level bark triggers
  dialoguePool:   string    // BarkLibrary key used on interact
  factionId:      string    // Shop faction (VENDOR type)
  // Internal patrol state (underscore prefix):
  _patrolPoints, _patrolIdx, _stepTimer, _stepInterval
  _barkTimer, _inRadius
}
```

### 4.3 Built-in Populations

Loaded from `data/npcs.json` by `NpcSeed.populate()` during `NpcSystem.init()` (DOC-110 Phase 0 Ch.5, 2026-04-17). The inline `_registerBuiltinPopulations()` bootstrap was retired in the same cutover — `data/npcs.json` is now the sole source of truth at runtime. Authoring flows through `tools/npc-designer.html`.

| Floor | NPC | Type | Bark Pool |
|-------|-----|------|-----------|
| `"0"` | Maintenance Worker × 2 | AMBIENT | `ambient.approach` |
| `"1"` | Townsperson × 2, Elder × 1 | AMBIENT | `ambient.promenade` / `ambient.promenade.morning` |
| `"1.1"` | Market Patron × 2 | AMBIENT | `interior.bazaar` |

Floor 1.6 has no ambient NPCs (private space). Dispatcher is spawned dynamically by `Game._spawnDispatcherGate()`, not via NpcSystem definitions (it has complex state logic).

### 4.4 Game.js Wiring

| Hook | What it does |
|------|-------------|
| `init()` | Calls `NpcSystem.init()` after `EnemyAI.loadPopulation()` |
| `_onFloorArrive(floorId)` | `NpcSystem.clearActive()` then `NpcSystem.spawn()` |
| `_tick(deltaMs)` | Skips EnemyAI.updateEnemy for `.npcType` entities; calls `NpcSystem.tick()` |
| `_interact()` | After door/chest checks, calls `NpcSystem.findAtTile()` + `NpcSystem.interact()` for talkable NPCs |

---

## 5. Roadmap: Interactive NPCs & Dialogue Trees

### 5.1 What They Are

Interactive NPCs are talkable characters who respond with more than one line. They sit at named locations, may have multiple conversation topics, and remember what the player has already asked.

**Examples in Dungeon Gleaner:**
- **Guild Clerk** (Floor 1.3) — Explains work orders, provides daily briefing.
- **The Archivist** (Floor 1.2 Inn) — Hints at the Dragon Conspiracy. Lines deepen over cycles.
- **The Old Gleaner** (Floor 1.1 Bazaar) — Lore on the last reset cycle. Tips on traps.

### 5.2 DialogBox Conversation Tree (Already Implemented)

`engine/dialog-box.js` already supports `DialogBox.startConversation(npc, tree)`:

```javascript
{
  root: 'greeting',
  nodes: {
    'greeting': {
      text: "Morning. Looking for work orders?",
      choices: [
        { label: "What's the status?",  next: 'status' },
        { label: "Any rumors?",         next: 'rumor' },
        { label: "Goodbye.",            next: null }
      ]
    },
    'status': {
      text: "Coral Cellars at 34% readiness. Heroes in two days.",
      choices: [{ label: "I'll get on it.", next: null }]
    },
    'rumor': {
      text: "Someone said the dragons haven't been seen since last month.",
      choices: [{ label: "Interesting...", next: null, effect: { setFlag: 'dragon_rumor_1' } }]
    }
  }
}
```

To attach a tree to an NPC: `NpcSystem.registerTree('guild_clerk', tree)`.

### 5.3 Implementation Tasks

| Task | File | Est. |
|------|------|------|
| Define Guild Clerk NPC definition + register on Floor 1.3 | `engine/npc-system.js` | 30m |
| Write Guild Clerk dialogue tree (greeting + 3 topics) | `data/dialogues/guild-clerk.js` (new, Layer 5) | 1h |
| Write Archivist tree with Dragon Conspiracy drip | `data/dialogues/archivist.js` (new, Layer 5) | 1.5h |
| Write Old Gleaner tree (lore + tips) | `data/dialogues/old-gleaner.js` (new, Layer 5) | 1h |
| Persist visited-choice flags across sessions (Player state) | `engine/player.js` | 30m |

**Status: Roadmap — post Phase B priority**

---

## 6. Roadmap: Vendors with Variety Barks

### 6.1 Current State

Vendor NPCs use `NpcComposer.getVendorPreset(factionId)` for visuals and the Shop system for commerce. The existing vendor greeting in `Game._openVendorDialog()` has first-visit / return-visit logic but uses hardcoded strings.

### 6.2 Target State

Vendors get:
1. A **proximity bark** from their `barkPool` when the player walks within 4 tiles (ambient shop call-out).
2. An **approach greeting** bark from `npc.<faction>.greeting` when the player interacts.
3. A **short interaction** bark pool (`npc.<faction>.shop`) for lines that fire while the shop is open.
4. Full shop UI as currently (unchanged).

### 6.3 Bark Pools Needed

| Pool key | Faction | Sample |
|----------|---------|--------|
| `npc.tide.ambient` | Tide (magical goods) | `"🗣️ Freshest charms this side of the Promenade."` |
| `npc.tide.greeting` | Tide | `"What can I get you? We've restocked since the heroes trashed the last batch."` |
| `npc.foundry.ambient` | Foundry (tools/hardware) | `"🗣️ Best tools in the district, certified guild-grade."` |
| `npc.foundry.greeting` | Foundry | `"Need tools? We've got everything but patience."` |
| `npc.admiralty.ambient` | Admiralty (weapons/armor) | `"🗣️ Steel's back in stock. Adventurers cleaned us out last cycle."` |
| `npc.admiralty.greeting` | Admiralty | `"Equipment for the discerning operative. No questions asked."` |

### 6.4 Implementation Tasks

| Task | File | Est. |
|------|------|------|
| Register vendor NPCs in NpcSystem (Floor 1.1 shops) with `type: VENDOR, factionId` | `engine/npc-system.js` | 20m |
| Add bark pools for all 3 factions (ambient + greeting) | `data/barks/en.js` | 45m |
| Wire vendor ambient bark into NpcSystem.spawn (existing patrol = stationary) | `engine/npc-system.js` | 15m |
| Move vendor greeting strings from `Game._openVendorDialog()` hardcoded text to BarkLibrary | `engine/game.js` | 30m |

**Status: Roadmap — Phase B priority (vendor NPCs visible during jam)**

---

## 7. Roadmap: Dispatcher NPCs (Stop + Instruct)

### 7.1 What They Are

Dispatcher-type NPCs are story-critical characters who **stop the player** and **give explicit instructions** before releasing them to explore. They use the same facing-initialization mechanic as combat (the player's camera snaps to face the NPC) and deliver a bark cascade that sequences through intro → direction → nudge pools.

The primary Dispatcher (the player's handler at the agency) is already implemented in Phase A.0. This section documents the pattern for future Dispatcher NPCs (quest givers, faction liaisons, story beats).

### 7.2 Current Dispatcher Implementation

The existing Dispatcher gate encounter:
1. `Game._spawnDispatcherGate()` pushes a DISPATCHER entity with `blocksMovement: true` at (5,2) on Floor 1.
2. `Game._onBump()` detects the bump, then fires bark cascade: `npc.dispatcher.gate.intro` → `npc.dispatcher.gate.direction` → `npc.dispatcher.gate.nudge`.
3. When player returns from Floor 1.6 with keys, `_onPickupWorkKeys()` removes the entity and invalidates the floor cache.

> **Extraction note:** `_onPickupWorkKeys()` was extracted from `game.js` to `engine/home-events.js` as `HomeEvents.onPickupWorkKeys()`.

### 7.3 The Force-Facing Mechanic (Roadmap)

Fable's "character stops you and talks" mechanic requires:
1. When the player **moves onto a tile adjacent to a DISPATCHER NPC**, the player's camera orientation snaps to face the NPC (a `MovementController.snapDir()` call or equivalent `Player.setDir()` + `MouseLook.resetOffset()`).
2. The DialogBox opens with the NPC's intro bark.
3. `InputPoll` is blocked (`IntroWalk`-style) until the dialogue is dismissed.
4. On dismiss, player resumes free movement.

**Implementation tasks:**

| Task | File | Est. |
|------|------|------|
| Add `snapFacing(targetNpcX, targetNpcY)` helper to MovementController | `engine/movement.js` | 30m |
| Wire snap in `Game._onMoveFinish()`: if adjacent DISPATCHER, snap + open dialogue | `engine/game.js` | 30m |
| Add `InputPoll.setBlocked(true/false)` during forced dialogue | `engine/input-poll.js` | 20m |
| Test with existing Dispatcher (gate encounter as first candidate) | — | 30m |

**Status: Roadmap — Phase C priority (after crate system)**

### 7.4 New Dispatcher Instances (Roadmap)

Future story-gate NPCs that follow the Dispatcher pattern:

| NPC | Floor | Condition | Instruction |
|-----|-------|-----------|-------------|
| **The Taskmaster** (Guild) | `1.3` | First enter Guild | Explains work-order system |
| **Faction Liaison** (Act 1 end) | `1` | After 3 hero cycles | Exposes first Dragon Conspiracy detail |
| **The Detective** | `2` | First reach district 2 | Recruits player into investigation |

Each gets a `DISPATCHER` NPC definition, a bark cascade in `data/barks/en.js`, and optionally a full DialogBox tree via `NpcSystem.registerTree()`.

---

## 8. Roadmap: Hero NPCs (Rare Rovers)

### 8.1 What They Are

Hero NPCs are the adventurers from the 3-day hero cycle. They appear on **Hero Day** (day 3 of each cycle) and rove through the dungeon floors, interacting destructively with everything they encounter (smashing crates, triggering traps, killing monsters). The player must avoid detection while the hero is active, or get shoved/caught.

Hero NPCs are **fundamentally different** from ambient NPCs:
- They **rove across multiple floors** (stairs transitions between depth 2–3).
- They move **faster** (300ms/step vs 1200ms for ambient).
- They have **wide-cone, long-range sight** (10-tile range vs 6-tile for enemies).
- They leave **destruction markers** behind (dirty tiles, smashed crates, triggered traps).
- They are **unkillable** in Act 1 (player can stun, not kill; hero recovers).

### 8.2 Hero NPC Types

| Type | Movement | Special | Bark Pool |
|------|----------|---------|-----------|
| **Fighter** | Straight-line charge to nearest enemy/crate | Smashes crates for loot | `npc.hero.fighter` |
| **Rogue** | Diagonal + random detour | Disarms traps (removing them from the reset list) | `npc.hero.rogue` |
| **Mage** | Slow but wide AoE | Blasts rooms (mass dirty tiles) | `npc.hero.mage` |
| **Paladin** | Patrols whole floor systematically | Highest awareness range | `npc.hero.paladin` |

### 8.3 Movement Model (Different from All Other NPCs)

Hero NPCs use full `Pathfind.find()` rather than the 2-point bounce system:
- **Target priority**: Nearest enemy, then nearest crate, then nearest dungeon exit.
- **Floor spanning**: On reaching STAIRS_DN, hero transitions to next floor. Minimap shows last-known floor.
- **Awareness cone**: 180° forward, 10-tile range (vs enemy 6-tile, 90° cone).
- **Speed**: 300ms/step (4× faster than ambient patrollers, similar to enemy combat speed).

### 8.4 Implementation Tasks

| Task | File | Est. |
|------|------|------|
| `engine/hero-system.js` (new, Layer 3) — hero entity factory, patrol AI, floor-spanning | `engine/hero-system.js` | 3h |
| Hero spawn on Hero Day (game tick event) | `engine/game.js` | 30m |
| Destruction marking (dirty tiles, smashed crates) | `engine/cleaning-system.js` | 1h |
| Hero NPC bark pools | `data/barks/en.js` | 30m |
| Hero sight cone (extend EnemyAI or HeroSystem) | `engine/hero-system.js` | 1h |
| Player shove/stun mechanic | `engine/player.js` + `engine/game.js` | 1h |

**Status: Roadmap — Phase D (after cleaning system)**
**Design ref:** TUTORIAL_WORLD_ROADMAP §14, §6

---

## 9. Roadmap: Building Interior NPC Assignment

### 9.1 What They Are

Each building interior has a small, curated roster of NPCs with **building-specific bark pools**. Interior NPCs feel different from exterior passersby — they're staff, regulars, or residents who talk about the specific function of their building.

### 9.2 Current State

`data/npcs.json` (loaded by `NpcSeed.populate()` — see §4.3) ships:
- Floor 1.1 (Coral Bazaar): 2 market patrons → `interior.bazaar`
- Floor 1.6 (Gleaner's Home): No ambient NPCs (private)

### 9.3 Planned Interior Populations

| Floor | Building | NPC Roster | Bark Pool |
|-------|----------|-----------|-----------|
| `1.1` | Coral Bazaar | 2 patrons (ambient), 1 vendor per faction | `interior.bazaar` |
| `1.2` | Driftwood Inn | 1 innkeeper (interactive), 2 guests (ambient) | `interior.inn` |
| `1.3` | Gleaner's Guild | 1 guild clerk (interactive), 2 guildmates (ambient) | `interior.guild` |
| `2.1` | Dispatcher's Office | 1 dispatcher (interactive) | `interior.office` |
| `2.2` | Watchman's Post | 1 watchman (interactive), 1 sleeping guard (ambient) | `interior.watchpost` |

### 9.4 Building-NPC Assignment Pattern

Each interior NPC definition includes `homeFloor` (its assigned building). Future day/night system uses this to make NPCs disappear when their building is "closed" and reappear at dawn. For jam scope, NPCs are always present.

```javascript
// Authored in tools/npc-designer.html → persisted to data/npcs.json.
// At runtime NpcSeed.populate() calls NpcSystem.register() with the
// per-floor lists below; no code in engine/ hand-registers NPCs any
// more (DOC-110 Phase 0 Ch.5, 2026-04-17).
//
// On floor 1.3 the authored payload is equivalent to:
register('1.3', [
  {
    id: 'guild_clerk',
    type: TYPES.INTERACTIVE,
    x: 8, y: 3,
    emoji: '🧑‍💼',
    name: 'Guild Clerk',
    barkPool: 'interior.guild',
    barkRadius: 4,
    dialoguePool: 'npc.guild_clerk.greeting',
    talkable: true
  },
  // ... more guildmates
]);
```

### 9.5 Implementation Tasks

| Task | File | Est. |
|------|------|------|
| Add Driftwood Inn (Floor 1.2) and Guild (Floor 1.3) hand-authored floors | `engine/floor-manager.js` | 1.5h |
| Register interior NPC populations for 1.2 + 1.3 | `engine/npc-system.js` | 30m |
| Add `interior.inn`, `interior.watchpost` bark pools | `data/barks/en.js` | 20m |
| Guild Clerk interactive dialogue tree | `data/dialogues/guild-clerk.js` | 1h |

**Status: Roadmap — Phase B/C (guild needed for work-order system)**

---

## 10. Module & File Map

### ✅ Implemented (Phase A.0)

| File | Layer | Role |
|------|-------|------|
| `engine/bark-library.js` | 1 | Fable-style bark engine (pools, cooldown, one-shot, display hook) |
| `engine/npc-system.js` | 3 | NPC type system, patrol, proximity barks, interact dispatch |
| `data/barks/en.js` | 5 | All bark text: ambient, interior, dispatcher, home, system |

### 🗺️ Roadmapped

| File | Layer | Role | Phase |
|------|-------|------|-------|
| `engine/hero-system.js` | 3 | Hero NPC AI (fast rove, floor-spanning, destruction) | D |
| `data/dialogues/guild-clerk.js` | 5 | Guild Clerk conversation tree | B |
| `data/dialogues/archivist.js` | 5 | Inn Archivist — Dragon Conspiracy drip | C |
| `data/dialogues/old-gleaner.js` | 5 | Bazaar Old Gleaner — lore + tips | B |
| `data/dialogues/dispatcher.js` | 5 | Dispatcher multi-scene dialogue | C |

### Modified by NPC System

| File | Changes |
|------|---------|
| `engine/game.js` | NpcSystem.init(), spawn(), tick(), interact() wired |
| `engine/floor-manager.js` | Floor 1.6, home biome, DOOR(17,7) on Floor 1 |
| `engine/npc-composer.js` | `dispatcher` vendor preset |
| `index.html` | `npc-system.js` (Layer 3), `data/barks/en.js` (Layer 5) |

---

## 11. Bare Minimum Deployment Checklist

These items must work for a playable DC Jam submission (April 5):

- [x] `BarkLibrary` — register, fire, pick, cooldown, one-shot
- [x] `data/barks/en.js` — all ambient, dispatcher, home, system pools
- [x] `NpcSystem.init()` — built-in populations registered at startup
- [x] Ambient patrol NPCs on Floor 0 (2 workers) and Floor 1 (3 townspeople)
- [x] Proximity bark trigger (player walks near → NPC barks)
- [x] Dispatcher gate NPC on Floor 1 (blocks dungeon entrance Day 1)
- [x] Dispatcher bump bark cascade (intro → direction → nudge)
- [x] Floor 1.6 (Gleaner's Home) — hand-authored, biome, spawn, door connection
- [x] Work-keys pickup on Floor 1.6 → gate unlock → Dispatcher despawn
- [x] `interior.bazaar` bark pool for Coral Bazaar patrons
- [x] Vendor ambient barks (proximity bark when near shop) — **Phase B** *(npc.promenade.vendor pool + openShop effect)*
- [ ] Guild interactive NPC with dialogue tree — **Phase B**
- [x] `[OK] Talk` on interactive NPCs routes to `NpcSystem.interact()` — **Phase B** *(NpcSystem dispatch wired; talkable NPC defs populated)*
- [x] Dispatcher force-facing mechanic (camera snap) — **Phase C** *(MouseLook.lockOn/releaseLock in grab + interactive)*
- [ ] Hero NPC AI — **Phase D**

---

## 12. Cross-References

| Section | Links To | Relationship |
|---------|----------|-------------|
| §3 Bark System | → `engine/bark-library.js`, `data/barks/en.js` | Implementation |
| §3 Bark System | → TUTORIAL_WORLD_ROADMAP §18.3 | Pre-phase bark pool table |
| §4 NpcSystem | → `engine/npc-system.js` | Implementation |
| §5 Interactive NPCs | → `engine/dialog-box.js` | DialogBox.startConversation() already implemented |
| §7 Dispatcher | → TUTORIAL_WORLD_ROADMAP §18.4 | Dispatcher entity spec |
| §7 Force-Facing | → `engine/movement.js` | MovementController.snapDir() (not yet implemented) |
| §8 Hero NPCs | → TUTORIAL_WORLD_ROADMAP §14 | Hero patrol + sight cone spec |
| §8 Hero NPCs | → CORE_GAME_LOOP §5 (hero cycle) | 3-day hero cycle timing |
| §9 Interior NPCs | → TUTORIAL_WORLD_ROADMAP §3.1 | Floor registry |
| §11 Bare Min | → TABLE_OF_CONTENTS_CROSS_ROADMAP Phase A.0 | Delivery schedule |
| **Authoring tooling** | → **NPC_TOOLING_ROADMAP.md (DOC-110)** | The NPC entity schema documented in §4.2 + dialogue trees in §5 + dispatcher choreography in §7 are all authored through the seven-tool suite (NPC Designer, Bark Workbench, Archetype Studio, Enemy Hydrator, Sprite Studio, Population Planner). `data/npcs.json` is the runtime source of truth; the inline `_registerBuiltinPopulations()` bootstrap was retired in DOC-110 Phase 0 Ch.5 (2026-04-17). |

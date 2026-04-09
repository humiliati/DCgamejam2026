# Verb-Field NPC System Roadmap — Sundog-Diffused Idle Behavior

> **DOC-83** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-04-08
> **Status**: Design — Phase 0 ready for implementation
> **Depends on**: DOC-9 (NPC_SYSTEM_ROADMAP), DOC-32b (TOOLTIP_BARK_ROADMAP), NPC_FACTION_BOOK_AUDIT, ACT2_NARRATIVE_OUTLINE
> **Sundog ref**: `C:\Users\hughe\.openclaw\workspace\sundog` — Alignment Theorem (H(x) = ∂S/∂τ), Agent Leisure Architecture

---

## Table of Contents

1. [Vision](#1-vision)
2. [Theoretical Basis — Sundog Diffusion](#2-theoretical-basis--sundog-diffusion)
3. [Current State](#3-current-state)
4. [Spatial Node Schema](#4-spatial-node-schema--world-objects)
5. [Verb Schema](#5-verb-schema)
6. [Verb-Field Tick Resolution](#6-verb-field-tick-resolution)
7. [NPC-to-NPC Encounter Detection](#7-npc-to-npc-encounter-detection)
8. [Bark Integration — Verb-Semantic Pools](#8-bark-integration--verb-semantic-pools)
9. [Act 2 Escalation — Factional Verb Collisions](#9-act-2-escalation--factional-verb-collisions)
10. [Implementation Phases](#10-implementation-phases)
11. [Module & File Map](#11-module--file-map)
12. [Cross-References](#12-cross-references)
13. [Verb-Node Tile Catalog](#13-verb-node-tile-catalog--tiles--textures-needed)
14. [Cross-Floor NPC Traversal](#14-cross-floor-npc-traversal)
15. [Reanimated Creature Verb Integration](#15-reanimated-creature-verb-integration)
16. [Retrofuturistic Building & Archetype Expansion](#16-retrofuturistic-building--archetype-expansion)
17. [Living Infrastructure — Eat, Sleep, Congregate](#17-living-infrastructure--eat-sleep-congregate)
18. [Reanimation Tiers — Dialogue, Wander, Dispatch](#18-reanimation-tiers--dialogue-wander-dispatch)

---

## 1. Vision

NPCs in Dungeon Gleaner should feel like they have errands, habits, and social lives — not like they're pacing a hallway. The player should overhear a Tide scholar at the bonfire complaining about the Foundry's kiln emissions, then see that same scholar drift toward the bazaar entrance, browse for a moment, and return to their post. Two citizens should end up at the well at the same time and exchange gossip — not because a designer scripted the meeting, but because their independent needs brought them to the same place.

In Act 1, this is Stardew Valley atmosphere: the town feels alive. In Act 2, this becomes GTA 2 faction tension: faction NPCs orbiting the same contested spaces creates visible territorial friction. The verb-field system serves both tones without reauthoring.

### Design North Star

> The player watches an NPC leave their post, walk to a bonfire, stand there for a moment, then drift toward a shop entrance. Another NPC arrives at the bonfire just as the first leaves. The player thinks: "These people have lives." They don't think: "That NPC is running a behavior tree."

### Reference Games

- **Dwarf Fortress** — Needs generate tasks, tasks have spatial targets, dwarves path organically between satisfaction points
- **The Sims** — Decaying need meters drive action selection; personality weights create individual rhythms
- **Stardew Valley / Radiant AI** — Scheduled routines give NPCs readable habits; perturbation makes them feel less clockwork
- **GTA 2** — Faction NPCs occupy territory; crossing into enemy turf creates emergent encounters

### What This Is Not

- ❌ A pathfinding rewrite (reuses existing greedy-step movement from `_tickPatrol`)
- ❌ A full utility AI system (no action scoring, no plan chains — just field gradients)
- ❌ A replacement for existing patrol NPCs (2-point bounce still works for lamplighters, guards, etc.)
- ❌ A new rendering system (verb NPCs render identically to current NPC entities)

---

## 2. Theoretical Basis — Sundog Diffusion

The Sundog Alignment Theorem (H(x) = ∂S/∂τ) demonstrates that alignment emerges from resonance between structured environmental fields, not from direct targeting. An agent converges on inferred targets through the interference pattern of multiple simultaneous influences — "bloom collapse."

Applied to NPC idle behavior:

**Each verb is a field.** A verb like `social` radiates from every bonfire, well, and bench on the floor. The field strength at any point is a function of verb need (τ — the agent's internal state) and proximity to satisfier nodes (S — the environmental structure). The NPC doesn't "decide" to go social — they drift toward the strongest pull in the combined field of all their active verbs.

**Bloom collapse is arrival.** When an NPC reaches a satisfier node, that verb's need drops sharply — the bloom collapses. Other verbs' fields, previously suppressed by the dominant pull, reassert themselves. The NPC begins drifting toward a new attractor. This creates the organic stove→bonfire→errands→stove orbit without any authored transition logic.

**Encounters are interference patterns.** When two NPCs' verb fields bring them to the same spatial node simultaneously, the encounter is emergent — a resonance event. The nature of the encounter (camaraderie vs. tension) is determined by whether their active verbs align or conflict, and whether their factions align or conflict.

**Personality is field weighting.** The granny archetype has high duty decay (strong stove pull) and low errands decay (rarely leaves home). The drunk has high social decay (always at the bonfire) and negligible duty decay (never at work). Same verb vocabulary, different coefficients — different emergent orbits.

---

## 3. Current State

### What Exists (Phase A.0)

| System | File | Capability |
|--------|------|------------|
| NPC patrol | `engine/npc-system.js` | 2-point bounce (`patrolPoints`), `_tickPatrol()` at 10fps |
| Proximity barks | `engine/bark-library.js` | Pool-keyed, weighted, cooldown, one-shot |
| Dialogue ping-pong | `engine/npc-system.js` | `_tickDialoguePingPong()` — NPCs within 2 tiles show alternating 💬 |
| Faction uniforms | `engine/npc-composer.js` | `tide_member`, `foundry_member`, `admiralty_member` role templates |
| Spatial audio | `engine/spatial-dir.js` | Direction resolver, distance falloff (Phase 4a wired) |
| NPC footsteps | `engine/npc-system.js` | `_playNpcStep()` — contract-aware spatial audio on patrol advance |

### What's Missing

| Gap | Impact |
|-----|--------|
| No spatial nodes on floors | NPCs can't reason about *where things are* — only their 2 waypoints |
| No verb/need model | NPCs have no internal state driving movement — it's pure A↔B |
| No encounter semantics | Ping-pong detects proximity but doesn't know *why* NPCs are near each other |
| No verb-aware barks | Bark pools are keyed by floor/NPC, not by what the NPC is currently doing |
| No faction encounter escalation | Cross-faction proximity has no behavioral consequence |

---

## 4. Spatial Node Schema — World Objects

Spatial nodes are named points on each floor that verbs can target. They're the "objects" that NPCs satisfy their verbs at — the Dwarf Fortress furniture nodes extended to exterior spaces.

### 4.1 Node Definition

```javascript
// Registered per floor alongside tile grid and NPC populations.
// In engine/npc-system.js or a new engine/verb-nodes.js (Layer 1).

VerbNodes.register('1', [
  // Social nodes — places NPCs gather
  { id: 'promenade_bonfire',   type: 'bonfire',        x: 30, y: 14 },
  { id: 'promenade_well',      type: 'well',           x: 18, y: 20 },
  { id: 'promenade_bench_n',   type: 'bench',          x: 24, y: 8  },

  // Errands nodes — places NPCs browse or check
  { id: 'bazaar_entrance',     type: 'shop_entrance',  x: 12, y: 7  },
  { id: 'inn_entrance',        type: 'shop_entrance',  x: 20, y: 12 },
  { id: 'bulletin_board',      type: 'bulletin_board',  x: 35, y: 10 },
  { id: 'guild_entrance',      type: 'shop_entrance',  x: 8,  y: 18 },

  // Duty nodes — places NPCs "work" at
  { id: 'tide_post',           type: 'faction_post',   x: 22, y: 10, faction: 'tide' },
  { id: 'foundry_post',        type: 'faction_post',   x: 36, y: 10, faction: 'foundry' },
  { id: 'admiralty_post',      type: 'faction_post',   x: 14, y: 22, faction: 'admiralty' },
  { id: 'lamplighter_route_a', type: 'work_station',   x: 24, y: 16 },

  // Rest nodes — places NPCs idle quietly
  { id: 'inn_interior',        type: 'rest_spot',      x: 22, y: 13 },
  { id: 'home_porch',          type: 'rest_spot',      x: 10, y: 5  }
]);
```

### 4.2 Node Type Vocabulary

| Node Type | Satisfies Verb | Examples | Notes |
|-----------|---------------|----------|-------|
| `bonfire` | social | Promenade bonfire, campfires | Primary social gathering point |
| `well` | social | Town wells, fountains | Secondary social node |
| `bench` | social, rest | Benches, sitting spots | Dual-verb: social if others present, rest if alone |
| `shop_entrance` | errands | Bazaar door, inn door, guild door | NPC pauses here, faces the door |
| `bulletin_board` | errands | Notice boards, quest boards | NPC pauses, reads |
| `faction_post` | duty | Faction patrol anchor points | Faction-tagged — only satisfies NPCs of matching faction |
| `work_station` | duty | Forge, desk, anvil, counter | Role-specific duty nodes |
| `rest_spot` | rest | Inn seats, porches, quiet corners | Low-traffic idle positions |

### 4.3 Interior Nodes

Interior floors (depth 2+) get the same treatment. The NPC_CANON's existing furniture nodes (`stove`, `bed`, `forge`, `anvil`) become verb nodes:

```javascript
VerbNodes.register('1.2', [  // Driftwood Inn
  { id: 'inn_hearth',    type: 'bonfire',       x: 6, y: 4 },
  { id: 'inn_counter',   type: 'work_station',  x: 8, y: 3 },
  { id: 'inn_table_1',   type: 'bench',         x: 4, y: 6 },
  { id: 'inn_bookshelf', type: 'bulletin_board', x: 10, y: 2 }
]);
```

---

## 5. Verb Schema

### 5.1 NPC Verb Set

NPCs that opt into the verb-field system replace `patrolPoints` with a `verbSet`. Existing `patrolPoints` NPCs are unaffected — the two systems coexist.

```javascript
{
  id: 'floor1_tide_scholar',
  type: TYPES.AMBIENT,
  x: 22, y: 10,
  // No patrolPoints — verb-field driven
  verbSet: {
    duty:    { need: 0.8, decayRate: 0.0020, satisfiers: ['faction_post'], factionLock: 'tide' },
    social:  { need: 0.3, decayRate: 0.0012, satisfiers: ['bonfire', 'well', 'bench'] },
    errands: { need: 0.4, decayRate: 0.0008, satisfiers: ['shop_entrance', 'bulletin_board'] }
  },
  barkPool: 'faction.tide',
  // ... standard NPC fields
}
```

### 5.2 Verb Fields

| Field | Type | Description |
|-------|------|-------------|
| `need` | float 0–1 | Current hunger for this verb. Starts at spawn value. |
| `decayRate` | float | Need increase per ms. Higher = stronger pull over time. |
| `satisfiers` | string[] | Node types that satisfy this verb. |
| `factionLock` | string? | If set, only nodes with matching `faction` tag satisfy this verb's `faction_post` type. |

### 5.3 Archetype Presets

Personality is entirely expressed through decay rates and spawn needs. These presets map onto the existing NPC_CANON archetypes:

| Archetype | duty decay | social decay | errands decay | rest decay | Character |
|-----------|-----------|-------------|---------------|------------|-----------|
| `scholar` | 0.0020 | 0.0012 | 0.0008 | 0.0004 | Mostly at post, occasional bonfire, rare errands |
| `worker` | 0.0025 | 0.0008 | 0.0010 | 0.0006 | Anchored to work station, errands > socializing |
| `citizen` | 0.0005 | 0.0018 | 0.0020 | 0.0008 | Wanders between shops and social spots |
| `drunk` | 0.0002 | 0.0030 | 0.0005 | 0.0002 | Glued to bonfire/well, barely leaves |
| `guard` | 0.0028 | 0.0004 | 0.0003 | 0.0005 | Almost always at post, stiff and dutiful |
| `granny` | 0.0022 | 0.0010 | 0.0004 | 0.0015 | At stove most of the time, rests often |

### 5.4 Satisfaction Mechanics

When an NPC arrives within 1 tile of a satisfier node:

```
verb.need -= SATISFACTION_DROP    // e.g. 0.5 — large immediate reduction
verb.need = max(0, verb.need)     // clamp
npc._satisfyTimer = LINGER_TIME   // 3000-6000ms — NPC pauses at the node
```

During `_satisfyTimer`, the NPC holds position (faces the node) and other verbs continue to decay upward. When the timer expires, the NPC resumes verb-field movement. The linger creates visible "moments" — the scholar reading the bulletin board, the citizen warming at the bonfire.

---

## 6. Verb-Field Tick Resolution

### 6.1 Core Algorithm

Replaces `_tickPatrol` for verb-field NPCs. Runs at the same 10fps cadence.

```
function _tickVerbField(npc, dt, grid, nodes):
  // 1. Decay — increase all verb needs
  for each verb in npc.verbSet:
    verb.need = min(1.0, verb.need + verb.decayRate * dt)

  // 2. Satisfaction hold — if lingering at a node, don't move
  if npc._satisfyTimer > 0:
    npc._satisfyTimer -= dt
    return

  // 3. Score all reachable nodes
  bestScore = -1
  bestNode = null

  for each node in nodes:
    // Skip faction-locked nodes that don't match
    if node.faction and not _verbMatchesFaction(npc, node):
      continue

    // Find which verb(s) this node satisfies
    pull = 0
    for each verb in npc.verbSet:
      if node.type in verb.satisfiers:
        pull += verb.need

    if pull <= 0: continue

    // Distance penalty (inverse — closer nodes score higher)
    dist = manhattanDist(npc.x, npc.y, node.x, node.y)
    if dist == 0: dist = 0.5  // already at node
    score = pull / (dist * DISTANCE_WEIGHT)

    // Small random perturbation to break ties and create variety
    score += random() * NOISE_FACTOR

    if score > bestScore:
      bestScore = score
      bestNode = node

  // 4. Step toward best node (reuse existing greedy-step logic)
  if bestNode:
    _stepToward(npc, bestNode.x, bestNode.y, grid)

  // 5. Check arrival — satisfy verb(s) at current position
  for each node in nodes:
    if manhattanDist(npc.x, npc.y, node.x, node.y) <= 1:
      for each verb in npc.verbSet:
        if node.type in verb.satisfiers:
          verb.need = max(0, verb.need - SATISFACTION_DROP)
      npc._satisfyTimer = LINGER_MIN + random() * (LINGER_MAX - LINGER_MIN)
      npc._currentNode = node  // Track for encounter semantics
      _faceNode(npc, node)
      break
```

### 6.2 Tuning Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `DISTANCE_WEIGHT` | 0.15 | How much distance penalizes pull. Lower = NPCs walk farther for high-need verbs. |
| `NOISE_FACTOR` | 0.05 | Random perturbation on score. Prevents robotic convergence. |
| `SATISFACTION_DROP` | 0.5 | How much need drops on arrival. |
| `LINGER_MIN` | 3000 | Minimum ms spent at a node. |
| `LINGER_MAX` | 7000 | Maximum ms spent at a node. |

### 6.3 Movement Reuse

`_stepToward(npc, tx, ty, grid)` is the same greedy-step logic from `_tickPatrol` — compute dx/dy toward target, check wall collision, advance one tile, play spatial footstep. No pathfinding. The greedy step is intentionally imperfect — NPCs occasionally take suboptimal routes, which looks natural.

---

## 7. NPC-to-NPC Encounter Detection

### 7.1 Encounter Trigger

Extend `_tickDialoguePingPong()` (already scans for NPC pairs within 2 tiles) to detect **verb encounters**: two NPCs lingering at the same node or adjacent nodes.

```
Encounter triggers when:
  - Two NPCs both have _satisfyTimer > 0        (both lingering)
  - Their _currentNode is the same node OR
    their _currentNodes are within 2 tiles       (adjacent benches, etc.)
  - Their pair hasn't fired in ENCOUNTER_COOLDOWN (180s)
```

### 7.2 Encounter Classification

| NPC A Verb | NPC B Verb | Faction Match | Encounter Type | Bark Pool Suffix |
|-----------|-----------|---------------|----------------|-----------------|
| Same | Same | Same | **Camaraderie** | `.camaraderie` |
| Same | Same | Different | **Uneasy coexistence** | `.uneasy` |
| Same | Same | Hostile (Act 2) | **Territorial** | `.territorial` |
| Different | Different | Same | **Passing acknowledgment** | `.passing` |
| Different | Different | Different | **Faction tension** | `.tension` |
| Any | Any | — (non-faction NPCs) | **Gossip** | `.gossip` |

The dominant verb for each NPC is whichever verb drove them to the current node (the verb with the highest satisfier match for `_currentNode.type`).

### 7.3 Encounter Sequence

Reuses the existing ping-pong infrastructure:

1. Both NPCs freeze (`_satisfyTimer` extended by encounter duration)
2. NPCs face each other (`_faceNode` replaced with `_faceEntity`)
3. KaomojiCapsule shows 💬 on both (existing)
4. BarkLibrary fires from the encounter pool (2–3 lines, alternating speaker)
5. After exchange completes, both NPCs resume verb-field movement
6. 180s cooldown on this specific pair

---

## 8. Bark Integration — Verb-Semantic Pools

### 8.1 New Pool Key Convention

Extend the existing bark pool key convention (DOC-9 §3.2) with verb-encounter keys:

```
encounter.<node_type>.<encounter_type>    — Verb encounter barks
encounter.bonfire.camaraderie             — Two same-faction NPCs socializing at bonfire
encounter.bonfire.tension                 — Two different-faction NPCs at bonfire
encounter.shop_entrance.passing           — Two NPCs on different errands near a shop
encounter.well.gossip                     — Non-faction citizens chatting at well
encounter.faction_post.territorial        — Act 2: hostile faction NPC near enemy post
```

### 8.2 Bark Content Guidelines

Encounters are **overheard NPC-to-NPC dialogue** (per NPC_FACTION_BOOK_AUDIT §3.1). The player is eavesdropping on life happening around them.

| Type | Tone | Example |
|------|------|---------|
| Camaraderie | Warm, collegial | "Another late shipment. Think they'll blame us again?" / "They always blame us." |
| Uneasy | Polite but stiff | "Evening." / "Evening." / [silence] |
| Territorial | Low-key hostile | "This post is manned. Move along." / "Public square, friend. I'll stand where I like." |
| Passing | Casual, incidental | "Heading to the bazaar? Pick me up some salt if they have it." / "I'll see what's left." |
| Tension | Politically charged | "Tide Council says the deep caves are protected." / "Foundry says they're unexploited." / "Same caves." |
| Gossip | Worldbuilding, conspiracy breadcrumbs | "Did you hear? Harbour master won't talk about the night shift." / "Everyone's strange since the heroes set up camp." |

### 8.3 Verb-Transition Barks (Solo)

When an NPC finishes lingering and begins moving toward a new verb target, fire a solo bark from a transition pool. This gives the NPC "inner monologue" moments:

```
bark.transition.duty_to_social     — "Think I'll take a break."
bark.transition.social_to_duty     — "Back to it, I suppose."
bark.transition.social_to_errands  — "I should check if they've got any rope in."
bark.transition.errands_to_social  — "Nothing worth buying today."
```

Fires at low probability (20%) to avoid spam. Uses existing proximity bark radius — only audible if the player is nearby.

---

## 9. Act 2 Escalation — Factional Verb Collisions

### 9.1 Faction Hostility Flag

Act 2 introduces `factionHostility` — a per-pair hostility level between factions (ACT2_NARRATIVE_OUTLINE §4):

```javascript
FactionState = {
  hostility: {
    'tide_foundry':    0.0,   // 0 = neutral, 1 = hostile
    'tide_admiralty':   0.0,
    'foundry_admiralty': 0.0
  }
}
```

This value rises as the player completes faction missions. When hostility > 0.5, encounters between those factions escalate from "tension" to "territorial." When hostility > 0.8, faction NPCs actively **avoid** nodes occupied by hostile-faction NPCs (the avoidance verb — a new negative-pull field that repels from enemy-occupied nodes).

### 9.2 Contested Nodes

In Act 2, certain nodes become **contested** — both factions claim them:

```javascript
{ id: 'frontier_bonfire', type: 'bonfire', x: 20, y: 15, contested: true }
```

Contested nodes attract faction NPCs from both sides (both have social verbs). When a Tide and Foundry NPC both arrive at a contested bonfire during high hostility, the encounter escalates:

1. Territorial bark exchange (3–4 lines, more heated than Act 1 tension)
2. One NPC "retreats" — their duty verb spikes artificially, pulling them back to their faction post
3. If hostility > 0.9: the retreating NPC takes a different path next time (avoidance field persists for 120s on that specific node)

The player witnesses these standoffs by simply being in the area. No scripting required — the verb fields and hostility state produce the encounters naturally.

### 9.3 Territory Pressure Visualization (Optional Polish)

Floor minimap could show faction "pressure" — heatmap of which faction's NPCs occupy which nodes. As hostility rises, the pressure zones contract and harden. The player reads faction territory from the map the same way they read patrol routes in Act 1.

---

## 10. Implementation Phases

### Phase 0 — Spatial Node Registry (1h)

**Goal**: Floors have named spatial nodes that can be queried.

| Task | File | Est. |
|------|------|------|
| Create `engine/verb-nodes.js` (Layer 1, IIFE) with `register(floorId, nodes)` and `getNodes(floorId)` | NEW | 30m |
| Register nodes for Floor 0 (2 nodes), Floor 1 (8–10 nodes), Floor 1.1 (4 nodes) | `engine/verb-nodes.js` | 20m |
| Wire `<script>` tag in `index.html` at Layer 1 | `index.html` | 5m |
| Test: `VerbNodes.getNodes('1')` returns correct array | — | 5m |

**Deliverable**: `VerbNodes.getNodes(floorId)` returns spatial nodes. No NPC behavior change yet.

### Phase 1 — Verb-Field Tick (2–3h)

**Goal**: NPCs with `verbSet` move via field gradients instead of bounce patrol.

| Task | File | Est. |
|------|------|------|
| Add `_tickVerbField(npc, dt, grid, nodes)` to `npc-system.js` | `engine/npc-system.js` | 1h |
| Add `_stepToward(npc, tx, ty, grid)` helper (extract from `_tickPatrol` greedy-step logic) | `engine/npc-system.js` | 20m |
| In `tick()`, branch: if `npc.verbSet` → `_tickVerbField`, else → `_tickPatrol` | `engine/npc-system.js` | 10m |
| Define 3 archetype presets (`scholar`, `citizen`, `worker`) as verb-set templates | `engine/npc-system.js` | 20m |
| Convert 2–3 existing Floor 1 NPCs from `patrolPoints` to `verbSet` (Tide Scholar, citizen, Foundry Rep) | `engine/npc-system.js` | 30m |
| Tune DISTANCE_WEIGHT, NOISE_FACTOR, SATISFACTION_DROP, LINGER range | — | 30m |

**Deliverable**: 2–3 NPCs on Floor 1 visibly orbit between bonfire, shops, and their post. Other NPCs unchanged.

### Phase 2 — Encounter Detection (1.5–2h)

**Goal**: Two verb-field NPCs at the same node trigger a classified encounter.

| Task | File | Est. |
|------|------|------|
| Extend `_tickDialoguePingPong()` to detect verb encounters (both lingering, same/adjacent node) | `engine/npc-system.js` | 45m |
| Implement encounter classification matrix (§7.2) | `engine/npc-system.js` | 30m |
| Add encounter cooldown map (pair ID → last fire timestamp, 180s minimum) | `engine/npc-system.js` | 15m |
| Wire encounter bark fire: build pool key from node type + encounter type, fire via BarkLibrary | `engine/npc-system.js` | 20m |

**Deliverable**: Two NPCs at the bonfire face each other and exchange a bark. The bark content varies by verb match and faction match.

### Phase 3 — Encounter Bark Content (1.5–2h)

**Goal**: Rich, world-building bark pools for all encounter types.

| Task | File | Est. |
|------|------|------|
| Write `encounter.bonfire.*` pools (camaraderie × 4, tension × 4, gossip × 4) | `data/barks/en.js` | 30m |
| Write `encounter.well.*` pools (gossip × 4, passing × 3) | `data/barks/en.js` | 20m |
| Write `encounter.shop_entrance.*` pools (passing × 4, errands × 3) | `data/barks/en.js` | 20m |
| Write `encounter.faction_post.*` pools (camaraderie × 3, territorial × 3) | `data/barks/en.js` | 20m |
| Write `bark.transition.*` solo transition barks (duty↔social, social↔errands, etc.) × 3 each | `data/barks/en.js` | 20m |
| Wire transition barks: 20% chance on verb switch, use existing proximity check | `engine/npc-system.js` | 15m |

**Deliverable**: NPCs bark at each other with context-appropriate dialogue. Solo NPCs occasionally mutter about where they're heading.

### Phase 4 — Full Floor Population (2–3h)

**Goal**: All exterior floors populated with verb-field NPCs alongside existing bounce-patrol NPCs.

| Task | File | Est. |
|------|------|------|
| Register spatial nodes for Floor 0 (approach — 2 nodes), Floor 2 (Lantern Row — 10 nodes) | `engine/verb-nodes.js` | 30m |
| Define 6 archetype presets (§5.3 full table: scholar, worker, citizen, drunk, guard, granny) | `engine/npc-system.js` | 20m |
| Convert Floor 1 population: ~5 verb-field NPCs (faction + citizens), keep lamplighter on bounce patrol | `engine/npc-system.js` | 30m |
| Add Floor 2 population: ~8 verb-field NPCs (heavier Foundry presence per NPC_FACTION_BOOK_AUDIT §2.3) | `engine/npc-system.js` | 45m |
| Register interior verb nodes for 1.1 (Bazaar), 1.2 (Inn), 1.3 (Guild) | `engine/verb-nodes.js` | 20m |
| Convert 1–2 interior NPCs per building to verb-field (innkeeper, guild clerk, bazaar merchant) | `engine/npc-system.js` | 30m |

**Deliverable**: Floors 0–2 and their interiors feel alive. NPCs orbit their world organically. Faction presence is spatially visible.

---

### Optional Polish — Phase 5+ (Post-Core)

#### Phase 5 — Act 2 Faction Escalation (2–3h)

| Task | File | Est. |
|------|------|------|
| Add `FactionState.hostility` object with per-pair hostility values | `engine/faction-state.js` (NEW or extend `engine/shop.js`) | 30m |
| Wire hostility changes to faction mission completion (ACT2_NARRATIVE_OUTLINE §4.1) | `engine/game.js` | 30m |
| Implement territorial encounter escalation (§9.2): retreat behavior on high hostility | `engine/npc-system.js` | 45m |
| Implement avoidance field: when hostility > 0.8, hostile-faction-occupied nodes get negative score | `engine/npc-system.js` | 30m |
| Add Floor 3 (Frontier Gate) spatial nodes with `contested: true` tags | `engine/verb-nodes.js` | 20m |
| Write territorial bark pools for all 3 faction pairs (× 4 lines each) | `data/barks/en.js` | 30m |

#### Phase 6 — Rest Verb & Day/Night (1.5h)

| Task | File | Est. |
|------|------|------|
| Add `rest` verb to archetype presets (decays faster at night) | `engine/npc-system.js` | 15m |
| Time-of-day modifier: `rest.decayRate *= (isNight ? 2.5 : 1.0)` | `engine/npc-system.js` | 15m |
| NPCs with high rest need path toward `rest_spot` nodes (inn, home, porch) | Already handled by verb-field tick | — |
| At night, citizen NPCs effectively "go home" — rest verb dominates | — | Tuning only |
| Morning: rest need resets low, duty/errands reassert — NPCs emerge from rest spots | — | Tuning only |

#### Phase 7 — Spatial Audio Integration (1h)

| Task | File | Est. |
|------|------|------|
| Encounter barks use `SpatialDir.resolve()` (DOC-32b) for directional audio pan | `engine/npc-system.js` | 30m |
| Transition barks (solo NPC muttering) respect spatial volume falloff | `engine/npc-system.js` | 15m |
| Encounter bark text rendered with directional indicator if NPC is off-screen (DOC-32b DirRing) | `engine/npc-system.js` | 15m |

#### Phase 8 — Territory Pressure Minimap (2h)

| Task | File | Est. |
|------|------|------|
| Track per-node faction occupancy (which faction NPC is currently at each node) | `engine/verb-nodes.js` | 30m |
| Render faction pressure as tinted overlay on minimap cells near occupied nodes | `engine/minimap.js` | 1h |
| Pressure intensity scales with `FactionState.hostility` — neutral = faint, hostile = vivid | `engine/minimap.js` | 30m |

#### Phase 9 — Hero NPC Verb Disruption (1.5h)

| Task | File | Est. |
|------|------|------|
| When Hero NPC roves through a floor (Phase D, DOC-9 §8), verb-field NPCs react | `engine/npc-system.js` | 30m |
| All civilian verb-field NPCs gain temporary `flee` verb with very high decay, satisfier = any node far from hero | `engine/npc-system.js` | 30m |
| Faction guard NPCs gain temporary `confront` verb pulling toward hero (they try to intercept) | `engine/npc-system.js` | 15m |
| After hero passes, temporary verbs decay to zero and normal orbits resume | Automatic via verb-field | — |
| Panic barks: `bark.hero_panic.*` — citizens fleeing, guards rallying | `data/barks/en.js` | 15m |

#### Phase 10 — Reanimated Friendly Enemies (1h)

| Task | File | Est. |
|------|------|------|
| When an enemy is defeated and reanimated as friendly, assign it a verb-set based on its original entity type | `engine/npc-system.js` | 30m |
| Reanimated enemies get duty verb keyed to their spawn zone, social verb for nearest bonfire | `engine/npc-system.js` | 15m |
| Reanimated entities use faction `null` — encounter classification falls to "gossip" with all NPCs | `engine/npc-system.js` | 10m |
| Reanimated-specific barks: confused, disoriented, slowly assimilating | `data/barks/en.js` | 15m |

---

## 11. Module & File Map

### New Files

| File | Layer | Role | Phase |
|------|-------|------|-------|
| `engine/verb-nodes.js` | 1 | Spatial node registry per floor | 0 |
| `engine/faction-state.js` | 2 | Faction hostility tracking (Act 2) | 5 |

### Modified Files

| File | Changes | Phase |
|------|---------|-------|
| `engine/npc-system.js` | `_tickVerbField()`, encounter detection, encounter classification, transition barks | 1–4 |
| `data/barks/en.js` | Encounter pools, transition pools, territorial pools, panic pools | 3–9 |
| `index.html` | `<script>` tags for new Layer 1/2 modules | 0, 5 |
| `engine/minimap.js` | Faction pressure overlay (optional) | 8 |

### Untouched

| File | Why |
|------|-----|
| `engine/bark-library.js` | Encounter barks use existing `register()`/`fire()` API — no changes needed |
| `engine/npc-composer.js` | Verb-field NPCs render identically — no visual changes |
| `engine/enemy-ai.js` | Enemy awareness system is orthogonal to NPC verb-fields |
| `engine/spatial-dir.js` | Consumed as-is for directional bark audio (Phase 7) |

---

## 12. Cross-References

| Section | Links To | Relationship |
|---------|----------|-------------|
| §4 Spatial Nodes | → NPC_CANON (EyesOnly) Part 3 Pathing Archetypes | Furniture nodes as verb-field precursor |
| §5 Verb Schema | → NPC_SYSTEM_ROADMAP §4.2 NPC Entity Fields | `verbSet` extends entity schema |
| §6 Tick Resolution | → `engine/npc-system.js` `_tickPatrol()` | Reuses greedy-step movement |
| §7 Encounters | → NPC_FACTION_BOOK_AUDIT §3.3 Choreographed Encounters | Verb encounters replace authored pairs |
| §8 Bark Pools | → `data/barks/en.js`, BarkLibrary (DOC-9 §3) | New pool keys extend existing convention |
| §9 Act 2 | → ACT2_NARRATIVE_OUTLINE §4 Faction Choice | Hostility state drives encounter escalation |
| §7 Spatial Audio | → SPATIAL_AUDIO_BARK_ROADMAP (DOC-32b) | SpatialDir.resolve() for directional barks |
| §9 Hero Disruption | → NPC_SYSTEM_ROADMAP §8 Hero NPCs | Hero rove triggers temporary verb injection |
| §13 Tile Catalog | → `engine/tiles.js` (IDs 0-39), INTERACTIVE_OBJECTS_AUDIT | Maps tile IDs to verb-node types, identifies 5 new tiles needed |
| §13 Textures | → Sprite commissioning pipeline | 6 new textures: well_stone, bench_wood, bench_cushion, notice_board_wood, anvil_iron, barrel_wood |
| §14 Cross-Floor | → `engine/floor-manager.js` parentId/childId helpers | Floor adjacency graph built from existing hierarchy |
| §14 Shadow Presence | → `engine/npc-system.js` `_npcs[]` | NpcRegistry extends per-floor NPC lists with cross-floor presence |
| §15 Reanimated | → `engine/corpse-actions.js` `_buildWanderPath()` | Replaces patrol assignment with verb-field assignment |
| §15 Dungeon Nodes | → `engine/verb-nodes.js` `register()` | Auto-generates verb nodes from dungeon tile grid at reanimation time |
| §15 Discord Context | → `docs/discord_reply_davidyork.md` | Justification: reanimated creatures watching = core emotional payoff |
| §16 Building Catalog | → `engine/floor-manager.js` GridGen, biome definitions | New interior floors (0.1, 0.2, 2.8-2.10, 3.3-3.5) with retrofuturistic biomes |
| §16 Tech Gradient | → Biome Plan (DOC-4), VISUAL_OVERHAUL (DOC-8) | Architectural era progression from ruins → heritage → commercial → industrial → city |
| §16 Construct Journey | → §14 (cross-floor) + §15 (reanimated verbs) | End-to-end narrative: Ironhold dungeon → Frontier Gate → Clockmaster's Workshop |
| §16 New Tiles | → §13 (tile catalog) | CHARGING_CRADLE (45), SWITCHBOARD (46) extend the verb-node tile vocabulary |
| §16 Floor 4 | → ACT2_NARRATIVE_OUTLINE (DOC-74) | City district buildings feed Act 2 faction geography |
| §17 Eat Verb | → §5 (Verb Schema) | Fifth verb: eat. Decays toward food nodes. Meal rushes emerge from synchronized decay. |
| §17 Congregation | → §4 (Spatial Nodes), §13 (Tile Catalog) | Overlapping node clusters create visible crowds without spawn logic |
| §17 Cots/Apartments | → `engine/floor-manager.js` grid data | COT (48), SOUP_KITCHEN (49) tiles. Apartment interiors as minimal floors. |
| §17 Supply Runs | → §14 (Cross-Floor), §16.3 (courier archetype) | Cargo state on NPCs. Visible goods transport between buildings. |
| §17 Shift Rotation | → §7 (Encounter Detection) | Two NPCs swapping at same duty node = shift-change encounter. |
| §18 Tiers | → §15 (Reanimated Verbs), `engine/corpse-actions.js` | T1 wander / T2 dialogue / T3 dispatch. Branches in `_assignReanimatedBehavior()`. |
| §18 Dialogue Trees | → StatusBar dialogue system, `engine/game.js` | T2 reanimation opens dialogue tree. Player choices → verb-set + destination. |
| §18 Cage Pipeline | → `engine/shop.js`, day-advance system | T3 dispatch → cage → processed → shop inventory restock. 1-day cycle. |
| §18 Tracker | → NEW `engine/reanimation-tracker.js` (Layer 2) | Persistent creature state: tier, floor, cage status, day reanimated. |
| Sundog Theorem | → `sundog/` repo, `Brainstorm/agent_leisure_architecture.md` | Theoretical basis for field-gradient movement |

---

## 13. Verb-Node Tile Catalog — Tiles & Textures Needed

Every verb-node type needs a corresponding tile that NPCs can orbit around. Some map directly to existing tile IDs; others need new tiles or creative reuse. This section catalogs what exists, what's missing, and what textures/sprites need commissioning per floor depth.

### 13.1 Existing Tile → Verb-Node Mapping

| Verb-Node Type | Tile ID | Tile Name | Depth Coverage | Notes |
|----------------|---------|-----------|----------------|-------|
| `bonfire` | 18 | BONFIRE | Ext ✅ Int ✗ Dun ✗ | Step-fill cavity rendering, fire sprite. Primary social anchor. |
| `bonfire` (interior) | 29 | HEARTH | Ext ✗ Int ✅ Dun ✅ | Floor-to-ceiling chimney in home (2.5×), standard in dungeon. Same verb, different tile. |
| `shop_entrance` | 12 | SHOP | Ext ✅ Int ✅ Dun ✗ | Vendor tile. NPCs face and linger. |
| `work_station` | 26 | BAR_COUNTER | Ext ✗ Int ✅ Dun ✗ | Counter-height opaque. Inn bar, bazaar counters. |
| `work_station` (forge) | — | — | — | No FORGE tile exists. Currently implied by NPC position + HEARTH adjacency. **Needs new tile or reuse HEARTH as dual-purpose.** |
| `rest_spot` | 27 | BED | Ext ✗ Int ✅ Dun ✗ | Half-height opaque. Home and inn. BedPeek overlay. |
| `rest_spot` (exterior) | — | — | Ext ✗ | No exterior rest furniture exists. **Needs new tile: BENCH or PORCH_CHAIR.** |
| `bulletin_board` | 36 | TERMINAL | Ext ✗ Int ✅ Dun ✅ | Half-wall desk + CRT. Serves as "information kiosk" — close enough to a notice board indoors. |
| `bulletin_board` (exterior) | 37 | MAILBOX | Ext ✅ Int ✗ Dun ✗ | Short stone base + emoji billboard. Can double as outdoor notice point. |
| `bench` | 28 | TABLE | Ext ✗ Int ✅ Dun ✗ | Half-height opaque. Interior social + rest dual-verb. |
| `well` | — | — | — | **No WELL tile exists.** Needs new tile ID. |
| `bench` (exterior) | — | — | Ext ✗ | **No exterior BENCH tile exists.** Needs new tile ID. |

### 13.2 New Tiles Needed

| New Tile | Proposed ID | Depth | Walkable | Opaque | Height | Texture Needed | Purpose |
|----------|-------------|-------|----------|--------|--------|----------------|---------|
| WELL | 40 | Ext | ✗ | ✓ | 0.5× | `well_stone` — circular stone rim, dark center | Social verb satisfier. Secondary gathering node outdoors. |
| BENCH | 41 | Ext + Int | ✗ | ✓ | 0.35× | `bench_wood` (ext), `bench_cushion` (int) | Social + rest dual-verb. Low profile, player sees over. |
| NOTICE_BOARD | 42 | Ext | ✗ | ✓ | 1.2× | `notice_board_wood` — posts with pinned parchment | Errands verb satisfier. Exterior equivalent of TERMINAL. |
| ANVIL | 43 | Int + Dun | ✗ | ✓ | 0.5× | `anvil_iron` — dark iron block on stone base | Duty/work_station for Foundry NPCs. Forge companion. |
| BARREL | 44 | All | ✗ | ✓ | 0.6× | `barrel_wood` — banded oak barrel | Generic work_station / errands prop. Cellar, bazaar, dungeon. |

### 13.3 Verb-Node Coverage by Floor

The goal is every floor with verb-field NPCs has at least one node of each primary verb type (social, errands, duty, rest). Floors without NPCs (pure dungeon combat floors) don't need verb nodes but may get `rest_spot` nodes for reanimated creatures.

#### Depth 1 — Exteriors

| Floor | ID | Biome | Social Nodes | Errands Nodes | Duty Nodes | Rest Nodes | Status |
|-------|----|-------|-------------|---------------|------------|------------|--------|
| The Approach | 0 | exterior | BONFIRE(18) ×1 | — | — | rest_spot ×1 | Sparse — tutorial. Drifter orbits campfire→facade. |
| The Promenade | 1 | promenade | BONFIRE ×1, WELL* ×1, BENCH* ×2 | SHOP(12) ×3, NOTICE_BOARD* ×1 | faction_post ×3, work_station ×1 | rest_spot ×1, BENCH* ×1 | **Primary verb-field floor.** 13 nodes registered. Needs WELL, BENCH, NOTICE_BOARD tiles. |
| Lantern Row | 2 | lantern | BONFIRE ×1, WELL* ×1, BENCH* ×2 | SHOP ×4, NOTICE_BOARD* ×1 | faction_post ×2, work_station ×2 | rest_spot ×2, BENCH* ×1 | Heavier Foundry presence. ~13 nodes planned. |
| The Garrison | 3 | frontier | BONFIRE ×1, BENCH* ×1 | SHOP ×1 | faction_post ×2, work_station ×1 | rest_spot ×1 | Act 2 contested zone. `contested: true` on bonfire + bench. |

\* = requires new tile

#### Depth 2 — Interiors

| Floor | ID | Biome | Social Nodes | Errands Nodes | Duty Nodes | Rest Nodes | Notes |
|-------|----|-------|-------------|---------------|------------|------------|-------|
| Coral Bazaar | 1.1 | bazaar | — | SHOP ×1, TERMINAL(36) ×1 | BAR_COUNTER(26) ×2 | — | Commercial space. NPCs browse + work counters. |
| Driftwood Inn | 1.2 | inn | HEARTH(29) ×1, TABLE(28) ×1 | TERMINAL ×1 | BAR_COUNTER ×1 | BED(27) ×1 | Social hub interior. Hearth = bonfire equivalent. |
| Cellar Entrance | 1.3 | cellar_entry | — | — | — | — | Transitional. No NPCs planned. Stairs to 1.3.1. |
| Gleaner's Home | 1.6 | home | — | — | — | BED ×1 | Player-only space. No verb NPCs. |
| Dispatcher's Office | 2.1 | office | — | TERMINAL ×1 | work_station ×1 | — | Mission hub. Dispatcher on patrol, clerk on verb-field. |
| Watchman's Post | 2.2 | watchpost | — | — | faction_post ×1 | rest_spot ×1 | Guard station. Admiralty guards linger here. |
| Armorer's Workshop | 2.3 | shop | — | — | ANVIL* ×1, BAR_COUNTER ×1 | — | Foundry-faction interior. Anvil as duty node. |
| Chandler's Shop | 2.4 | shop | — | SHOP ×1 | BAR_COUNTER ×1 | — | Tide-faction. Simple 2-node interior. |
| Apothecary | 2.5 | shop | — | SHOP ×1, BOOKSHELF(25) ×1 | BAR_COUNTER ×1 | — | Bookshelf doubles as errands satisfier (browsing). |
| Cartographer | 2.6 | shop | — | TERMINAL ×1 | BAR_COUNTER ×1 | — | Admiralty-faction. Terminal = charts/maps. |
| Tea House | 2.7 | shop | TABLE ×2, HEARTH ×1 | — | BAR_COUNTER ×1 | BENCH* ×1 | Social interior. Multiple tables create gathering. |

\* = requires new tile

#### Depth 3+ — Dungeons

Dungeons are combat floors. Verb-field NPCs don't spawn here natively, but **reanimated creatures** do. Reanimated creatures need a subset of verb nodes — primarily rest_spot and social — placed at existing world objects.

| Floor Pattern | Biome | Available Tiles for Verb Nodes | Reanimation Nodes |
|---------------|-------|-------------------------------|-------------------|
| 1.1.N (Coral Cellars) | cellar | BONFIRE ×0-1, HEARTH ×0-1, BREAKABLE ×many, CHEST ×few | BONFIRE/HEARTH → social, BARREL* → errands, any walkable corner → rest_spot |
| 1.3.N (Soft Cellar) | cellar | BONFIRE ×1 (tutorial checkpoint), BREAKABLE ×many | BONFIRE → social, BREAKABLE adjacency → duty (guard the crate) |
| 2.2.1–2 (Deepwatch) | catacomb | TORCH_LIT ×several, BOOKSHELF ×0-1, CORPSE ×several | TORCH → social (warm themselves), BOOKSHELF → errands, open alcove → rest_spot |
| 3.1.N (Ironhold) | foundry | HEARTH ×1-2, ANVIL* ×1-2, BARREL* ×several | HEARTH → social, ANVIL → duty (smith ghost), BARREL → errands |

\* = requires new tile

### 13.4 Texture Commissioning Summary

| Texture Key | Tile(s) | Biomes | Priority | Description |
|-------------|---------|--------|----------|-------------|
| `well_stone` | WELL (40) | exterior, promenade, lantern | **High** — needed for Promenade verb nodes | Circular stone rim, dark water center. Emoji sprite optional (💧). |
| `bench_wood` | BENCH (41) | exterior, promenade, lantern, frontier | **High** — dual social/rest verb | Simple wooden bench, plank seat on two posts. |
| `bench_cushion` | BENCH (41) | inn, tea house | Medium | Cushioned interior bench variant. |
| `notice_board_wood` | NOTICE_BOARD (42) | exterior, promenade, lantern | **High** — exterior errands anchor | Two posts, crossbar, pinned parchment sheets. |
| `anvil_iron` | ANVIL (43) | shop (foundry), foundry dungeon | Medium | Dark iron anvil on stone base. |
| `barrel_wood` | BARREL (44) | all biomes | Low | Banded oak barrel. Common dungeon dressing. |

### 13.5 Reuse Strategy — Minimizing New Art

Where possible, existing tiles double as verb nodes by context:

- **BOOKSHELF (25)** → errands satisfier (NPC browses shelves)
- **MAILBOX (37)** → bulletin_board equivalent outdoors (NPC checks mail)
- **TERMINAL (36)** → bulletin_board indoors (NPC reads dispatches)
- **TABLE (28)** → bench equivalent indoors (NPC sits, dual social/rest)
- **HEARTH (29)** → bonfire equivalent indoors (NPC warms up, social)
- **TORCH_LIT (30)** → social satisfier in dungeons (reanimated creatures gather at light)

This reduces the new tile count from potentially 8-10 down to 5 (WELL, BENCH, NOTICE_BOARD, ANVIL, BARREL).

---

## 14. Cross-Floor NPC Traversal

### 14.1 The Problem

Currently, NPCs exist only on the floor where they spawn. When the player leaves a floor, NPCs on that floor freeze. When the player returns, they resume from exactly where they were. No NPC ever moves between floors.

This works for most NPCs — the innkeeper stays in the inn, the guard stays at their post. But for the verb-field system to feel alive, certain NPCs should be able to drift between connected floors to satisfy their verbs. The Tide Scholar's errands verb pulls them toward the Bazaar (Floor 1.1), but the Bazaar is on a different floor from the Promenade (Floor 1). Without cross-floor traversal, the scholar's errands pull dead-ends at the Bazaar door tile and the NPC just stands there facing a door.

### 14.2 Design Constraints

1. **Only the player's current floor is ticked.** Off-screen floors don't run `_tickVerbField`. Cross-floor NPCs must be simulated cheaply or deferred.
2. **Floor transitions currently require a full grid swap.** `FloorManager.loadFloor()` tears down the current grid and builds a new one. NPCs are part of the floor data.
3. **NPC entity state is per-floor.** `_npcs[]` in npc-system.js is rebuilt on each floor load from the floor's NPC definitions.
4. **Memory and complexity budget is tiny.** This is a jam game. Cross-floor NPC movement must be simple or it won't ship.

### 14.3 Proposed Architecture — "Shadow Presence" Model

Rather than physically moving NPCs between floor grids in real-time, we use a **shadow presence** system: NPCs have a `homeFloor` and can register a `presence` on a different floor. When the player enters a floor, the NPC population is assembled from both the floor's native NPCs and any shadow presences registered for that floor.

```
NpcRegistry = {
  // NPC definitions indexed by NPC id
  npcs: {
    'tide_scholar': {
      homeFloor: '1',
      currentFloor: '1.1',    // May differ from homeFloor
      verbSet: { ... },
      x: 4, y: 6,            // Position on currentFloor
      _verbSet: { ... }       // Live verb state (needs, timers)
    }
  },

  // Quick lookup: which NPCs are present on a given floor?
  floorPresence: {
    '1':   ['admiralty_officer', 'lamplighter', 'market_vendor'],
    '1.1': ['tide_scholar', 'bazaar_clerk'],
    '1.2': ['innkeeper', 'foundry_rep']
  }
}
```

#### Transition Trigger

When a verb-field NPC's best-scoring node is on an **adjacent connected floor** (parent, child, or sibling), and the NPC is within 2 tiles of the connecting door/stairs tile, the NPC **queues a floor transition**:

```
npc._queuedTransition = {
  targetFloor: '1.1',
  doorTile: { x: 10, y: 10 },   // The DOOR tile on current floor
  entryTile: { x: 2, y: 8 }     // The DOOR_EXIT tile on target floor
}
```

#### Resolution

- **If the player is on the NPC's current floor**: The NPC walks to the door tile, plays a brief "exit" bark (20% chance: "Off to the bazaar..."), then is removed from the current floor's entity list and registered as a shadow presence on the target floor.
- **If the player is NOT on the NPC's current floor**: The transition happens instantly during the off-screen simulation tick (see §14.4). The NPC simply moves to the target floor's entry tile.
- **When the player arrives on the target floor**: The shadow presence is materialized as a full NPC entity at the entry tile position (or at whatever verb-node they've drifted to during off-screen simulation).

#### Floor Adjacency Graph

Built from existing `FloorManager` parent/child/sibling helpers:

```
Adjacency: {
  '0':   ['1'],                    // Approach → Promenade
  '1':   ['0', '2', '1.1', '1.2', '1.3', '1.6'],
  '1.1': ['1', '1.1.1'],          // Bazaar → Promenade, Coral Cellars
  '1.2': ['1'],                    // Inn → Promenade
  '2':   ['1', '3', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
  '3':   ['2', '3.1', '3.2'],
  // etc.
}
```

NPCs can only traverse one adjacency edge at a time. A Promenade NPC can reach Floor 1.1 (Bazaar) in one transition, but reaching Floor 1.1.1 (Coral Cellars) would require two transitions — and NPC traversal into dungeon floors (depth 3+) is **blocked by default** for non-reanimated NPCs. Civilians don't wander into dungeons.

### 14.4 Off-Screen Simulation

When the player is on a different floor, cross-floor NPCs need minimal simulation to maintain verb state. Full `_tickVerbField` is too expensive for off-screen floors. Instead, a lightweight **verb decay tick** runs for all registered NPCs regardless of floor:

```
function _tickOffScreenVerbs(dt):
  for each npc in NpcRegistry.npcs:
    if npc.currentFloor === playerFloor: continue  // ticked normally
    for each verb in npc._verbSet:
      verb.need = min(1.0, verb.need + verb.decayRate * dt)

    // If any verb exceeds 0.9 and a better floor exists, queue transition
    if _shouldTransition(npc):
      _queueTransition(npc, _bestAdjacentFloor(npc))
```

This is O(N) where N is total cross-floor NPCs (expected: 5-10 NPCs max). No pathfinding, no grid queries — just verb decay arithmetic and occasional transition checks. Runs once per second, not at 10fps.

### 14.5 Which NPCs Traverse?

Not all verb-field NPCs should cross floors. Most NPCs are **floor-locked** — they have everything they need on their home floor. Cross-floor traversal is reserved for NPCs whose verb needs genuinely span multiple floors:

| NPC | Home Floor | Traversal Target | Verb That Pulls | Justification |
|-----|-----------|-------------------|-----------------|---------------|
| Tide Scholar | 1 (Promenade) | 1.1 (Bazaar) | errands | Scholar browses the bookshelf, then returns to post. |
| Foundry Rep | 1 (Promenade) | 2.3 (Armorer) | duty | Rep checks in at the Foundry-faction workshop. |
| Admiralty Officer | 1 (Promenade) | 2.2 (Watchpost) | duty | Officer rotates to the garrison watchpost. |
| Innkeeper | 1.2 (Inn) | 1 (Promenade) | social | Steps outside to the bonfire on slow evenings. Rest verb pulls them back. |
| Tea House Host | 2.7 (Tea House) | 2 (Lantern Row) | social | Socializes at the Lantern Row well, returns for duty. |

**Cross-floor flag**: Add `crossFloor: true` to NPC definitions that should traverse. Default is `false` — the vast majority of NPCs stay put.

### 14.6 Door Tile Awareness

For NPCs to path toward doors, door tiles need to be registered as **transit nodes** in verb-nodes.js — a new node type that doesn't satisfy any verb but serves as a waypoint for cross-floor movement:

```javascript
// Transit nodes — doors that connect to other floors
{ id: 'bazaar_door',   type: 'transit', x: 10, y: 10, targetFloor: '1.1' },
{ id: 'inn_door',      type: 'transit', x: 20, y: 12, targetFloor: '1.2' }
```

Transit nodes are only scored when the NPC's best verb-satisfying node is on the target floor. The scoring formula becomes:

```
transitScore = bestRemoteNodePull / (distToDoor * DISTANCE_WEIGHT + TRANSIT_PENALTY)
```

`TRANSIT_PENALTY` (e.g. 0.3) makes cross-floor movement slightly costly — NPCs prefer satisfying verbs on their current floor unless the remote pull is strong.

### 14.7 Implementation Estimate

| Task | File | Est. | Phase |
|------|------|------|-------|
| Create NpcRegistry object (NPC defs, floorPresence map) | `engine/npc-registry.js` (NEW, Layer 2) | 1h | 11 (new) |
| Build floor adjacency graph from FloorManager data | `engine/npc-registry.js` | 30m | 11 |
| Add `crossFloor: true` flag to 4-5 NPC definitions | `engine/npc-system.js` | 15m | 11 |
| Register transit nodes for all inter-floor doors | `engine/verb-nodes.js` | 30m | 11 |
| Implement transit node scoring in `_tickVerbField` | `engine/npc-system.js` | 30m | 11 |
| Implement shadow presence materialization on floor load | `engine/npc-system.js` + `engine/floor-manager.js` | 1h | 11 |
| Add `_tickOffScreenVerbs(dt)` lightweight simulation | `engine/npc-registry.js` | 30m | 11 |
| Exit/arrival barks for floor transitions | `data/barks/en.js` | 20m | 11 |
| Test: Scholar visits bazaar, returns to Promenade | — | 30m | 11 |

**Total**: ~5h — this is a **Phase 11** task, post-core, post-polish. Cross-floor traversal is impressive but not essential for the jam. The verb-field system works on single floors first.

---

## 15. Reanimated Creature Verb Integration

### 15.1 Context — Why Reanimated Creatures Need Verb Fields

This section is directly motivated by the design insight from the davidyork Discord discussion: in Dungeon Gleaner, the player personally reanimates fallen enemies. A skeleton that was hostile 30 seconds ago is now on the player's team. If it just stands there or bounces between two waypoints, it feels dead in a different way — the reanimation feels hollow.

The verb-field system solves this. A reanimated skeleton should pick up a crate, walk to a forge, warm itself at a bonfire — start living a little dungeon life. The richer this behavior is while the creature is friendly, the more emotional weight it carries when the player faces these same creatures again in Act 2.

For most crawlers, this level of NPC sophistication isn't justified — davidyork is right about that. But the reanimation mechanic makes it the core emotional payoff of the entire game.

### 15.2 Current State — corpse-actions.js

`CorpseActions._buildWanderPath(originX, originY)` currently:

1. Scans the floor grid for BREAKABLE, BONFIRE, and CHEST tiles within 12 Manhattan distance
2. Sorts by distance, picks up to 4 closest
3. Builds a linear patrol path: `[origin, waypoint1, waypoint2, ...]`
4. Assigns it via `_assignWanderPath(entity, fx, fy)` as a bounce patrol

This produces passable wandering, but the creature visits each waypoint in order, ping-pongs back, and repeats forever. It's the exact "Horizon GDC loop" that becomes visible when the player is watching closely — and the player *is* watching closely because they just brought this creature back from the dead.

### 15.3 Upgrade Path — Patrol → Verb-Field

Replace `_assignWanderPath`'s patrol assignment with a verb-field assignment for reanimated creatures. The creature gets a dynamically generated `verbSet` based on what's around it.

#### Step 1: Scan for verb-satisfiable tiles (replaces `_buildWanderPath`)

```javascript
function _buildReanimatedVerbSet(originX, originY, floorId) {
  var nodes = VerbNodes.getNodes(floorId);
  var nearbyNodes = [];

  for (var i = 0; i < nodes.length; i++) {
    var dist = Math.abs(nodes[i].x - originX) + Math.abs(nodes[i].y - originY);
    if (dist <= 16) nearbyNodes.push(nodes[i]);  // Wider radius than patrol (16 vs 12)
  }

  // Build verb set from what's actually nearby
  var verbSet = {};
  var hasTypes = {};
  for (var j = 0; j < nearbyNodes.length; j++) {
    hasTypes[nearbyNodes[j].type] = true;
  }

  // Every reanimated creature wants rest (it just died)
  verbSet.rest = { need: 0.7, decayRate: 0.0015,
                   satisfiers: ['rest_spot', 'bench', 'bonfire'] };

  // Social if there's a gathering point nearby
  if (hasTypes.bonfire || hasTypes.well || hasTypes.bench) {
    verbSet.social = { need: 0.5, decayRate: 0.0012,
                       satisfiers: ['bonfire', 'well', 'bench'] };
  }

  // Errands if there's something to browse
  if (hasTypes.shop_entrance || hasTypes.bulletin_board) {
    verbSet.errands = { need: 0.3, decayRate: 0.0006,
                        satisfiers: ['shop_entrance', 'bulletin_board'] };
  }

  // Duty only if work stations exist (the creature "helps out")
  if (hasTypes.work_station) {
    verbSet.duty = { need: 0.2, decayRate: 0.0008,
                     satisfiers: ['work_station'] };
  }

  return Object.keys(verbSet).length > 0 ? verbSet : null;
}
```

#### Step 2: Assign verb-field instead of patrol

```javascript
function _assignReanimatedBehavior(entity, originX, originY) {
  var floorId = FloorManager.getCurrentFloorId();
  var verbSet = _buildReanimatedVerbSet(originX, originY, floorId);

  if (verbSet) {
    // Verb-field mode — creature orbits nearby nodes organically
    entity.verbSet = verbSet;
    entity.verbArchetype = null;      // Custom, not a preset
    entity.verbFaction = null;        // No faction — encounters classify as "gossip"
    entity.patrolPoints = undefined;  // Clear any patrol
  } else {
    // Fallback — no verb nodes nearby, use legacy patrol
    _assignWanderPath(entity, originX, originY);
  }
}
```

### 15.4 Reanimated Creature Archetypes

> **See also §18 (Reanimation Tiers)** — each enemy type is additionally classified as T1 (wander), T2 (dialogue), or T3 (dispatch), which determines whether the player gets a dialogue tree, the creature auto-dispatches cross-floor, or it simply wanders. The archetypes below define verb decay rates; the tiers define the *interaction model*.

Different enemy types should reanimate with different verb weightings, reflecting their original nature:

| Enemy Type | Rest Decay | Social Decay | Errands Decay | Duty Decay | Personality | Tier |
|-----------|-----------|-------------|---------------|-----------|-------------|------|
| Skeleton (melee) | 0.0015 | 0.0010 | 0.0004 | 0.0018 | Dutiful — gravitates to work stations, guards things | T1 |
| Skeleton Warrior | 0.0015 | 0.0010 | 0.0004 | 0.0018 | Same as melee but with dialogue — player assigns destination | T2 |
| Skeleton (archer) | 0.0015 | 0.0008 | 0.0012 | 0.0010 | Curious — browses, checks notice boards, wanders | T2 |
| Slime | 0.0025 | 0.0020 | 0.0002 | 0.0002 | Social blob — always at the bonfire, never works | T1 |
| Ghost | 0.0008 | 0.0005 | 0.0005 | 0.0002 | Restless — high rest need but slow decay. Drifts aimlessly. | T2 |
| Construct (basic) | 0.0005 | 0.0003 | 0.0008 | 0.0025 | Workhorse — dispatches to Automaton Garage | T3 |
| Construct (guardian) | 0.0005 | 0.0003 | 0.0008 | 0.0025 | Returns to Clockmaster's Workshop | T3 |
| Construct (heavy) | 0.0005 | 0.0003 | 0.0008 | 0.0025 | Dispatched to Armorer cage → processed for parts | T3 |

### 15.5 Reanimated Creature Barks

Reanimated creatures need their own bark pools that reflect their confused, newly-alive state. These evolve over time as the creature "settles in."

```
bark.reanimated.waking         — "..." / "...?" / "☠️→😐" / "Where... am I."
bark.reanimated.social         — "This fire... warm." / "Others here." / "Not alone."
bark.reanimated.duty           — "Must... do something." / "Carry. Stack. Good."
bark.reanimated.rest           — "Tired again. Just woke up." / "Bones ache."
bark.reanimated.settled        — "This is... okay." / "Almost like before."
                                  (fires after 180s of verb-field life, one-shot)
```

The `settled` bark is a one-shot that fires once per reanimated creature after they've been alive for ~3 minutes. It's the emotional beat — the creature has found its rhythm in its new afterlife.

### 15.6 Encounter Classification — Reanimated × NPC

Reanimated creatures have `verbFaction: null`. When they encounter a faction NPC, the classification falls through to **gossip** (§7.2). This is intentional — the town NPCs don't quite know what to make of the reanimated creature. Special encounter pools:

```
encounter.reanimated.gossip    — "Is that thing... friendly now?"
                                 "The gleaner brought it back. Don't stare."
                                 "It seems harmless. Mostly."

encounter.reanimated.bonfire   — "You're... sitting at our bonfire."
                                 "..."  [skeleton stares at the fire]
                                 "I suppose there's room."
```

In Act 2, when the player must fight reanimated creatures again, these peaceful encounters become memories. The richer the "afterlife" behavior was, the more the betrayal stings.

### 15.7 Dungeon Floor Verb Nodes for Reanimated Creatures

Dungeon floors (depth 3+) don't have hand-authored verb nodes because they're primarily combat spaces. But when the player reanimates a creature on a dungeon floor, the creature needs *something* to orbit. Solution: **auto-generate verb nodes from the dungeon tile grid** at reanimation time.

```javascript
function _generateDungeonVerbNodes(floorId) {
  var fd = FloorManager.getFloorData();
  if (!fd || !fd.grid) return;

  var grid = fd.grid;
  var W = fd.gridW, H = fd.gridH;
  var generated = [];
  var counter = 0;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var t = grid[y][x];
      var nodeType = null;

      if (t === TILES.BONFIRE || t === TILES.HEARTH) nodeType = 'bonfire';
      else if (t === TILES.TORCH_LIT)                nodeType = 'bonfire';  // Warm light = social
      else if (t === TILES.BOOKSHELF)                nodeType = 'bulletin_board';
      else if (t === TILES.CHEST)                    nodeType = 'shop_entrance';
      else if (t === TILES.BAR_COUNTER)              nodeType = 'work_station';
      else if (t === TILES.BED)                      nodeType = 'rest_spot';

      if (nodeType) {
        generated.push({
          id: 'dun_' + floorId + '_' + (counter++),
          type: nodeType,
          x: x,
          y: y
        });
      }
    }
  }

  if (generated.length > 0) {
    VerbNodes.register(floorId, generated);
  }
}
```

This runs once when the first creature is reanimated on a dungeon floor. Subsequent reanimations on the same floor reuse the already-registered nodes.

### 15.8 Integration with Morrowind-Style Rest Cycle

The Discord reply described wanting the "Morrowind NPCs go to bed at night" behavior without authoring individual schedules. The verb-field system handles this naturally for reanimated creatures too:

- Reanimated creatures start with `rest.need: 0.7` (they just died — they're tired)
- After warming at a bonfire and doing a few errands, the rest need climbs back up
- If a `rest_spot` or `BED` node is nearby, they drift toward it
- At night (when the day/night cycle modifier kicks in via Phase 6), `rest.decayRate` increases — all creatures drift toward rest nodes
- In the morning, rest need is satisfied, and social/duty verbs reassert

No authored schedule. No state machine. Just competing gradients — exactly the sundog diffusion model.

### 15.9 Implementation Estimate

| Task | File | Est. | Phase |
|------|------|------|-------|
| Add `_buildReanimatedVerbSet()` | `engine/corpse-actions.js` | 30m | 10 |
| Replace `_assignWanderPath` call with `_assignReanimatedBehavior` | `engine/corpse-actions.js` | 15m | 10 |
| Add enemy-type → verb-weight mapping table | `engine/corpse-actions.js` | 20m | 10 |
| Add `_generateDungeonVerbNodes(floorId)` for depth 3+ floors | `engine/verb-nodes.js` | 30m | 10 |
| Write reanimated bark pools (waking, social, duty, rest, settled) | `data/barks/en.js` | 20m | 10 |
| Write reanimated encounter pools (gossip, bonfire) | `data/barks/en.js` | 15m | 10 |
| Test: reanimate skeleton on Floor 1, watch it orbit bonfire→bench→rest | — | 20m | 10 |
| Test: reanimate on dungeon floor, verify auto-generated verb nodes | — | 15m | 10 |

**Total**: ~3h — aligns with existing Phase 10 in the roadmap, but with the verb-set generation replacing the simpler "assign duty + social" approach originally sketched.

---

## 16. Retrofuturistic Building & Archetype Expansion

### 16.1 The Aesthetic Gradient

The game's floor progression tells a story through architecture. The player walks from overgrown ruins into a heritage district, through a commercial strip, past a militarized frontier, and eventually into a full retrofuturistic city. Each floor's building vocabulary should reflect where it sits on this gradient:

| Floor | District | Architectural Era | Tech Visibility | Building Vocabulary |
|-------|----------|-------------------|-----------------|---------------------|
| 0 | The Approach | Post-collapse | Hidden — overgrown infrastructure | Derelict shack, abandoned house, offramp debris |
| 1 | The Promenade | Heritage/old town | Subtle — gas lamps, mechanical mailbox, pneumatic tubes behind marble | Bazaar, inn, home, storm shelter |
| 2 | Lantern Row | Commercial/transitional | Emerging — terminals, signal wires, visible machinery | Shops, offices, workshops, first construct sightings |
| 3 | Frontier Gate | Industrial/military | Exposed — forges, construct bays, iron and steam | Armory, garrison, clockworks, automaton repair |
| 4 | The City (TODO) | Full retrofuturistic | Dominant — neon signage, pneumatic transit, construct workers | Factories, broadcast tower, central exchange, the Clockmaster's |

The key insight: **buildings aren't just verb-node containers — they're the visual storytelling of the tech gradient.** A player who reanimates a construct in the Ironhold Depths (3.1.N) and watches it path up through the Frontier Gate to the Clockmaster's Workshop is *also* watching a creature travel backward through the tech gradient, from exposed industrial machinery to the refined workshop where it was originally built.

### 16.2 New Building Catalog

#### Floor 0 — The Approach (2 deferred facades)

The NE shack and SW house on Floor 0 are currently solid wall blocks with deferred interiors. These should be the player's first hints that civilization existed here before the collapse:

| Building | Facade Slot | Biome | Verb Nodes | NPC Population | Purpose |
|----------|------------|-------|------------|----------------|---------|
| **Vagrant's Shack** | NE (rows 6-9, cols 27-30) | `shack` | rest_spot ×1, bonfire ×1 (oil drum fire) | 0-1 ambient (drifter) | Atmospheric only. Drifter NPC warms at the barrel fire, occasionally mutters. Establishes that people live rough out here. |
| **Relay Station** | SW (rows 25-28, cols 7-10) | `relay` | work_station ×1 (switchboard), bulletin_board ×1 (dispatch board) | 0-1 ambient (radio operator) | Derelict comms relay. Still partially functional — the signal board flickers. Foreshadows the TERMINAL tile's role in later floors. First hint of the city's tech infrastructure. |

These are small (12×10 or similar) interiors with 2-3 verb nodes each. They don't need full shop UIs — just atmosphere and verb-node coverage for any reanimated creature that wanders back to Floor 0.

#### Floor 2 — Lantern Row (procedurally generated, new buildings injected via GridGen)

Floor 2 already has 7 interiors (2.1–2.7), but most are single-room shops. The retrofuturistic gradient calls for buildings where technology is visibly part of daily life:

| Building | Proposed ID | Biome | Verb Nodes | NPC Population | Purpose |
|----------|------------|-------|------------|----------------|---------|
| **Signal Office** | 2.8 | `signal` | work_station ×2 (telegraph desks), bulletin_board ×1 (message board) | 1 interactive (telegraph operator), 1 ambient (courier) | Pneumatic tube terminal + telegraph office. The city's nervous system. Courier NPC has cross-floor traversal to deliver messages (§14). Duty verb = operating the switchboard. Errands verb = checking the public message board outside. |
| **Gazette Pressroom** | 2.9 | `pressroom` | work_station ×1 (printing press), bulletin_board ×1 (proofs rack), bench ×1 (reading area) | 1 ambient (typesetter) | Where the town broadsheet is printed. BOOKSHELF tiles hold back-issues. The notice boards on exterior floors are populated by content from here — a narrative link. |
| **Construct Bay** | 2.10 | `construct_bay` | work_station ×2 (repair bench, charging cradle), rest_spot ×1 (powered-down alcove) | 0 native NPCs — **destination for reanimated constructs** | The first explicitly mechanical building. Contains a CHARGING_CRADLE tile (new, see §16.4) where constructs "rest." This is a mid-tier destination — reanimated constructs from the Deepwatch dungeon (2.2.N) path here to settle. |

#### Floor 3 — Frontier Gate (new buildings)

Floor 3 is currently minimal (Armory + Quartermaster). The Foundry faction dominates here, and the architecture should reflect heavy industry:

| Building | Proposed ID | Biome | Verb Nodes | NPC Population | Purpose |
|----------|------------|-------|------------|----------------|---------|
| **Clockmaster's Workshop** | 3.3 | `clockworks` | work_station ×3 (mainspring bench, gear lathe, calibration table), rest_spot ×1 (stool), bulletin_board ×1 (schematic board) | 1 interactive (the Clockmaster), 1 ambient (apprentice) | **The signature retrofuturistic interior.** This is where constructs were originally built. When a reanimated construct from Ironhold Depths (3.1.N) paths up through Floor 3 and enters the Clockmaster's, it's coming home. The Clockmaster reacts differently to reanimated constructs — special encounter bark: "Ah... unit seven. I thought we lost you." |
| **Smelter** | 3.4 | `smelter` | work_station ×2 (crucible, mold bench), bonfire ×1 (furnace — HEARTH tile at 3×), barrel ×2 | 1 ambient (smelter worker) | Foundry heavy industry. The furnace is a massive HEARTH tile that doubles as a social bonfire — workers and visitors gather near the warmth. Raw materials from Ironhold come up through here. |
| **Automaton Garage** | 3.5 | `garage` | work_station ×2 (tool rack, hydraulic lift), rest_spot ×2 (powered-down bays), charging_cradle ×1 | 0 native NPCs — **primary destination for Ironhold reanimated constructs** | The construct equivalent of a barracks. Multiple rest bays where powered-down constructs "sleep." Reanimated constructs with high rest verb are pulled here. If the Clockmaster's is the emotional destination, the Garage is the practical one. |

#### Floor 4 — The City (TODO, future scope)

Floor 4 doesn't exist yet, but the building vocabulary should be established now so the tech gradient is coherent when it's built:

| Building | Proposed ID | Biome | Verb Nodes | Architectural Role |
|----------|------------|-------|------------|-------------------|
| **Central Exchange** | 4.1 | `exchange` | work_station ×4, bulletin_board ×2, bench ×3 | The city's commercial heart. Ticker boards, pneumatic message tubes. Replaces the bazaar's hand-trade with mechanized commerce. |
| **Broadcast Tower** | 4.2 | `tower` | work_station ×2, rest_spot ×1 | Signal Office grown up. Radio mast on the roof (visible from Floor 3's skyline). The city's voice. |
| **Construct Foundry** | 4.3 | `foundry_hq` | work_station ×6, charging_cradle ×4, rest_spot ×2 | Where constructs are mass-produced. The Clockmaster's Workshop is artisanal; this is industrial. Act 2 faction tension between Clockmaster (hand-built, individual constructs) and Foundry HQ (mass-production, expendable units). |
| **Transit Hub** | 4.4 | `transit` | transit ×4 (connections to Floors 1-3), bench ×4, bulletin_board ×2 | Cross-floor traversal nexus. NPCs from all floors can path through the Transit Hub to reach distant floors. This is the §14 architecture's endgame — a physical hub that makes cross-floor movement feel spatial. |

### 16.3 Retrofuturistic NPC Archetypes

New building types demand new NPC archetypes that feel at home in them:

| Archetype | duty | social | errands | rest | Home Building | Character |
|-----------|------|--------|---------|------|---------------|-----------|
| `telegraph_op` | 0.0022 | 0.0006 | 0.0010 | 0.0008 | Signal Office | Chained to the desk. Occasionally checks the public board. Rarely socializes — loner. |
| `courier` | 0.0010 | 0.0015 | 0.0020 | 0.0005 | Signal Office (home) → everywhere | **Cross-floor.** High errands decay drives them across floors delivering messages. Social along the way. Low rest — always moving. |
| `typesetter` | 0.0025 | 0.0010 | 0.0005 | 0.0008 | Gazette Pressroom | Anchored to the printing press. Occasionally reads their own output at the notice board. |
| `clockmaster` | 0.0018 | 0.0012 | 0.0008 | 0.0010 | Clockmaster's Workshop | Balanced between work and socializing. Visits the Smelter for materials (errands→work_station on adjacent floor). Reacts to reanimated constructs with special barks. |
| `apprentice` | 0.0020 | 0.0018 | 0.0010 | 0.0006 | Clockmaster's Workshop | Like the clockmaster but more social. Drifts to the exterior bonfire more often. Young, curious. |
| `smelter_hand` | 0.0028 | 0.0008 | 0.0004 | 0.0012 | Smelter | Heavy worker archetype. Almost never leaves. Rests near the furnace (it's warm). |
| `mechanic` | 0.0022 | 0.0005 | 0.0012 | 0.0008 | Automaton Garage | Quiet, task-focused. Checks on constructs (duty at charging cradles), occasionally fetches parts (errands→Clockmaster's). |

### 16.4 New Tiles for Retrofuturistic Buildings

The §13 tile catalog identified 5 new tiles (WELL through BARREL). The retrofuturistic expansion adds 2 more:

| New Tile | Proposed ID | Depth | Walkable | Opaque | Height | Texture | Purpose |
|----------|-------------|-------|----------|--------|--------|---------|---------|
| CHARGING_CRADLE | 45 | Int + Dun | ✗ | ✓ | 0.8× | `charging_cradle` — metal frame with conduit cables, dim status light | **rest_spot for constructs only.** Organic creatures can't use it. When a construct NPC rests here, a subtle electric hum plays (spatial audio). Verb-node type: `charging_cradle`. |
| SWITCHBOARD | 46 | Int | ✗ | ✓ | 1.0× | `switchboard_panel` — vertical panel with toggle switches, patch cables, indicator lights | **work_station for signal-type buildings.** The telegraph_op's primary duty node. F-interact shows a peek overlay with dispatches (same pattern as TERMINAL but warmer aesthetic — brass + amber lights vs. green CRT). |

These are optional — the buildings can ship with TERMINAL and BED reused for these roles, and the dedicated tiles can come later as polish. But having distinct tiles makes the retrofuturistic buildings feel *mechanically different* from the heritage district.

### 16.5 The Construct Reanimation Journey

This is the narrative payoff that justifies §14 (cross-floor traversal), §15 (reanimated creature verbs), and §16 (retrofuturistic buildings) all existing in the same game. Here's the sequence:

#### Act 1: The Awakening

1. **Player enters Ironhold Depths (3.1.N)** — deep dungeon under the Frontier Gate. Foundry biome: iron walls, molten glow, constructs as enemies.

2. **Player defeats a construct.** CORPSE tile appears. The construct was a mechanical guardian — pistons, gears, a flickering optical sensor.

3. **Player reanimates the construct.** `CorpseActions.seal()` triggers. The construct rises. `_assignReanimatedBehavior()` runs:
   - Scans the dungeon floor for verb nodes (auto-generated from tile grid, §15.7)
   - Finds: 1 HEARTH (furnace), 2 TORCH_LIT (warm light), 1 CHEST
   - Assigns verb-set: `rest: 0.7 (high — just died), duty: 0.25, social: 0.5`
   - Construct archetype decay rates: very high duty, low social → it gravitates to the furnace and stands guard

4. **Construct begins dungeon afterlife.** It wanders between the furnace and torches. The player watches it for a moment. It barks: `"..." → "...systems... resuming."` The player moves on.

#### Act 1.5: The Migration (requires §14 cross-floor)

5. **Construct's duty verb saturates** — it's been at the furnace for a while. But there are no work_station nodes in the dungeon. Its errands verb is rising. The only errands-satisfiable nodes are up on Floor 3 (Frontier Gate exterior) — the NOTICE_BOARD, the SHOP tiles.

6. **Construct paths to the STAIRS_UP tile.** `_queuedTransition` fires. The construct exits the dungeon. If the player is watching: exit bark: `"Ascending... primary function unclear."` If the player is elsewhere: happens silently via off-screen simulation.

7. **Construct materializes on Floor 3.** Shadow presence → full entity. It emerges from the Armory entrance (3.1) onto the Frontier Gate exterior. It's now surrounded by verb nodes: bonfire, notice board, faction posts.

8. **Construct orbits Floor 3 briefly.** Social verb pulls it to the bonfire. It sits near the fire with Foundry NPCs. Encounter bark: `"Is that... one of the deep units?" / "..." / "Guess it works for the gleaner now."`

#### Act 1.75: Coming Home

9. **Construct's duty verb climbs.** Its archetype has 0.0025 duty decay — the strongest pull. On Floor 3, the highest-scoring duty node is inside the **Clockmaster's Workshop (3.3)** — a work_station node tagged as construct-compatible.

10. **Construct paths to the Workshop door (transit node).** Enters Floor 3.3. Materializes inside.

11. **The Clockmaster reacts.** Special one-shot encounter bark:
    ```
    encounter.clockmaster.construct_return
    — "Unit seven. I built you three seasons ago."
    — "..."  [construct stands at the calibration table]
    — "The gleaner brought you back. I suppose I should thank them."
    — "...Thank."
    ```

12. **Construct settles.** Its duty verb is now regularly satisfied by the calibration table work_station. Its rest verb pulls it to the CHARGING_CRADLE at night. It has a *home*. The player can visit the Clockmaster's Workshop and see their construct working alongside the apprentice. The verb-field system gives it a visible daily rhythm without any authored schedule.

#### Act 2: The Betrayal

13. **Faction hostility rises.** The player completes faction missions. The Foundry wants its constructs back — including the reanimated ones.

14. **Floor 3 becomes contested.** The Clockmaster's Workshop is caught between Foundry expansion and the player's allegiance. The construct that found a home there is now a point of tension.

15. **The player faces the construct again** in a Foundry raid or faction mission. The creature that barked "...Thank." at the Clockmaster is now hostile. The verb-field afterlife made the player *know* this creature. Now they have to fight it.

This is why the NPC sophistication matters. This is the davidyork answer made spatial and mechanical.

### 16.6 Implementation Phases

The retrofuturistic expansion is a post-core effort that layers onto the existing phase structure:

| Phase | Task | Est. | Depends On |
|-------|------|------|------------|
| **12a** | Author Floor 0 deferred interiors (Vagrant's Shack, Relay Station) — grid, biome, verb nodes | 2h | Phase 4 (floor population) |
| **12b** | Author Floor 2 new interiors (Signal Office, Gazette, Construct Bay) — grid, biome, verb nodes | 3h | Phase 4 + GridGen injection |
| **12c** | Author Floor 3 new interiors (Clockmaster's, Smelter, Automaton Garage) — grid, biome, verb nodes | 4h | Floor 3 blockout |
| **12d** | Add new NPC archetypes (telegraph_op, courier, typesetter, clockmaster, apprentice, smelter_hand, mechanic) | 1.5h | Phase 1 (verb-field tick) |
| **12e** | Add CHARGING_CRADLE + SWITCHBOARD tiles to tiles.js, floor-manager biome entries, texture-atlas | 1.5h | §13 tile work |
| **12f** | Implement construct-specific verb routing: CHARGING_CRADLE as rest_spot for construct archetype only | 30m | Phase 10 (reanimated verbs) |
| **12g** | Write Clockmaster special encounter barks (construct_return pool, one-shot recognition) | 30m | Phase 3 (bark content) |
| **12h** | End-to-end test: reanimate construct in 3.1.N → watch migration to 3.3 → verify Clockmaster reaction | 1h | Phase 11 (cross-floor) + 12a-g |

**Total**: ~14h across all sub-phases. This is deep post-jam work — it requires Floor 3 to be blockout-complete and the cross-floor system to be functional. But the design can be locked now so that every earlier phase (tile catalog, verb nodes, cross-floor architecture) is built with this journey in mind.

### 16.7 Facade Reuse for Building Fronts

The exterior floor grids use WALL tiles at 3.5× height to create multi-story building facades. Each building entrance is a DOOR tile (type 2) with a `doorTarget` pointing to the interior floor. Adding new buildings to Floors 2 and 3 requires:

1. **For procedural floors (Floor 2)**: Modify the GridGen contract to inject additional building pods with DOOR tiles. Each pod is a cluster of WALL tiles (facade) with one DOOR tile and surrounding decorative tiles (PILLAR for columns, FENCE for railings, MAILBOX for signage).

2. **For hand-authored floors (Floor 3)**: Expand the grid data in floor-manager.js to include new facade clusters. The existing 50×36 grid has room — Floor 3 is currently sparse with only the Armory and Quartermaster.

3. **Facade textures**: Each new building can reuse existing biome wall textures (brick_light for Floor 2, stone_cathedral for Floor 3) with distinctive door textures to differentiate entrances. The door texture is the "signage" — a brass-fitted door for the Clockmaster's, a heavy iron door for the Smelter, a rolling shutter for the Automaton Garage.

No new exterior rendering is needed — the raycaster already handles 3.5× tall walls with door textures. The retrofuturistic feel comes from the *interior* biomes (new textures, new tiles, new NPCs), not from the exterior facades.

---

## 17. Living Infrastructure — Eat, Sleep, Congregate

### 17.1 The Fantasy Castle Problem

Every RPG has a garrison that supports hundreds of NPCs with no visible food supply, no kitchen, no mess hall, no latrines. The player is told "this is a bustling town" but sees NPCs standing at their posts forever. The verb-field system already produces organic movement — this section extends it to the *material needs* that make a settlement feel self-sustaining.

The tone is **calloused normalcy**. Nobody comments on the food. Nobody thanks the cook. The soup kitchen is just where you eat. The cots are just where you sleep. These are ancient systems grinding along — people are shuffled through them like parts through a machine. The Dispatcher doesn't introduce themselves because why would they? You'll be reassigned tomorrow. The system is older than anyone's memory and nobody questions it.

### 17.2 The Eat Verb

Add `eat` as a fifth verb alongside duty, social, errands, rest.

```javascript
eat: { need: 0.0, decayRate: 0.0010, satisfiers: ['mess_hall', 'soup_kitchen', 'bar_counter', 'bonfire'] }
```

**Behavior**: Eat need decays upward like all verbs. When it passes ~0.6, the NPC starts drifting toward the nearest food node. On arrival, they linger (eating animation = standing still facing the counter, same as any other linger). Eat need drops. They leave.

**What makes it feel alive**: Multiple NPCs with similar eat decay rates converge on the same food node at roughly the same time — a **meal rush** emerges from the math. The player walks past the soup kitchen at midday and sees four NPCs clustered there. An hour later it's empty. Nobody scheduled this. The field interference pattern created it.

**Food nodes by floor depth**:

| Depth | Food Node Type | Tile | Examples |
|-------|---------------|------|---------|
| Ext (N) | `soup_kitchen` | New: SOUP_KITCHEN (47) or reuse BAR_COUNTER | Outdoor stall, cauldron on a cart. Floor 1 promenade, Floor 2 lantern row. |
| Int (N.N) | `mess_hall` | TABLE (28) + BAR_COUNTER (26) cluster | Inn dining area (1.2), Tea House tables (2.7). |
| Int (N.N) | `bar_counter` | BAR_COUNTER (26) | Already exists. Inn bar, bazaar counters. |
| Dun (N.N.N) | `bonfire` | BONFIRE (18) / HEARTH (29) | Campfire cooking — reanimated creatures "eat" at fires (they warm themselves, same animation). |

### 17.3 Congregation Spaces

Congregation spaces are locations where multiple verb-node types overlap spatially, creating natural gathering points where NPCs on different errands end up in the same area.

**Design principle**: Place a social node, an eat node, and a rest node within 3-4 tiles of each other. The field interference pulls NPCs from different verb motivations into the same physical cluster. The player sees a *crowd* — some eating, some chatting, some just sitting — without any crowd-spawning logic.

**Congregation templates**:

| Template | Nodes | Tiles | Floor Placement |
|----------|-------|-------|----------------|
| **Town Square** | bonfire + well + bench ×2 + soup_kitchen | BONFIRE + WELL + BENCH ×2 + BAR_COUNTER | Floor 1 center, Floor 2 center |
| **Mess Hall** | bar_counter ×2 + table ×3 + hearth | BAR_COUNTER ×2 + TABLE ×3 + HEARTH | Inn (1.2), Tea House (2.7) |
| **Barracks Common** | bench ×2 + cot ×3 + bonfire | BENCH ×2 + COT ×3 + BONFIRE | Watchpost (2.2), Garrison (3) |
| **Work Break Area** | bench + barrel + bonfire | BENCH + BARREL + BONFIRE/HEARTH | Smelter (3.4), Armorer (2.3) |
| **Dungeon Camp** | bonfire + rest_spot ×2 | BONFIRE + walkable alcoves | Any dungeon floor — reanimated creatures form camps |

### 17.4 Apartments, Bunks & Cots

NPCs need somewhere to *be from*. Not every NPC has a named home like the Gleaner. Most just have a bunk assignment — a cot in a shared space, a pallet in a back room.

**Exterior cots**: New tile COT (48), walkable-adjacent, 0.3× height (low pallet on the ground). Placed along building facades on exterior floors — the town's overflow housing. Workers who can't afford inn rooms sleep outside. The player sees occupied cots at night, empty cots during the day. Pure verb-field behavior: rest verb pulls NPCs to cots at night, duty/social pulls them away at dawn.

**Interior bunks**: BED tile (27) already exists. Place 2-4 BEDs in the back rooms of larger interiors:
- Watchpost (2.2): guard bunks in the west armory room
- Dispatcher's Office (2.1): gleaner dormitory in a back room
- Smelter (3.4): worker pallets near the furnace (warm)
- Automaton Garage (3.5): charging cradles double as construct bunks

**Apartment blocks** (Floor 2+ exteriors): Building facades with DOOR tiles that lead to small apartment interiors (8×8 grid, 2 BEDs, 1 TABLE, 1 HEARTH). These are where citizen-archetype NPCs "live." The NPC's rest verb pulls them home at night. The player never needs to enter these apartments — they just see NPCs enter and exit the facade doors. The apartment interior exists as a floor (e.g. 2.11, 2.12) but is architecturally minimal.

| New Tile | Proposed ID | Walkable | Opaque | Height | Texture | Purpose |
|----------|-------------|----------|--------|--------|---------|---------|
| COT | 48 | ✗ | ✓ | 0.3× | `cot_canvas` — rolled bedding on a low wooden frame | Exterior/barracks rest node. Cheap sleep. |
| SOUP_KITCHEN | 49 | ✗ | ✓ | 0.7× | `soup_cauldron` — iron pot on a brazier stand, steam emoji sprite | Exterior eat node. Communal feeding station. |

### 17.5 Shift Rotation via Verb Saturation

Guard shifts, kitchen shifts, and work shifts emerge naturally from verb-field mechanics without authored schedules:

**The pattern**: Two NPCs share the same `faction_post` duty node. Guard A has been at the post all night — their rest need is 0.9, their duty need is low (just satisfied). Guard B slept at a cot — their duty need is 0.85, rest is low. As dawn arrives, Guard B's duty pull toward the post is strong. Guard A's rest pull toward the cot is strong. They naturally swap.

**Encounter at shift change**: When the arriving guard and departing guard are both within 2 tiles of the duty node, an encounter triggers:

```
encounter.shift_change.passing
— "Anything?"
— "Quiet."
— [departing guard walks toward rest node]
```

No schedule. No clock check. Just two competing gradients crossing at a spatial node. The player sees guard rotation happening and doesn't think about it — it just looks like a real checkpoint.

**Kitchen variant**: The innkeeper (duty = bar_counter) and a cook NPC (duty = hearth) have staggered eat decays. When the innkeeper's eat need spikes, they step away from the counter — the cook is already at the hearth so coverage continues. When the cook's eat need spikes, the innkeeper is back. Visible "someone's always at the counter" behavior from overlapping verb cycles.

### 17.6 Supply Runs — Visible Economy

The courier archetype (§16.3) already has cross-floor traversal. Extend this to a **supply run** pattern where certain NPCs physically carry goods between buildings:

**Cargo state**: NPCs can carry a `cargo` tag — a simple string like `'provisions'`, `'dispatches'`, `'parts'`. When an NPC with cargo arrives at their target node, the cargo is "delivered" (tag clears, optional bark: "Delivery for the Clockmaster."). The target building's inventory or state can update.

**Supply chain examples**:

| Supplier | Cargo | Route | Consumer | Frequency |
|----------|-------|-------|----------|-----------|
| Bazaar merchant | `provisions` | 1.1 → 1 → 1.2 | Inn kitchen (HEARTH node) | When innkeeper's errands verb fires toward bazaar |
| Smelter hand | `ingots` | 3.4 → 3 → 3.3 | Clockmaster's workbench | When clockmaster's errands verb fires toward smelter |
| Courier | `dispatches` | 2.8 → 2 → 2.1 | Dispatcher's terminal | Cross-floor, driven by courier's errands decay |
| Foundry procurement | `salvage` | dungeon → 3 → 3.4 | Smelter crucible | Post-reanimation, driven by §18 dispatch tier |

The player never needs to interact with any of this. They just see NPCs walking between buildings carrying things. The town *works*.

### 17.7 Implementation Estimate

| Task | File | Est. | Phase |
|------|------|------|-------|
| Add `eat` verb to all archetype presets with appropriate decay rates | `engine/npc-system.js` | 20m | 13 (new) |
| Add COT (48) and SOUP_KITCHEN (49) tiles to tiles.js + biome entries | `engine/tiles.js`, `engine/floor-manager.js` | 30m | 13 |
| Place soup kitchen nodes on Floor 1 + Floor 2 exteriors | `engine/verb-nodes.js` | 15m | 13 |
| Place cot clusters along building facades on Floor 1 + Floor 2 grid data | `engine/floor-manager.js` | 30m | 13 |
| Place congregation-template node clusters (town square, mess hall) | `engine/verb-nodes.js` | 30m | 13 |
| Add shift-change encounter detection (two NPCs swapping at same duty node) | `engine/npc-system.js` | 30m | 13 |
| Write shift-change bark pools | `data/barks/en.js` | 15m | 13 |
| Add cargo state to NPC entity, clear on arrival at target node | `engine/npc-system.js` | 20m | 13 |
| Write supply-run barks (delivery, pickup) | `data/barks/en.js` | 15m | 13 |
| Author 2-3 minimal apartment interiors (8×8 grid, BED + TABLE + HEARTH) | `engine/floor-manager.js` | 1h | 13 |
| Test: observe meal rush at soup kitchen, shift change at guard post | — | 30m | 13 |

**Total**: ~5h. Can be split — eat verb + congregation spaces first (~2h), then cots/apartments (~1.5h), then supply runs (~1.5h).

---

## 18. Reanimation Tiers — Dialogue, Wander, Dispatch

### 18.1 Not All Reanimations Are Equal

The §15 design treats all reanimated creatures the same: scan for nearby verb nodes, assign a verb-set, let them orbit. But the user's relationship with different reanimated creatures varies enormously. A reanimated slime is ambient furniture. A reanimated construct might be a quest-critical asset. A reanimated skeleton archer might have something to *say*.

Reanimation should have **three tiers** based on the creature type, dungeon context, and player investment:

| Tier | Name | Player Interaction | Verb Behavior | Examples |
|------|------|--------------------|---------------|---------|
| **T1** | **Wander** | None — creature just gets up | Warm-and-orbit: rests at bonfire, drifts around nearby nodes | Slimes, basic skeletons, bats, rats. The ambient tier. |
| **T2** | **Dialogue** | Player gets a dialogue tree on reanimation | Verb-set assigned based on dialogue choices | Skeleton warriors, ghosts, named enemies. The narrative tier. |
| **T3** | **Dispatch** | Creature has a pre-assigned destination verb on another floor | Immediately paths toward cross-floor target | Constructs, faction-aligned creatures, quest creatures. The economy tier. |

### 18.2 Tier 1 — Wander (Default)

This is the existing §15 behavior. The creature rises, barks `"..."`, scans for nearby verb nodes, and begins orbiting. No player input. The creature is ambient — it populates the dungeon or floor with a warm body that makes the space feel less empty.

**Verb assignment**: `_buildReanimatedVerbSet()` as designed in §15.3. Rest-heavy, social if bonfire exists, no duty unless work stations are present.

**Bark set**: Minimal. `bark.reanimated.waking` on rise, occasional `bark.reanimated.social` at bonfire. The creature is not interesting enough to warrant extended dialogue. It's just... there. Calloused normalcy — nobody remarks on it.

**Population cap**: Limit to 4-6 T1 reanimated creatures per floor to prevent clutter. Oldest T1 creature despawns (fades, bark: `"...fading."`) when the cap is exceeded.

### 18.3 Tier 2 — Dialogue

On reanimation, the game pauses and a dialogue tree opens. The creature has something to say — a fragment of memory, a request, a warning. The player's choices in the dialogue determine the creature's verb-set and destination.

**Trigger**: Enemy definition includes `reanimationTier: 2` and a `reanimationDialogue` key pointing to a dialogue tree.

**Dialogue structure** (reuses existing StatusBar dialogue system):

```
[Skeleton Archer rises. It looks at you.]

"...I remember this place."

  > "What do you remember?"
    → "The foundry. I was... a smith. Before."
      > "Go back to the Smelter. They could use the help."
        → [assigns duty verb for Smelter work_station, cross-floor to 3.4]
        → bark: "...back to work."
      > "Stay here. Keep watch."
        → [assigns duty verb for nearest bonfire, stays on current floor]
        → bark: "...watching."
  > "Just get up. You work for me now."
    → [T1 wander behavior, no special verbs]
    → bark: "..."
  > [Leave it alone]
    → [creature stays as CORPSE tile, no reanimation]
```

**What this achieves**: The player *instructs* the creature. It's not a cutscene — it's a command. The janitor is the boss, and reanimated creatures are labor. The dialogue is curt, transactional. Nobody's bonding. But the player's choice shapes what the creature does for the rest of its afterlife, and that choice has material consequences (a skeleton sent to the Smelter contributes to the supply chain; one told to keep watch is just a guard).

**Verb assignment**: Based on dialogue branch taken. Each terminal dialogue node specifies:

```javascript
{
  verbOverride: {
    duty: { need: 0.9, decayRate: 0.0020, satisfiers: ['work_station'] },
    rest: { need: 0.3, decayRate: 0.0010, satisfiers: ['rest_spot', 'bonfire'] }
  },
  targetFloor: '3.4',        // optional — cross-floor dispatch
  arrivalBark: 'reanimated.arrival.smelter'
}
```

### 18.4 Tier 3 — Dispatch

The creature rises, gets a brief non-interactive bark, and immediately begins pathing toward a pre-assigned destination on another floor. No dialogue. No player choice. The creature *knows where it's going* — its original programming, instinct, or muscle memory kicks in.

**Trigger**: Enemy definition includes `reanimationTier: 3` and `dispatchTarget`:

```javascript
{
  type: 'construct_guardian',
  reanimationTier: 3,
  dispatchTarget: {
    floorId: '3.3',           // Clockmaster's Workshop
    nodeId: 'clockmaster_bench',
    arrivalBark: 'reanimated.construct.return'
  }
}
```

**Behavior on reanimation**:
1. Creature rises. Brief bark: `"...systems resuming. Returning to station."`
2. `_assignReanimatedBehavior()` detects `dispatchTarget`, sets verb-set with overwhelming duty pull toward the target floor's node
3. Creature paths to nearest STAIRS_UP / DOOR_EXIT immediately
4. Cross-floor traversal (§14) carries it to the target floor
5. On arrival at destination node, one-shot bark fires. Creature settles into regular verb-field orbit on that floor.

**The economy connection**: T3 creatures are the supply chain. A reanimated construct dispatched to the Clockmaster's Workshop doesn't just *live* there — it becomes part of the workshop's output. The Clockmaster's shop inventory updates the next day with construct-derived parts. The player has implicitly supplied the workshop by clearing the dungeon.

**Factional shop cages**: When a T3 creature's `dispatchTarget` points to a factional shop, the creature is placed in a `cage` state on arrival rather than entering normal verb-field orbit:

```javascript
dispatchTarget: {
  floorId: '2.3',            // Armorer's Workshop
  nodeId: 'armorer_cage',
  caged: true,               // Holds creature at node for 1 game-day
  inventoryRestock: ['construct_plating', 'servo_bundle', 'optic_lens'],
  arrivalBark: 'reanimated.caged.construct'
}
```

- **Day 0**: Player reanimates construct in dungeon. Construct dispatches to Armorer.
- **Day 0 (later)**: Player visits Armorer. Sees the construct standing in a cage-marked area (FENCE tiles forming a holding pen, construct faces outward). Talk to Armorer NPC: `"Got a fresh unit from the depths. Should have parts ready by morning."` The tone is workmanlike — this is Tuesday for the Armorer.
- **Day 1**: Cage is empty. Armorer's SHOP inventory has 3 new items: Construct Plating (armor card), Servo Bundle (tool card), Optic Lens (quest item). The construct is gone — disassembled. No fanfare. The system processed it.

**Where did the construct go?** Nowhere dramatic. It was disassembled for parts. The Armorer doesn't comment on it unless the player asks (bark: `"Recycled. Good steel in those old units."`). The calloused normalcy — this is just how the economy works. The player is the one who fed the machine.

### 18.5 Tier Assignment by Enemy Type

| Enemy Type | Tier | Dispatch Target | Rationale |
|-----------|------|-----------------|-----------|
| Rat, Bat, Slime | T1 (Wander) | — | Ambient. Too simple for dialogue. Warm-and-orbit. |
| Skeleton (basic) | T1 (Wander) | — | Common trash mob. Just gets up and wanders. |
| Skeleton Warrior | T2 (Dialogue) | Player's choice | Has enough identity for a dialogue tree. Player decides: guard, worker, or dismiss. |
| Skeleton Archer | T2 (Dialogue) | Player's choice | Remembers being a scout. Player can send to Signal Office or keep as lookout. |
| Ghost | T2 (Dialogue) | Player's choice | Fragment of a person. Dialogue is cryptic. Player can guide them to a rest spot (peaceful) or a duty post (restless). |
| Construct (basic) | T3 (Dispatch) | Automaton Garage (3.5) | Returns to base automatically. Functional programming overrides. |
| Construct (guardian) | T3 (Dispatch) | Clockmaster's Workshop (3.3) | Returns to its maker. Emotional beat. |
| Construct (heavy) | T3 (Dispatch) | Armorer cage → parts | Disassembled for resources. Economic loop. |
| Named/Boss enemy | T2 (Dialogue) | Unique quest target | Boss-specific dialogue tree. Reanimation unlocks quest content. |

### 18.6 Persistent Reanimation Tracker

To support the cage→inventory pipeline and cross-floor creature tracking, add a lightweight persistence layer:

```javascript
ReanimationTracker = {
  creatures: {
    'construct_7': {
      tier: 3,
      originFloor: '3.1.2',
      currentFloor: '3.3',
      state: 'settled',       // 'wandering' | 'transiting' | 'caged' | 'settled' | 'processed'
      dayReanimated: 14,
      dispatchTarget: { floorId: '3.3', nodeId: 'clockmaster_bench' }
    },
    'skeleton_archer_3': {
      tier: 2,
      originFloor: '2.2.1',
      currentFloor: '2.8',
      state: 'settled',
      dayReanimated: 12
    }
  },

  // Cage pipeline: creatures awaiting processing
  caged: {
    '2.3': {                   // Armorer's Workshop
      creatureId: 'construct_heavy_1',
      cagedOnDay: 15,
      processDay: 16,          // Next day
      restock: ['construct_plating', 'servo_bundle', 'optic_lens']
    }
  }
}
```

On day-advance (bonfire rest), the tracker processes caged creatures: clears the cage, updates shop inventory, marks creature as `'processed'`. The whole pipeline is one `_advanceDay()` check.

### 18.7 Bark Tone — Calloused Normalcy

All reanimation-related barks maintain the tone of a world that's seen too much to be surprised. Nobody is horrified by reanimated creatures. Nobody is grateful. It's just how things work here.

```
// T1 — Wander barks (minimal, flat)
bark.reanimated.t1.waking     — "." / "..." / "—"
bark.reanimated.t1.social     — [stares at fire]  / [stands near others]

// T2 — Dialogue aftermath barks (curt, functional)
bark.reanimated.t2.assigned   — "Understood." / "Going." / "...fine."
bark.reanimated.t2.working    — [works silently] / "Still here."
bark.reanimated.t2.encounter  — "Was told to be here." / "The gleaner sent me."

// T3 — Dispatch barks (programmatic, mechanical)
bark.reanimated.t3.departing  — "Returning to station." / "Primary directive: report."
bark.reanimated.t3.arriving   — "Unit reporting." / "...back."
bark.reanimated.t3.caged      — "Awaiting processing." / "..."

// NPC reactions (world-weary, unsurprised)
encounter.reanimated.routine  — "Another one from the depths."
                                "Gleaner's been busy."
                                [glances, keeps walking]
encounter.reanimated.caged    — "That one won't last. Parts by morning."
                                "Don't name them."
                                "System works. Don't question it."
encounter.armorer.processing  — "Recycled. Good steel in those old units."
                                "Three servos, an optic, and a lot of scrap."
                                "They build 'em solid down in Ironhold."
```

### 18.8 Implementation Estimate

| Task | File | Est. | Phase |
|------|------|------|-------|
| Add `reanimationTier` and `dispatchTarget` fields to enemy definitions | `engine/enemy-data.js` or floor data | 30m | 14 (new) |
| Implement T1/T2/T3 branch in `_assignReanimatedBehavior()` | `engine/corpse-actions.js` | 30m | 14 |
| T2: Wire reanimation dialogue tree to StatusBar dialogue system | `engine/corpse-actions.js` + `engine/game.js` | 1h | 14 |
| T2: Dialogue branch → verb-set + optional targetFloor assignment | `engine/corpse-actions.js` | 30m | 14 |
| T3: Immediate dispatch path — overwhelming duty pull + cross-floor queue | `engine/corpse-actions.js` + `engine/npc-system.js` | 30m | 14 |
| Cage system: FENCE-enclosed node, creature held for 1 day, processed on rest | `engine/npc-system.js` or new `engine/reanimation-tracker.js` | 1h | 14 |
| Cage→inventory pipeline: day-advance clears cage, restocks SHOP tile | `engine/reanimation-tracker.js` + `engine/shop.js` | 45m | 14 |
| Write 3-4 T2 dialogue trees (skeleton warrior, archer, ghost, named boss) | `data/dialogue/` or `data/barks/en.js` | 1h | 14 |
| Write tiered bark pools (T1 minimal, T2 curt, T3 mechanical, NPC reactions) | `data/barks/en.js` | 30m | 14 |
| Set tier assignments for all enemy types in enemy data | enemy definitions | 20m | 14 |
| Test: T1 slime wanders, T2 skeleton dialogue→dispatch, T3 construct→cage→shop | — | 45m | 14 |

**Total**: ~7h. Depends on Phase 10 (reanimated verbs), Phase 11 (cross-floor traversal), and the existing StatusBar dialogue system. The T1 tier is essentially free (it's §15 as-written). T2 adds dialogue authoring. T3 adds the cage pipeline — the meatiest new system.

---

**Document Version**: 1.3
**Created**: 2026-04-08
**Updated**: 2026-04-08 — Added §17 (Living Infrastructure), §18 (Reanimation Tiers)
**Status**: Design — Phases 0-3 implemented, Phase 4+ ready for implementation
**Philosophy**: Sundog-diffused verb fields over authored patrol routes. Encounters emerge from resonance, not scripting. The world is calloused and functional — nobody is surprised, nobody is grateful, the system just works. Augment existing `_tickPatrol` — never replace.

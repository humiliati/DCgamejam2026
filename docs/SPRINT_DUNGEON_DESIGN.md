# Sprint Dungeon Design — Hero Approach Timer & Fetch Archetype

**DOC-113**
**Created**: 2026-04-17
**Status**: Phases A + B + C **SHIPPED 2026-04-17** (recipe schema + fetch strategy + starter recipe + quest data + i18n + timer runtime in QuestChain + Game.js wiring + DebriefFeed timer row UI). **Tooling shipped 2026-04-17**: BV stamp library with 6 sprint dungeon templates (entry vestibule, T-junction, dead-end chest, trap corridor, fetch chamber, breakable shortcut), tile picker search + MRU, world designer sprint quest annotations + timer badges. Phases D–E (hero pursuit + polish) pending. See `SPRINT_TIMER_UI_HANDOFF.md` Closure Summary + `tools/_sprint-timer-cache/verify-timer.js` (84/84 green).
**Depends on**: DOC-107 (Quest System), DOC-75 (HERO_FOYER_ENCOUNTER), DOC-74 (ACT2_NARRATIVE_OUTLINE), DOC-13 (STREET_CHRONICLES_NARRATIVE_OUTLINE), DOC-31b (COBWEB_TRAP_STRATEGY_ROADMAP)
**Informs**: DOC-107 Phase 7 (Act 2 content), BLOCKOUT_VISUALIZER_ROADMAPv2 Pass 6 (procgen recipe schema), `engine/hero-system.js`, `engine/quest-chain.js`
**Audience**: Design track + quest-system track + procgen track

---

## 0. TL;DR

Sprint dungeons are a fourth dungeon archetype alongside cleaning, combat, and cobweb dungeons. The player races against a countdown timer to find a quest objective (fetch item, reach a location, read a lore object). When the timer expires, the hero materializes at the dungeon exit and blocks the escape route. The hero is not a game-over wall — they are a very hard but technically survivable combat encounter that scales by act. Acts 1–2 make fighting deeply impractical (the hero is vastly stronger, faster, and tougher than the player's available gear can handle). Act 3 dials the hero down to "hard but fair" — beatable with good cards and smart play.

This creates two distinct dungeon emotional textures: cleaning dungeons are slow and methodical (pressure-wash loops, cobweb placement, readiness scoring). Sprint dungeons are fast and anxious (maze navigation, wrong-turn penalties, escape planning).

---

## 1. Core Loop

```
ENTER DUNGEON → TIMER STARTS → NAVIGATE MAZE → FIND OBJECTIVE
                                                      │
                                          ┌───────────┴───────────┐
                                     FOUND (early)          TIMER EXPIRES
                                          │                       │
                                    RETRACE TO EXIT         HERO SPAWNS AT EXIT
                                          │                       │
                                       ESCAPE              SENTINEL PHASE
                                          │                   (grace period)
                                       SUCCESS                    │
                                                           PURSUIT PHASE
                                                           (active chase)
                                                                  │
                                                    ┌─────────────┼─────────────┐
                                               FIGHT THROUGH    SECONDARY EXIT    COBWEB SLOW
                                               (Act 3 viable)   (hidden door)     (deploy silk)
```

---

## 2. Timer Mechanic

### 2.1 Timer as quest step, not global clock

The countdown belongs to the quest step, not to `DungeonSchedule`. Sprint dungeons are side-quests — explicitly excluded from the 3-day hero rotation (see `dungeon-schedule.js`: "side-quest dungeons NOT on hero schedule"). When `QuestChain` advances to a step with `"timerMs"` in its data, it starts a per-quest countdown.

This keeps timers data-driven: one recipe gives 90 seconds, another gives 45. The recipe's `timer.budgetMs` feeds into the quest payload at floor generation time.

### 2.2 Timer contract

```
quest step data:
  kind: "fetch"
  timerMs: 60000          // countdown budget
  sentinelGraceMs: 12000  // hero stands at door before pursuing
  heroArchetype: "seeker" // which hero spawns (seeker/scholar/shadow/crusader)
  objectiveAnchor: ...    // where the fetch target is (resolved by QuestRegistry)
```

### 2.3 Timer UI

The timer is a HUD element — a countdown bar overlaid on the minimap or below the readiness gauge. Visual language:

- **Green zone** (>60% remaining): thin bar, no urgency cues
- **Yellow zone** (30–60%): bar pulses, ambient heartbeat SFX
- **Red zone** (<30%): bar throbs, screen edge vignette, accelerating heartbeat
- **Expired**: bar shatters, hero spawn SFX (heavy footfall + door slam), minimap shows hero blip

### 2.4 Timer interactions with existing systems

- **Pausing**: timer pauses during MenuBox, dialogue, floor transitions, and cinematic camera sequences (same freeze conditions as `MovementController`)
- **Hose state**: the hose breadcrumb trail is still tracked (it's how the player retraces). Kinks still penalize movement speed. Sprint dungeons have fewer cobweb chokepoints so the hose is less likely to kink — but a kinked hose during escape is devastating
- **Readiness**: sprint dungeons do NOT contribute to readiness scoring. They are side-quests with their own reward structure (gold, faction favor, unique items)

---

## 3. Hero Approach — Two-Phase Behavior

### 3.1 Phase 1: Sentinel

Timer expires. The hero spawns at the depth-3→depth-2 exit door (the STAIRS_UP or DOOR_EXIT tile). They face inward, blocking the exit. The player sees them on the minimap (hero blip appears with the archetype's glow color). The quest objective text changes from "Find [item]" to "Escape the dungeon."

The hero does not move during sentinel phase. This is the "oh no" moment — the player has `sentinelGraceMs` (default 12 seconds) to:
- Assess the situation (where am I relative to the exit?)
- Decide: fight, find secondary exit, or deploy cobweb barriers
- Start moving

### 3.2 Phase 2: Pursuit

After the sentinel grace period expires — OR when the player enters the hero's line-of-sight during sentinel phase (whichever comes first) — the hero switches to active pursuit. Ski-free yeti energy.

Pursuit behavior:
- **Pathfinding**: uses `Pathfind.findPath()` targeting the player's grid position, re-pathing every 5 ticks (500ms at 10fps game tick rate)
- **Sight**: hero always knows the player's position (no fog-of-war for the hero) in Acts 1–2. Act 3 limits sight to 8 tiles — line-of-sight breaks around corners allow the player to lose the hero temporarily
- **Movement speed**: see §4 act scaling table
- **Cobweb interaction**: heroes smash through cobwebs (already implemented in `hero-system.js`) but it costs them one full movement tick per cobweb. Deploying silk behind you buys real time
- **Combat initiation**: when the hero reaches the player's tile, combat begins automatically (CombatBridge triggers)

### 3.3 Implementation mapping to existing systems

The hero entity reuses `HeroSystem.spawnScriptedHero()` infrastructure:
- `_scriptedHero` holds the entity reference (position, archetype, visual state)
- Sentinel phase = one-node scripted path (stand at door tile)
- Pursuit phase = switch from `_scriptedPath` to a new `_pursuitTarget` mode that calls `Pathfind.findPath()` each re-path tick

New state for `hero-system.js`:
```
_pursuitMode: false
_pursuitTarget: null        // { x, y } — player grid pos
_repathTimer: 0
_sentinelTimer: 0
_sentinelTriggered: false   // LOS trigger
```

The `EnemyAI` awareness model (UNAWARE → SUSPICIOUS → ALERTED → ENGAGED) is NOT used for the hero. The hero is always ENGAGED once pursuit starts — there is no stealth mechanic against the hero (that would undermine the tension). The hero is a force of nature, not a patrolling guard.

---

## 4. Act-Based Hero Scaling

The hero is impractical to fight in Acts 1–2, not impossible. A sufficiently prepared or lucky player can theoretically survive, but the game is not balanced around that outcome. Act 3 intentionally opens the door to hero combat as a viable (hard) option.

### 4.1 Scaling table

| Stat | Act 1 | Act 2 | Act 3 |
|---|---|---|---|
| HP | 200 | 150 | 60 |
| Damage per hit | 30 | 25 | 12 |
| Move speed (tiles/sec) | 1.1× player | 1.0× player | 0.8× player |
| Pursuit sight range | ∞ | ∞ | 8 tiles |
| Cobweb smash delay | 0.5 ticks | 0.5 ticks | 1.5 ticks |
| Drops on defeat | nothing | rare card | guaranteed unique card + gold |

### 4.2 Why "impractical, not impossible"

**Act 1**: The player's starter deck deals ~3–5 damage per card. Burning through 200 HP requires 40–67 card plays. The hero hits for 30 — most Act 1 players have 20–30 HP. That's a one-shot or two-shot kill. The hero also moves 10% faster, so running is barely possible in straight corridors. A theoretical win requires: perfect card synergy, multiple healing items, and a corridor chokepoint where the hero can't leverage speed. Impractical — but if someone manages it, they earn bragging rights and nothing else (no drops).

**Act 2**: Numbers soften slightly. The player's mid-game deck does ~8–12 damage per card. 150 HP = 13–19 card plays. Hero damage of 25 against a 40–50 HP player means 2 hits to kill. Speed is equal, so the player can kite in loops. Still very hard — but a well-built combat deck with suit advantage (RPS triangle) can theoretically pull it off. Rare card drop rewards the attempt.

**Act 3**: The player's late-game deck does ~15–25 damage per card. 60 HP = 3–4 card plays. Hero damage of 12 against a 60–80 HP player means 5–7 hits to kill. The hero moves slower, has limited sight (8 tiles), and takes longer smashing through cobwebs. This is a real fight — hard but fair. The guaranteed unique drop makes it worthwhile.

### 4.3 Act determination

Act is derived from player progression flags, not calendar time:
- **Act 1**: `gateUnlocked === false` (player hasn't crossed the Act 1 gate)
- **Act 2**: `gateUnlocked === true && !Player.hasFlag('act2_climax')`
- **Act 3**: `Player.hasFlag('act2_climax')` — post-faction-lock

This mirrors the narrative structure in DOC-13 and DOC-74.

---

## 5. Escape Mechanics

When the hero blocks the exit, the player has three options (not mutually exclusive):

### 5.1 Fight through (all acts, viable in Act 3)

Standard combat via CombatBridge. The hero uses the archetype's suit for RPS triangle interactions: Seeker = spade, Scholar = club, Shadow = diamond, Crusader = heart. Suit advantage matters — a player stacking the counter-suit gets ~1.5× damage.

### 5.2 Secondary exit

Sprint dungeon recipes can place a hidden secondary exit elsewhere in the dungeon. This is a DOOR_EXIT or STAIRS_UP tile in a dead-end room, possibly behind a breakable wall that must be smashed first. The player who explored thoroughly during the fetch phase may have noticed it.

Recipe knob: `entities.secondaryExit: true/false` (default true for most sprint recipes).

The secondary exit leads to the same parent floor as the primary exit — it's a different physical route, not a different destination.

### 5.3 Cobweb barriers

If the dungeon has cobweb deployment slots (controlled by recipe `entities.cobwebSlots`), the player can deploy silk barriers behind them during the escape. Heroes smash through cobwebs but it costs movement ticks (see §4.1 scaling table). A chain of 3–4 cobwebs in a narrow corridor buys substantial time.

This ties sprint dungeons back into the cobweb strategic loop (DOC-31b): silk isn't just for readiness score, it's survival infrastructure. The player makes a resource allocation decision: deploy silk offensively to slow the hero, or save it for cleaning dungeons where it contributes to readiness.

---

## 6. Maze Topology — The `fetch` Procgen Strategy

Sprint dungeons use a fourth procgen strategy archetype (`fetch`) that generates tree-structured mazes with dead ends and red herrings. This is the topological opposite of the loop-heavy strategies used by cleaning dungeons.

### 6.1 Key topology differences

| Property | Cleaning (cobweb/pressure-wash) | Sprint (fetch) |
|---|---|---|
| Room count | 3–7 large rooms | 8–14 small rooms |
| Room size | 5×5 to 9×9 | 3×3 to 5×5 |
| Extra connections | 0.2–0.6 (loops) | 0 (pure tree) |
| Corridor style | Winding / L-bend | Winding (narrow) |
| Corridor width | 1–3 | 1 (chokepoints) |
| Dead ends | Few (loops eliminate them) | Many (tree branches) |
| Objective placement | N/A (cleaning is everywhere) | Deepest leaf from entry |

### 6.2 Generator behavior

The `_applyFetchStrategy` decorator post-processes the BSP output:

1. **Tree enforcement**: connect rooms via MST only — zero `extraConnections`. Exactly one path between any two rooms
2. **Branch stubs**: carve 2–3 dead-end branches (3–6 tiles) off the main corridors. These are red herrings — some get decoy containers (empty chests, already-looted corpses) to waste time
3. **Objective placement**: compute the graph distance from the entry door to every leaf room. Place the fetch target in the farthest leaf. This maximizes pathing distance and forces wrong turns
4. **Secondary exit**: if `entities.secondaryExit` is true, place a DOOR_EXIT in a leaf room that is NOT on the critical path from entry to objective. The player discovers it organically while searching
5. **Cobweb slots**: distribute along corridors between the objective room and the primary exit — these are the escape route cobweb deployment points

### 6.3 Recipe schema additions

New `strategy.primary` enum value: `"fetch"`

New top-level `timer` object:
```json
{
  "timer": {
    "budgetMs": 60000,
    "sentinelGraceMs": 12000,
    "heroArchetype": "seeker"
  }
}
```

New entity knobs:
- `entities.decoyCount`: [min, max] decoy containers in dead-end branches (default [1, 3])
- `entities.secondaryExit`: boolean (default true)

### 6.4 Example recipe: `sprint-cellar.json`

```json
{
  "id": "sprint-cellar",
  "title": "Sprint Cellar",
  "description": "Timed fetch run through a narrow cellar maze. Find the quest item before The Seeker arrives.",
  "biome": "cellar",
  "faction": "neutral",
  "size": { "width": 25, "height": 25 },
  "strategy": { "primary": "fetch", "weight": 1.0 },
  "rooms": {
    "count": [8, 12],
    "minSize": [3, 3],
    "maxSize": [5, 5]
  },
  "corridors": {
    "style": "winding",
    "width": 1,
    "extraConnections": 0
  },
  "entities": {
    "torchDensity": 0.2,
    "breakableDensity": 0.05,
    "trapDensity": 0.02,
    "chestCount": [0, 1],
    "corpseCount": [1, 2],
    "cobwebSlots": 4,
    "enemyBudget": [1, 3],
    "decoyCount": [2, 3],
    "secondaryExit": true
  },
  "doors": {
    "entry": "auto",
    "exit": "none"
  },
  "timer": {
    "budgetMs": 75000,
    "sentinelGraceMs": 12000,
    "heroArchetype": "seeker"
  },
  "seed": null
}
```

Note `doors.exit: "none"` — sprint dungeons are dead-end floors. There is no deeper level. The entry door is the only canonical exit (plus the optional secondary exit placed by the generator).

---

## 7. Quest Integration

### 7.1 Quest step structure

A sprint dungeon sidequest in `data/quests.json`:

```json
{
  "id": "side.1.3.1.cellar_fetch",
  "title": "quest.sidequest.cellar_fetch.title",
  "giver": "cellar_resident",
  "steps": [
    {
      "kind": "npc",
      "label": "quest.sidequest.cellar_fetch.step1",
      "predicate": { "npcId": "cellar_resident" }
    },
    {
      "kind": "fetch",
      "label": "quest.sidequest.cellar_fetch.step2",
      "predicate": {
        "floorId": "1.3.1",
        "itemId": "ITM-042",
        "timerMs": 75000,
        "sentinelGraceMs": 12000,
        "heroArchetype": "seeker"
      },
      "anchor": { "type": "entity", "module": "FloorManager", "method": "getFetchTarget", "args": ["1.3.1"] }
    },
    {
      "kind": "npc",
      "label": "quest.sidequest.cellar_fetch.step3",
      "predicate": { "npcId": "cellar_resident", "branch": "fetch_complete" }
    }
  ],
  "reward": { "gold": 60, "favor": { "bprd": 50 } }
}
```

### 7.2 New QuestChain event entry point

`QuestChain.onTimerExpired(questId, floorId)` — 9th event entry point (after the 8 shipped in DOC-107 Phases 0–5b). Fires when a `kind:"fetch"` step's timer reaches zero. Triggers hero spawn via `HeroSystem.spawnPursuitHero(floorId, archetype, actScaling)`.

### 7.3 Quest failure vs. quest abort

- **Timer expires + player escapes** (with or without objective): quest step remains active. The player can re-enter the dungeon later — the floor regenerates (procgen seed changes), timer resets. No permanent penalty.
- **Timer expires + player dies to hero**: standard game-over flow (DOC-76). Quest step remains active on reload.
- **Timer expires + player defeats hero**: quest step auto-completes if the player has the fetch item. If not, the floor is now hero-free and the player can search at leisure (no timer on second attempt after hero defeat).
- **Player finds item + escapes before timer**: quest step completes normally. No hero encounter.

---

## 8. Narrative Integration

### 8.1 Why heroes appear in side-quest dungeons

The conspiracy layer (DOC-13) establishes that the hero is systematically clearing dungeons for faction purposes. Sprint dungeons represent dungeons where the hero is actively working — the player is intruding on the hero's current operation. The timer represents the hero's return from deeper in the dungeon.

This is distinct from Hero Days (the 3-day cycle), which represent the hero's aftermath. Sprint dungeons are the hero's present-tense action.

### 8.2 Act-specific narrative flavor

- **Act 1**: the hero is an unknown threat. Timer failure toast: *"Heavy footsteps echo from below. Someone — something — is coming up the stairs."* The player hasn't met the hero face-to-face yet (that's Floor 2.2.1, DOC-75). Sprint encounters in Act 1 are the first hints that someone dangerous is down here.
- **Act 2**: the hero is a known quantity. Timer failure toast names the archetype: *"The Seeker's golden light fills the stairwell."* The player knows what they're dealing with — and knows they probably can't win.
- **Act 3**: the tone shifts. Timer failure toast: *"The Seeker appears at the exit. But this time, you're ready."* The player has faction-aligned gear, a tuned deck, and the confidence of two acts of running away.

### 8.3 Faction-flavored sprint dungeons

The recipe `faction` field flavors the dungeon and the hero encounter:
- **MSS sprint**: Seeker archetype. Dungeon contains MSS intel documents as fetch targets.
- **Pinkerton sprint**: Shadow archetype. Dungeon contains stolen artifacts.
- **Jesuit sprint**: Scholar archetype. Dungeon contains hidden Jesuit texts (1624 connection — DOC-80 Seaway).
- **BPRD sprint**: Crusader archetype. Dungeon contains paranormal containment samples.

---

## 9. Design Constraints & Open Questions

### 9.1 Constraints

- Sprint dungeons are always depth-3 (nested dungeon) floors — `N.N.N` format. The hero spawns at the depth-3→depth-2 exit. This keeps the escape route topologically simple (one door up).
- Sprint dungeons are always side-quests. Main quest floors are never timed — the player should never feel time pressure on the critical narrative path.
- The hero entity is singular. Only one hero can be in pursuit at a time. If the player somehow triggers two sprint quests simultaneously, the second timer is paused until the first resolves.

### 9.2 Open questions (resolve during implementation)

1. **Re-entry behavior**: should the dungeon layout persist after a failed attempt (same seed), or regenerate? Persistent layout means the player can memorize the path. Regeneration means each attempt is fresh. Leaning toward regeneration (new seed) — it prevents memorization cheese and keeps the sprint tension honest.
2. **Multiplayer implications**: N/A for current scope (single-player). Note for future reference.
3. **Hero pursuit through cobwebs**: should the hero destroy cobwebs the player placed, or only pre-placed cobwebs? Current design: hero destroys ALL cobwebs (consistent with existing `hero-system.js` behavior). The player's deployed silk is consumed on hero contact — both a cost and a benefit (the silk is "used up" but bought time).
4. **Timer visibility before accepting quest**: should the NPC quest-giver display the timer budget in the quest offer dialogue? Leaning yes — the player should know what they're signing up for.

---

## 10. Implementation Phases

### Phase A — Recipe & Topology (procgen track, no engine changes)

1. Add `fetch` to `strategy.primary` enum in `recipe.schema.json`
2. Add `timer` object to recipe schema
3. Add `entities.decoyCount` and `entities.secondaryExit` to recipe schema
4. Implement `_applyFetchStrategy` decorator in `tools/procgen.js` and `tools/js/bv-bo-procgen.js`
5. Create `tools/recipes/sprint-cellar.json` starter recipe
6. Verify via `bo procgen --recipe recipes/sprint-cellar.json --ascii`

### Phase B — Quest Data (quest track, data-only)

1. Add `kind:"fetch"` to `QuestTypes.STEP_KINDS`
2. Author 1–2 sprint sidequest entries in `data/quests.json`
3. Add i18n keys to `data/strings/en.js`
4. Harness verification (extend Phase 5b pattern)

### Phase C — Timer Runtime (engine track)

1. `QuestChain.onTimerExpired()` — 9th event entry point
2. Timer HUD element (countdown bar + color zones + SFX hooks)
3. Timer pause/resume contract (mirrors MovementController freeze)
4. Wire `QuestChain` step-kind `"fetch"` to start/stop timer

### Phase D — Hero Pursuit Runtime (engine track)

1. `HeroSystem.spawnPursuitHero(floorId, archetype, actScaling)` — new spawn mode
2. Sentinel phase: hero at exit door, facing inward, stationary
3. Pursuit phase: `Pathfind.findPath()` re-path loop targeting player grid pos
4. Act-scaling stat table (§4.1) wired to player progression flags
5. Combat initiation on hero reaching player tile
6. Hero defeat / escape resolution → quest step advance

### Phase E — Polish & Tuning

1. Timer UI juice (vignette, heartbeat, bar shatter)
2. Pursuit SFX (footsteps getting louder with proximity)
3. Playtest act scaling values — adjust HP/damage/speed based on feedback
4. Secondary exit discoverability tuning (how obvious should it be?)

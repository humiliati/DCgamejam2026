# D3 AI + Living Infrastructure Proc-Gen Audit & Roadmap

## Scope

This audit focuses on Depth-3 (`N.N.N`) dungeon reliability for:

- Enemy/NPC AI (dispositions, pathing, encounters)
- Reanimation behavior (defeat -> friendly -> reprioritized verbs)
- Living infrastructure simulation pressure (Act 2/3)
- Cobweb/trap puzzle layers
- Pressure-hose mechanics and their systemic interactions
- Tutorial philosophy (clean/avoid confrontation) continuity into endgame

Primary references:

- `README.md`
- `docs/VERB_FIELD_NPC_ROADMAP.md`
- `docs/LIVING_INFRASTRUCTURE_BLOCKOUT.md`
- `docs/COBWEB_TRAP_STRATEGY_ROADMAP.md`
- `docs/PRESSURE_WASHING_ROADMAP.md`
- `docs/PRESSURE_WASH_SYSTEM.md`
- `docs/DEPTH3_CLEANING_LOOP_BALANCE.md`
- `docs/Tutorial_world_roadmap.md`

Code reality checked in:

- `engine/npc-system.js`
- `engine/verb-nodes.js`
- `engine/corpse-actions.js`
- `engine/enemy-ai.js`
- `engine/cobweb-system.js`
- `engine/trap-rearm.js`
- `engine/hose-state.js`
- `engine/spray-system.js`

## Executive Audit

### What Is Strong Already

1. Verb-field NPC architecture exists and is active (`npc-system.js`): verb decay, node attraction, encounter classification, bark hooks.
2. Hose loop is substantial: breadcrumb path, kink pressure penalties, cross-floor validity constraints, spray integration.
3. Depth-3 cleaning/economy tempo is explicitly designed (`DEPTH3_CLEANING_LOOP_BALANCE.md`), including interleaved verbs and readiness weighting.
4. Tutorial intent is coherent: scavenging and evasion are primary, combat is secondary.

### Core Gaps Blocking Reliable D3 Proc-Gen

1. Reanimation still uses legacy patrol pathing:
   - `corpse-actions.js` assigns `_assignWanderPath()` instead of verb-field/disposition brain.
2. Disposition model is not unified:
   - Desired layers (friendly, hostile-unaware, hostile-alerted) are designed in docs but not enforced as a cross-system contract.
3. Enemy pathing is still mostly greedy:
   - `enemy-ai.js` chase logic is direct-step and does not consume a hazard/viscosity cost field.
4. Cobweb/trap effects are mostly local, not field-level:
   - Cobweb destruction exists; viscosity/verb attenuation and trap influence on decision fields are not integrated end-to-end.
5. Depth-3 proc-gen contract for puzzle layers is incomplete:
   - No strict generation validation pass guarantees usable kiting loops, hose route feasibility, and reanimation-support nodes.
6. Verb-node coverage is incomplete for scaling:
   - `verb-nodes.js` currently seeds early floors; D3-generated node synthesis for reanimated behavior is not yet productionized.

## Required System Contract (Single Source of Truth)

Define one shared runtime AI contract for all entities in D3:

```js
Disposition = 'friendly' | 'hostile_unaware' | 'hostile_alerted';

EntityBrain = {
  disposition,
  verbs,           // weighted needs
  movementMode,    // 'verb_field' | 'patrol' | 'pursuit'
  hazardPolicy,    // avoid/ignore/use
  webPolicy,       // slow/attenuate/ignore
  reanimTier       // t1_wander | t2_dialogue | t3_dispatch
}
```

Transition rules:

1. `hostile_unaware -> hostile_alerted`: awareness threshold crossed.
2. `hostile_alerted -> hostile_unaware`: cooldown decay + no LOS.
3. `hostile_* -> friendly`: defeated then reanimated.
4. `friendly` re-prioritizes verbs on reanimation event (new weights, new satisfiers, possible new tier).

This must be implemented once and consumed by:

- `enemy-ai.js`
- `npc-system.js`
- `corpse-actions.js`
- `cobweb-system.js` (cost signals)
- `trap-rearm.js` / hazard hooks

## Reliable D3 Proc-Gen Floor Contract

Each generated `N.N.N` floor must satisfy these invariants before spawn:

1. Navigation:
   - At least 2 loop paths from entry to deep objective (supports kiting and reroute).
2. Trap topology:
   - At least 1 optional trap corridor and 1 unavoidable risk corridor.
3. Cobweb topology:
   - At least 2 web clusters that meaningfully alter chase timing.
4. Hose topology:
   - One long efficient hose route and one tempting high-kink shortcut.
5. Verb support:
   - Auto-generated D3 verb nodes (bonfire/rest/work surrogate nodes) present if reanimation is enabled.
6. Tempo interleave:
   - Corridor sequence alternates verbs (combat -> break -> fill -> clean -> trap/cobweb), not menu stacks.
7. Solvability:
   - Player can complete readiness core without mandatory unwinnable combat.

If any invariant fails, re-roll the floor seed.

## Roadmap (Execution Order)

### Phase 0: Contracts & Instrumentation (must-do first)

1. Create `AIDisposition` utility module and migrate entity state keys.
2. Add debug overlay toggles:
   - Disposition layer
   - Hazard influence
   - Cobweb viscosity
   - Verb pressure/flow
3. Add D3 generation validator pass (hard fail -> regen).

Done when:

- One console/debug print can show per-entity `Disposition + dominantVerb + movementMode`.

### Phase 1: Reanimation Brain Upgrade

1. Replace `_assignWanderPath()` in `corpse-actions.js` with `_assignReanimatedBehavior()`:
   - Build verb set from nearby/generated nodes.
2. Add enemy-type -> reanimated archetype mapping (weights + tier).
3. Ensure reanimated units use `npc-system` verb tick, not friendly patrol tick.

Done when:

- Reanimated entity on D3 visibly changes destinations over time and not in ping-pong loops.

### Phase 2: Disposition-Aware Movement + Hazard Cost

1. Add shared `getTraversalCost(tile, disposition)`:
   - `hostile_unaware`: avoids known trap fields, mild cobweb penalty.
   - `hostile_alerted`: ignores trap avoidance, accepts cobweb slow.
   - `friendly`: prefers safe routes, avoids high-risk traps.
2. Upgrade chase/path to consume path cost (A* or bounded best-first with costs).
3. Keep greedy fallback for low-power contexts if path budget exceeded.

Done when:

- Same map + different disposition yields visibly different chosen paths.

### Phase 3: Cobweb/Trap Field Integration

1. Add cobweb viscosity scalar to node/state records.
2. Propagate viscosity into:
   - movement speed
   - verb pull attenuation
   - chase cost
3. Add trap influence fields:
   - avoidance bias for unaware
   - no avoidance for alerted
   - rest/eat suppression radii where applicable.

Done when:

- Player can intentionally kite alerted enemies through trap/cobweb zones for predictable payoff.

### Phase 4: D3 Proc-Gen Puzzle Layer Composer

1. Build a dedicated D3 layer composer after base geometry:
   - place trap corridors
   - place cobweb clusters
   - place hose-risk geometry (self-cross opportunities)
   - place reanimation-support nodes
2. Add seed tags for intent:
   - `kite-heavy`
   - `cleaning-heavy`
   - `mixed`

Done when:

- 20 generated seeds all pass invariants; at least 3 distinct tactical floor personalities emerge.

### Phase 5: Act 2/3 Living Infrastructure Escalation

1. Act 2:
   - contested node pressure between factions (GTA2 influence)
   - rising territorial collision barks/events
2. Act 3:
   - persistent throughput simulation (Dwarf Fortress influence)
   - visible supply starvation/congestion if infrastructure is neglected
3. Maintain tutorial truth:
   - confrontation avoidance remains valid strategy, not invalidated by escalation.

Done when:

- Endgame pressure comes from ecosystem instability, not raw stat inflation.

## Acceptance Tests (Reliability Suite)

Run these on fixed seeds and random seeds:

1. Reanimation Transition Test:
   - Defeat -> reanimate -> verify new disposition and verb priorities within 5s.
2. Kite Contract Test:
   - Alerted enemy follows pursuit through web+trap corridor and takes expected penalties.
3. Unaware Avoidance Test:
   - Unaware hostile reroutes around visible trap unless no alternative exists.
4. Hose Feasibility Test:
   - At least one route to complete major grime cleanup under acceptable kink budget.
5. Readiness Completion Test:
   - Floor core readiness reachable without mandatory kill-check on high-threat target.
6. Performance Test:
   - D3 AI tick + overlays stable at target frame pacing under expected population.

## Inspiration Mapping (Directly Applied)

1. Stardew Valley:
   - readable routines and comfort loops via verb nodes and time modulation.
2. GTA2:
   - faction territorial pressure at shared nodes (conflict is spatial, not scripted-only).
3. Dwarf Fortress:
   - need/task satisfaction and throughput failure states (clog, starvation, reroute).

## Immediate Next Sprint (Recommended)

1. Ship Phase 0 + Phase 1 only.
2. Add 3 deterministic D3 validation seeds:
   - one `cleaning-heavy`
   - one `kite-heavy`
   - one `mixed`
3. Playtest specifically for:
   - reanimated behavior readability
   - "clean + avoid confrontation" still being the strongest tutorial-consistent strategy.


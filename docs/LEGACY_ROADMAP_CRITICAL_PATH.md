# Legacy Roadmap Critical Path

> Created: 2026-04-08
> Purpose: Single execution path for old roadmaps, missing dependencies, and all active roadmap docs listed in the ToC.
> Scope: Post-jam reliability and content readiness for Act 2 / Depth 3.

---

## 1) Inputs And Authority

Primary index:
- `TABLE_OF_CONTENTS_CROSS_ROADMAP.md` (all active docs and buckets)

Primary patch-plan source:
- `POST_JAM_EXECUTION_ORDER.md` (P1-P5 complete)

Canonical tile dependency source:
- `TEXTURE_ROADMAP.md` -> `Tile Asset Matrix (Canonical 0-59)`

Living infrastructure + D3 behavior targets:
- `LIVING_INFRASTRUCTURE_BLOCKOUT.md` (DOC-84)
- `D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md` (DOC-85)
- `VERB_FIELD_NPC_ROADMAP.md` (DOC-83)

---

## 2) Legacy Roadmap Triage

Use this triage rule on older docs before implementation:

1. If superseded by a newer doc, treat it as context only.
2. If still referenced by active docs, extract only unresolved tasks into this critical path.
3. If completed work dominates the doc, archive and stop using it as an execution source.

Current classification:

| Doc | Status | Action |
|---|---|---|
| `UNIFIED_EXECUTION_ORDER.md` (DOC-32) | Superseded by DOC-82 | Context only |
| `ROADMAP.md` (DOC-28 legacy) | Legacy | Archive reference only |
| `TEXTURE_ROADMAP.md` (DOC-14) | Active, partially stale narrative | Keep active, use matrix as source of truth |
| `NLAYER_RAYCASTER_ROADMAP.md` (DOC-18) | Active, design-heavy | Keep active, gate by matrix + perf budget |
| `ARCHITECTURAL_SHAPES_ROADMAP.md` (DOC-73) | Active but old tile-id assumptions | Keep active, enforce ID range `60+` |
| `POST_JAM_EXECUTION_ORDER.md` (DOC-82) | Active, mostly complete | Keep as completion log + remaining handoff |

---

## 3) Missing Dependency Ledger (Blockers)

### D-1: Texture key gaps for live tile IDs (40-48)

From the canonical matrix:
- Missing texture keys currently referenced: `well_stone`, `notice_board_wood`, `anvil_iron`, `soup_cauldron`, `cot_canvas`, `charging_cradle`, `switchboard_panel`

Impact:
- Blocks final visual reliability of living infrastructure.
- Creates fallback/invisible risk in new biome wiring.

### D-2: Planned tile constants not implemented (49-59)

Not present in runtime `tiles.js`:
- Creature verb tiles `49-54`
- Economy tiles `55-59`

Impact:
- Blocks DOC-84 Section 12/14/17 execution.
- Blocks DOC-85 acceptance tests for reanimation + infrastructure behavior.

### D-3: Biome wiring incompleteness

Known contract/wiring risk:
- `CHARGING_CRADLE` (45) and `SWITCHBOARD` (46) are designed but not fully wired across all target biomes/interiors.

Impact:
- Verb nodes cannot be consistently satisfied during schedule simulation.

### D-4: Legacy tile-id collisions in old architectural plans

Old architectural proposals reused `40+`, now reserved by living infrastructure/economy.

Impact:
- Potential hard collisions in `tiles.js`, contracts, and authored floors.

Mitigation:
- Reserve `60+` for architectural new IDs only.

---

## 4) Critical Path (Execution Order)

This is the required order. Do not reorder unless a phase is fully complete.

## CP0 - Baseline Alignment (no code risk)

Goals:
- Lock source-of-truth docs.
- Freeze legacy docs as reference-only where needed.

Tasks:
1. Mark this doc as the execution gate for legacy roadmap work.
2. Keep DOC-82 as completed history + active patch ledger.
3. Keep DOC-14 matrix as canonical tile dependency table.

Done when:
- Team uses one path for prioritization and no longer pulls execution order from DOC-32 directly.

## CP1 - Texture/Tile Dependency Closure (hard blocker)

Depends on: CP0

Tasks:
1. Implement missing texture keys for live IDs `40-48`.
2. Keep placeholder policy explicit where accepted (`41 BENCH`, `44 BARREL`) and mark upgrade date.
3. Add tile constants `49-59` to `tiles.js`.
4. Update `isWalkable` / `isOpaque` per DOC-84 definitions.
5. Wire all required keys in `spatial-contract` / `floor-manager` biome contracts.

Done when:
- Matrix rows `40-59` move from `Missing/Planned` to implemented/wired status.

## CP2 - Renderer Integration Stability

Depends on: CP1

Tasks:
1. Run DOC-18 N-layer tasks only after CP1 texture/tile availability.
2. Keep DOC-14 Layer 2 and DOC-31a torch/decor integrations synchronized.
3. Validate frame budget with dynamic lights + N-layer active.

Done when:
- No fallback visuals for intended tiles in active floors.
- Perf passes on target profile.

## CP3 - Living Infrastructure Runtime

Depends on: CP1, CP2

Tasks:
1. Execute DOC-84 placement and node wiring with real tiles/textures.
2. Verify congregation, duty, rest, eat, and errands loops in Floor 1/2/3.
3. Validate cross-floor node registration and anti-mush invariants.

Done when:
- NPC schedules satisfy verbs using placed infrastructure without dead-node starvation.

## CP4 - D3 Proc-Gen Reliability Contract

Depends on: CP3

Tasks:
1. Execute DOC-85 acceptance tests.
2. Validate enemy disposition behavior and verb reprioritization.
3. Validate reanimation with new disposition and infrastructure targeting.
4. Validate cobweb/trap/puzzle-layer proc-gen invariants.

Done when:
- D3 generation is deterministic enough for repeated test seeds and behavior assertions.

## CP5 - Narrative/Economy Coupling

Depends on: CP3, CP4

Tasks:
1. Run ACT2 housing downgrade arc integrations (DOC-74 Sec. 5.4 + linked docs).
2. Integrate faction relationship and NPC memory effects with infrastructure loops.
3. Verify clinic/morgue/union pipeline tile support (`55-59`) in play flow.

Done when:
- Story beats, faction shifts, and living infrastructure behavior reinforce each other in Act 2/3 transitions.

## CP6 - Post-Jam Carryovers

Depends on: CP5

Tasks:
1. Resolve remaining carryovers from archived execution plans (boss/deck/chest-gate/economy/audio polish).
2. Push unresolved items to explicit post-jam backlog docs with owners.

Done when:
- Outstanding list is reduced to intentional deferrals only.

---

## 5) ToC-Mapped Workstreams

Use these workstreams to assign ownership while preserving CP ordering.

Renderer/Engine:
- DOC-14, DOC-18, DOC-31a, DOC-73, DOC-54, DOC-71

Living Infrastructure + AI:
- DOC-83, DOC-84, DOC-85, DOC-11, DOC-9

Gleaner Loop + Economy:
- DOC-48, DOC-67, DOC-31b, DOC-59, DOC-68, DOC-69, DOC-70, DOC-39

Narrative + Progression:
- DOC-74, DOC-13, DOC-10, DOC-2

Patch/Quality:
- DOC-82, DOC-33, DOC-35, DOC-53, DOC-29

---

## 6) Immediate Next 10 Tasks

1. Implement missing texture generators for `40`, `42`, `43`, `45`, `46`, `47`, `48`.
2. Add `49-59` constants in `tiles.js`.
3. Add contract texture/height wiring for `45` and `46` in all required biomes/interiors.
4. Update matrix counts in DOC-14 after steps 1-3.
5. Run DOC-84 tile-node pass on Floor 1/2/3.
6. Execute first DOC-85 seed test pass.
7. Log failing acceptance criteria in DOC-85 with reproduction seeds.
8. Patch disposition/reanimation verb reprioritization failures.
9. Validate Act 2 housing transition hooks against infrastructure readiness states.
10. Re-publish outstanding-only status in ToC.

---

## 7) Exit Criteria

Critical path is complete when:
- No missing texture/tile dependency remains for `0-59`.
- DOC-84 and DOC-85 are executable and validated, not just descriptive.
- Legacy docs are no longer used for sequencing against active work.
- ToC shows only current execution sources and intentional deferrals.


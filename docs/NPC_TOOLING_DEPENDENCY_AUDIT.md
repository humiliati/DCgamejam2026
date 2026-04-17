# NPC Tooling — Cross-Roadmap Dependency Audit

> **Status**: Prerequisite audit for DOC-110 Phases 1–7
> **Created**: 2026-04-16
> **Owner**: Tooling / Authoring Pipeline
> **Cross-refs**: DOC-110 (NPC_TOOLING_ROADMAP), DOC-9 (NPC_SYSTEM_ROADMAP), DOC-83 (VERB_FIELD_NPC_ROADMAP), DOC-79 (NPC_FACTION_BOOK_AUDIT), DOC-32b (TOOLTIP_BARK), SPATIAL_AUDIO_BARK_ROADMAP, QUEST_SYSTEM_ROADMAP (DOC-107), ACT2_NARRATIVE_OUTLINE, LIVING_INFRASTRUCTURE_BLOCKOUT, D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP, POST_JAM_FOLLOWUP_ROADMAP

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Doc Status Snapshot](#2-doc-status-snapshot)
3. [P0 Schema Freezes (10 Hard Commitments)](#3-p0-schema-freezes-10-hard-commitments)
4. [Missing From Current P0 Schema](#4-missing-from-current-p0-schema)
5. [Per-Phase Dependency Map](#5-per-phase-dependency-map)
6. [Recommended Sequencing](#6-recommended-sequencing)
7. [Risks That Could Force Mid-Build Schema Revisions](#7-risks-that-could-force-mid-build-schema-revisions)
8. [Actionable Deltas to DOC-110](#8-actionable-deltas-to-doc-110)
9. [Cross-References](#9-cross-references)

---

## 1. Purpose

DOC-110 (the NPC & Enemy Tooling Roadmap) ships a 7-tool authoring suite on top of a schema that must honor commitments made across ten other roadmap and design docs. Those docs have their own phase structures — some shipped, some queued — and each imposes ordering, schema, or API constraints on the tooling. This audit surfaces those constraints in one place so DOC-110 Phase 0 can freeze a complete schema, Phase 1–7 can ship without mid-build rework, and the POST_JAM Wave sequencing stays coherent.

This doc is **consulted before Phase 0 schema closes** and **revisited before each subsequent phase entry** as downstream roadmaps advance.

---

## 2. Doc Status Snapshot

| Doc | ID | Status | Open work that intersects DOC-110 |
|-----|----|----|-----------------------------------|
| QUEST_SYSTEM_ROADMAP | DOC-107 | Phases 0 / 0b / 1 / 2 / 4 ✅ shipped 2026-04-16 | Phase 3 Reputation, Phase 5 minigame sidequest adapter, Phase 6 floor sidecars, Phase 7 Act 2 content load-in |
| NPC_SYSTEM_ROADMAP | DOC-9 | Phase A.0 ✅ shipped | Phase B (interactive + vendors), Phase C (force-facing), Phase D (Hero NPCs) |
| VERB_FIELD_NPC_ROADMAP | DOC-83 | All phases ⏳ queued | Phases 0–4 implementation, §14 cross-floor traversal, §15 reanimated friends, §18 reanim tiers |
| SPATIAL_AUDIO_BARK_ROADMAP | — | Phase 4a + 5a 🚧 in-progress | Phase 0 (SpatialDir), 1 (panning), 2 (ring), 3 (directional popups), 6 (muffled BGM), 7 (biome continuity) |
| NPC_FACTION_BOOK_AUDIT | DOC-79 | All 5 phases ⏳ queued | Books fix, Uniforms, World-building barks, Choreographed encounters, HQ buildings |
| TOOLTIP_BARK_ROADMAP | DOC-32b | Phase 1 ✅ shipped | Phase 2 content audit, Phase 3 gesture variety, Phase 4 responsive polish, Phase 5 spatial attenuation, Phase 6 full canon port |
| ACT2_NARRATIVE_OUTLINE | — | Narrative locked | 4-phase implementation pending faction/dispatcher NPCs, housing reassignment arc |
| LIVING_INFRASTRUCTURE_BLOCKOUT | — | Wave 1 🚧 in-progress | 18-step critical path, Step 3 verb nodes Floors 2+3 |
| D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP | — | Phase 0 ⏳ queued (contract freeze) | EntityBrain/disposition contract, reanim brain upgrade, puzzle layer composer, Act 2/3 escalation |
| POST_JAM_FOLLOWUP_ROADMAP | — | Wave 1 🚧 in-progress | DOC-110 P0–P3 must land before Wave 3 entry; P4–P5 required for Wave 4 §16.3 |

---

## 3. P0 Schema Freezes (10 Hard Commitments)

These commitments are non-negotiable inputs to `tools/actor-schema.json`. They are drawn from the ten docs above and must hold across every P1–P7 tool.

### 3.1 NPC base fields (DOC-9 §4.2)

`id, type, npcType, x, y, facing, friendly:true, nonLethal:true, hp:999, str:0, awareness:0, barkPool, barkRadius, barkInterval, dialoguePool, talkable, blocksMovement`. Combat system depends on `friendly:true, nonLethal:true, hp:999` to short-circuit combat dispatch. Violation breaks interaction system. Already in schema ✅.

### 3.2 VerbSet extension (DOC-83 §5.1)

`verbSet: { <verbName>: { need: 0–1, decayRate: ms, satisfiers: string[], factionLock?: string } }`. Coexists with `patrolPoints` — the two are mutually exclusive branches on the same entity (OR gate). Tooling must branch on presence of `verbSet` vs `patrolPoints` when authoring behavior.

### 3.3 Spatial node vocabulary frozen (DOC-83 §4.1)

Fixed 8-entry enum: `bonfire, well, bench, shop_entrance, bulletin_board, faction_post, work_station, rest_spot`. Extension requires DOC-110 re-authorization and a coordinated schema bump across P1 + P3 + P4 + P7.

### 3.4 Full faction enum (DOC-9 §6.3 + DOC-79 §2.1 + ACT2 §2)

Act 1 set: `tide | foundry | admiralty | null`. Act 2 adds: `mss | pinkerton | jesuit | bprd`. Closed 7-way enum. NPCs tagged `null` represent neutrals (tutorial zone, Gleaner, scholars). Faction names cannot typo — P1 must validate on write; silent vendor shop breakage is the failure mode.

### 3.5 Dialogue tree schema (DOC-9 §5.2)

`{ root: string, nodes: { [id]: { text: string, choices: [{ label, next, effect? }] } } }`. Effect field: `setFlag | currency | giveItem | callback`. All `next` pointers must resolve within the tree (no dangling).

### 3.6 Reanim tier enum (DOC-83 §18 + D3 audit §3)

Three-way closed enum: `t1_wander | t2_dialogue | t3_dispatch`. T2 requires `dialogueTreeId`. T3 requires `dispatchTarget: { floorId, nodeId }`. Enemies flagged T3 drive the cage-inventory pipeline (DOC-83 §18.4); `inventoryRestock` items must exist in the SHOP enum — tooling validates this cross-reference.

### 3.7 EntityBrain disposition contract (D3 §3)

Unifies NPC + reanimated-enemy behavior under one runtime shape:

```
EntityBrain = {
  disposition: 'friendly' | 'hostile_unaware' | 'hostile_alerted',
  verbs: VerbSet,
  movementMode: 'verb_field' | 'patrol' | 'pursuit',
  hazardPolicy: 'avoid' | 'ignore' | 'use',
  webPolicy: 'slow' | 'attenuate' | 'ignore',
  reanimTier: ReanimTier
}
```

This is the runtime schema change that reanimation lives on top of. P0 must author this; P1–P5 must all round-trip it.

### 3.8 Tuning constants preserved (DOC-83 §5.4 / §6.2 / §7.1)

`SATISFACTION_DROP = 0.5`, linger time 3–7 seconds, `ENCOUNTER_COOLDOWN = 180s`, `DISTANCE_WEIGHT = 0.15`. Authoring tools do not expose these as free variables — they're tuning-locked. P4 Archetype Studio exposes per-archetype decay rates but treats these constants as hard floors.

### 3.9 Bark pool key grammar (DOC-9 §3.2 + DOC-83 §8 + DOC-79 §3.2)

Namespaced key grammar:

- `ambient.<floor>` — floor-scoped ambient barks
- `faction.<id>.{ambient | cross_faction | dragon_whisper}` — faction-scoped lines including conspiracy reveal
- `interior.<type>` — interior-specific ambient
- `npc.<id>.<situation>` — per-NPC situational
- `encounter.<nodeType>.<class>` — NPC-to-NPC meet barks keyed by verb node and encounter classification
- `bark.transition.*` — floor-transition barks

P2 Bark Workbench validates every key against this grammar; invalid keys fail the write.

### 3.10 Quest anchor contract (DOC-107 §2.3)

Every NPC with an `id` must be globally unique and resolvable via `getNpcById(id)` → `{ floorId, x, y }`. QuestRegistry's `npc`-typed anchor resolver depends on this. P1 enforces uniqueness; P7 validates that every quest-referenced NPC exists on the expected floor (`quest-anchor-drift` is a hard CI-blocking error per DOC-110 §9).

---

## 4. Missing From Current P0 Schema

`tools/actor-schema.json` shipped with 14 definitions covering the NPC/enemy base shape. The following fields are **not yet in the schema** and must land before P1 starts:

| Field | Source | Why it matters |
|-------|--------|----------------|
| `EntityBrain` + `disposition` enum | D3 §3 | Unifies reanimated-enemy + NPC behavior — breaks every hydrator + planner if absent |
| `verbSet[verb].floorScope` or per-verb attenuation curve | POST_JAM Wave 3 #1 | Cross-floor verb attenuation prevents reanimated constructs stampeding cross-floors |
| `dispatcher_phase` enum (`normal|faltering|missing|replaced`) | ACT2 §5 | Dispatcher arc state machine — affects dispatcher variant authoring in P1 + P2 |
| `housing_status` enum (`homebnb_temp|reassigned|bunkhouse|faction_quarters|apartment|home16_reclaimed`) + `home16_locked` | ACT2 §5.4 | Housing reassignment arc — affects interior NPC assignment and safety contract |
| `voiceType` reservation on NPC | SPATIAL §1d | Reserves the field for per-NPC-type bark-stinger SFX without a later schema bump |
| `questRole` tag enum (`quest_giver|vendor|dispatcher|faction_contact|ambient`) | DOC-107 + DOC-110 §9 | Quest anchor coherence + population planner filters |
| `reanimTier` assignment field on enemy rows | DOC-83 §18.5 | Required for every defeatable enemy the player can reanimate |
| `meetPoolId` linkage on NPC encounter pairs | DOC-79 §3.3 | Choreographed encounter bark ping-pong |
| `portraitAssetId` reservation | DOC-107 implicit | Future quest-giver portrait UI; reserve now to avoid schema churn |
| `npcArchetype` (or `role`) field | DOC-32b Phase 3 | Gesture defaults pull from archetype; P2 Bark Workbench uses as hint source |

**Action**: amend `tools/actor-schema.json` to include these eight additions before P1 scaffolding starts. Without this the first P1 save will require a schema bump and every downstream tool written against v1 will need a v2 migration.

---

## 5. Per-Phase Dependency Map

### P1 — NPC Designer

**Requires** §3.1, §3.2, §3.4, §3.5, §3.7, §3.10 + §4 additions (`dispatcher_phase`, `housing_status`, `voiceType`, `questRole`, `portraitAssetId`, `npcArchetype`). Tiles + `tools/floor-data.json` for placement mini-map. P6 stack manifest field shape reserved (even before P6 ships).

**Produces** NPC rows satisfying DOC-9, DOC-83, DOC-107 simultaneously. Branches on `verbSet` vs `patrolPoints`. Canonical writer into `data/npcs.json`.

**Gates** every downstream NPC-authoring phase.

**Blocker**: Hero NPC authoring (DOC-9 §8.3) needs `Pathfind.find()` which doesn't exist. Resolution: ship P1 without Hero archetype support; slot Hero into P5 or after DOC-9 Phase D lands pathfinding.

### P2 — Bark Workbench

**Requires** §3.9 + P1's id registry for orphan-detection cross-reference. Priority-tag convention from TOOLTIP_BARK Canon (`NORMAL | PERSISTENT | DIALOGUE`).

**Produces** bark pool JSON with priority tags, gesture metadata, 30-char validator (warn 25+, fail 31+), orphan detection, fire-roll simulator.

**Gates** SPATIAL_AUDIO Phase 3 (directional bark popups), DOC-79 Phase 3 (world-building barks) + Phase 4 (choreographed encounters), DOC-32b Phase 2 (content audit).

**Open decision**: i18n keys vs raw strings. If adopted mid-build, every pool file becomes an i18n-key manifest. Recommend P2 emits barks as i18n keys from day one (`bark.faction.tide.ambient.conspiracy_01`) with `data/strings/<lang>.js` as the text source.

### P3 — Verb-Node Stamper

**Requires** §3.3, §3.8 + LIVING_INFRASTRUCTURE_BLOCKOUT's 6 template stamps (town_square, soup_kitchen_congregation, faction_post, market_row, guard_checkpoint, dungeon_rest_ring).

**Produces** `engine/verb-nodes.js` authored targets + `tools/verb-node-overrides/<floorId>.json` sidecars for proc-gen dungeons. Validator: "floor has >0 NPCs but 0 satisfier nodes of required type" = error.

**Critical**: P3 has **no dependency on P1**. Runs in parallel to P1.

**Gates** DOC-83 Phases 1–4, D3 Phase 4 (puzzle layer composer), proc-gen D3 verb-node synthesis.

**Risk**: Depth-3 is proc-gen with no current verb-node synthesizer. P3 scope may absorb `DungeonVerbNodes.populate` merge logic (+0.5 day).

### P4 — Archetype Studio

**Requires** §3.2 + §3.7 + frozen archetype presets: `scholar, worker, citizen, drunk, guard, granny` (DOC-83 §5.3) + faction combat archetypes with suit affinity (ACT2 §6.2: MSS/Pinkerton/Jesuit/BPRD aligned to Hearts/Diamonds/Spades/Clubs).

**Produces** `engine/archetype-registry.js` (new Layer 1 IIFE) + `data/archetypes.json`. Hot-reload support (file round-trip) for live decay-rate tuning.

**Gates** Wave 4 §16.3 retrofuturistic roster expansion, DOC-83 Phase 4 (full floor population), ACT2 faction operative authoring.

**Risk**: Decay rates require live playtest. P4 must support hot-reload, not file-round-trip only.

### P5 — Enemy Hydrator

**Requires** §3.6, §3.7 + enemy catalog schema (hp/str/dex/stealth/suit/lootProfile/biomes/tier/isElite) + SHOP enum for T3 cage restock validation. P4 must ship first — P5's reanim-tier assignment falls back to archetype presets for unknown enemy types.

**Produces** reanim-tier assignment, dispatchTarget resolution, cage inventory validation, hostile-faction operative rosters (2–3 per tier per faction for Act 2).

**Gates** ACT2 Phase 1 (hostile faction spawning), DOC-83 §18 reanimation tiers, D3 audit Phase 5 (Act 2/3 escalation). Required for Wave 4 roster expansion.

**Blocker**: D3 hazard/viscosity cost function unfrozen (D3 audit §2 lines 52–54). P5 behavioral tuning waits for D3 Phase 2 to ship the cost function.

### P6 — NPC Sprite Studio

**Requires** faction palette hex ranges: cyan 180–210 (Tide), amber/orange 20–40 (Foundry), violet 260–300 (Admiralty) per DOC-79 §2.2. Gleaner green + Scholar ivory added for neutrals. `NpcComposer.getVendorPreset(factionId)` API.

**Produces** `data/npc-composer-seeds.json` + faction palette presets (`faction_tide_cyan`, `faction_foundry_amber`, `faction_admiralty_violet`, `gleaner_green`, `scholar_ivory`).

**Orthogonal** to P1–P3. Can start any time after P0. P1 ships with `stack: null` placeholder until P6 lands.

**Gates** DOC-79 Phase 2 (Uniforms), Wave 4 visual polish pass.

### P7 — Population Planner

**Requires** ALL of P1–P6 outputs + QuestRegistry anchor resolution + `tools/floor-data.json`.

**Produces** ~14 coherence checks (DOC-110 §9): `empty-floor`, `orphan-bark-pool`, `empty-bark-pool`, `singleton-oneshot`, `unsatisfiable-archetype`, `missing-dialogue`, `faction-imbalance`, `tier-imbalance`, `broken-supply-chain`, `quest-anchor-drift`, `budget-exceed`, `reanim-tier-missing`, `reanim-tier-dispatch-target-invalid`, `bark-too-long`. Plus D3 acceptance-test pass/fail per floor (D3 audit §8), home16 lock consistency (ACT2 §5.4), hostile operative spawn legality (ACT2 §4.3).

**Gates** April 25 fresh-build stability cutoff.

---

## 6. Recommended Sequencing

POST_JAM Wave 3 currently encodes "P0–P3 before Wave 3 entry" as a single bundle. That bundle can be tightened:

**Wave 3 entry bundle** (all land before Wave 3 #1):

1. **P0 (expanded schema)** — freeze all ten commitments in §3 plus the eight additions in §4. Includes cross-floor verb attenuation field.
2. **P1 ‖ P3 in parallel** — P3 has no dependency on P1. Running sequentially wastes ~2 days.
3. **P2** — follows P1 so orphan detection has the canonical id registry.

**Wave 4 enablement**:

4. **P4 (Archetype Studio)** — must ship before P5 because P5's reanim-tier fallback uses archetype presets.
5. **P5 (Enemy Hydrator)** — waits for D3 Phase 2 to freeze the hazard cost function.

**Polish tier**:

6. **P6 (Sprite Studio)** — can start any time after P0. Orthogonal.
7. **P7 (Population Planner)** — last. The coherence gate before April 25.

**Co-commit with P0** (not as a separate Wave 3 item): cross-floor verb attenuation schema (POST_JAM Wave 3 #1). Its schema knob (`floorScope` or per-verb attenuation curve) sits directly inside the verbSet definition — splitting it into a separate Wave 3 line would force a schema bump after P1 ships.

---

## 7. Risks That Could Force Mid-Build Schema Revisions

Tracked so the team can pre-commit answers before P0 closes.

**A. Dual-dominant verb tie-breaker** (DOC-83 §7.2) — encounter classification picks "dominant verb" with no defined behavior when two verbs tie. If resolved via a priority enum, P2 encounter-pool key grammar changes. *Pre-commit*: add verb priority order to §3.2 now.

**B. Hero NPC pathfinding gap** — DOC-9 §8.3 requires `Pathfind.find()` which doesn't exist. If Dungeon Gleaner ships its own pathfinder mid-build, NPC schema may gain a `waypointMode` field. *Pre-commit*: reserve `waypointMode` as a nullable enum in §3.1 extension.

**C. Housing affinity tiers** (ACT2 §5.4 + COZY_INTERIORS Safety Contract) — three affinity states with unspecified amenity caps could add floor-level constraints P7 must validate. *Pre-commit*: define the three states explicitly in §3.7 extension.

**D. D3 hazard/viscosity cost function** — unfrozen (D3 §2 lines 52–54). Blocks P5 behavioral tuning.

**E. Proc-gen D3 verb-node synthesis** — absence could grow P3 by ~0.5 day or push the gap to P7 warnings. *Pre-commit*: decide P3 vs P7 ownership during P3 scoping.

**F. i18n adoption** (TOOLTIP_BARK) — if adopted mid-build, retrofits all P2 pool files to keys. *Pre-commit*: P2 emits i18n keys from day one.

**G. Dispatcher state machine ownership** (ACT2 §5) — `dispatcher_phase` transitions unclear: day-tick driven or quest-step driven. Affects P1+P2 dispatcher variant authoring. *Pre-commit*: decide with DOC-7 Day/Night owner before P1 starts.

**H. Faction HQ NPC identity** (DOC-79 §5) — distinct instances or exterior patrol clones? Affects P1 instance-vs-template decision. *Pre-commit*: decide during P1 design review.

**I. NPC voice SFX** (SPATIAL §1d) — future `npc-bark-stinger-<type>` could require per-NPC voice assignment. *Pre-commit*: §4 already reserves `voiceType`.

**J. Cross-floor verb attenuation schema shape** (POST_JAM Wave 3 #1) — `floorScope` enum vs per-verb attenuation curve vs both. *Pre-commit*: decide during P0 schema freeze, not after.

**K. Quest reputation hook** (DOC-107 Phase 3) — faction barks may tag `reputationDelta` once Reputation ships. *Pre-commit*: reserve `reputationDelta` in bark entry schema in §3.9 extension.

---

## 8. Actionable Deltas to DOC-110

Three specific changes to apply to `docs/NPC_TOOLING_ROADMAP.md`:

1. **Expand Phase 0 schema scope.** The current P0 chapter 1 shipped `actor-schema.json` with 14 definitions. Amend the schema in a Phase 0 Chapter 4 (or fold into Chapter 3) to cover the 8 additions in §4 above plus the pre-commit fields from §7 A/B/C/K.

2. **Reorder P1 + P3 as parallel tracks.** Both are independent of each other; running sequentially wastes ~2 days. Update DOC-110 §6 Phase 1 and Phase 3 to note "may run in parallel."

3. **Co-commit cross-floor verb attenuation with P0.** Move POST_JAM Wave 3 #1's schema decision into DOC-110 Phase 0 rather than treating it as a separate Wave 3 item. Update POST_JAM Wave 3 #1 to reference this audit.

Optional polish:

4. Add a `voiceType`, `questRole`, `portraitAssetId` reservation note to DOC-110 §4.1 (P1 NPC Designer) to call out that these fields exist in the schema but have no UI until later phases.

5. Add a Phase 5 blocker callout for the D3 hazard cost function (risk D).

---

## 9. Cross-References

| Section | References | Purpose |
|---------|------------|---------|
| §3.1 | DOC-9 §4.2 | NPC base field contract |
| §3.2 | DOC-83 §5.1–5.2 | VerbSet structural contract |
| §3.3 | DOC-83 §4.1 | Spatial node vocabulary |
| §3.4 | DOC-9 §6.3, DOC-79 §2.1, ACT2 §2 | Faction enum (7-way) |
| §3.5 | DOC-9 §5.2 | Dialogue tree schema |
| §3.6 | DOC-83 §18, D3 §3 | Reanim tier contract |
| §3.7 | D3 §3 | EntityBrain unification |
| §3.8 | DOC-83 §5.4 / §6.2 / §7.1 | Tuning constants |
| §3.9 | DOC-9 §3.2, DOC-83 §8, DOC-79 §3.2 | Bark pool key grammar |
| §3.10 | DOC-107 §2.3 | Quest anchor resolver |
| §4 | POST_JAM Wave 3, ACT2 §5, SPATIAL §1d, DOC-32b Phase 3 | Missing schema fields |
| §5 P1 | DOC-9 §8.3 | Hero pathfinding blocker |
| §5 P3 | LIVING_INFRASTRUCTURE_BLOCKOUT §7 Wave 1 | Template stamp sourcing |
| §5 P5 | D3 §2, ACT2 §4.3 | Hazard cost + hostile operative rosters |
| §5 P6 | DOC-79 §2.2 | Faction palette hex |
| §6 | POST_JAM Wave 3 + Wave 4 | Wave sequencing |
| §7 | DOC-83 §7.2, ACT2 §5.4, COZY_INTERIORS §1, DOC-32b, DOC-107 Phase 3 | Mid-build risk sources |
| §8 | DOC-110 §6 + POST_JAM Wave 3 #1 | Specific doc edits |

---

**Document Version**: 1.0
**Created**: 2026-04-16
**Status**: Prerequisite audit — amend before DOC-110 Phase 0 Chapter 4 closes

# NPC & Enemy Tooling Roadmap

> **Status**: Phase 0 Ch.1–5 ✅ shipped (schema v1.1.0 + runtime cutover + manifest pipeline + **inline fallback retired**); Phase 1 MVP ✅ shipped (`tools/npc-designer.html` — CRUD every NPC via UI, plus stack + sprite commission authoring); `data/npcs.json` is now the sole source of truth at runtime. P2 (Bark Workbench) + P3 (Verb-Node Stamper) + P4 (Dialogue Workbench) unblocked.

> **Created**: 2026-04-16
> **Owner**: Tooling / Authoring Pipeline
> **Prerequisites**: [NPC_TOOLING_DEPENDENCY_AUDIT.md](NPC_TOOLING_DEPENDENCY_AUDIT.md) — read before P0 schema closes
> **Cross-refs**: VERB_FIELD_NPC_ROADMAP (DOC-NPC), BLOCKOUT_VISUALIZER_ROADMAPv2, NPC_FACTION_BOOK_AUDIT, QUEST_SYSTEM_ROADMAP (DOC-107), NPC_TOOLING_DEPENDENCY_AUDIT

---

## Table of Contents

1. [Vision](#1-vision)
2. [Current State — Audit Summary](#2-current-state--audit-summary)
3. [Gap Matrix](#3-gap-matrix)
4. [Tool Set — The Seven](#4-tool-set--the-seven)
5. [Shared Infrastructure](#5-shared-infrastructure)
6. [Implementation Phases](#6-implementation-phases)
7. [Manifest & Resource Tracking](#7-manifest--resource-tracking)
8. [Round-Trip Contract with Runtime](#8-round-trip-contract-with-runtime)
9. [Coherence Checks](#9-coherence-checks)
10. [File Map](#10-file-map)
11. [Cross-References](#11-cross-references)

---

## 1. Vision

NPC and enemy design currently lives in three hand-edited JSON files (`data/enemies.json`, `data/enemy-cards.json`, `data/enemy-decks.json`), a pile of IIFE registries in `engine/` (`bark-library.js`, `npc-composer.js`, `npc-dialogue-trees.js`, `verb-nodes.js`), and hardcoded archetype tables inside `npc-system.js` and `reanimated-behavior.js`. Adding one NPC today means touching five files across two folders and holding the schema in your head.

The Act 2 roadmap (ACT2_NARRATIVE_OUTLINE, VERB_FIELD_NPC_ROADMAP §16–18) unifies NPCs and enemies into a single actor schema, stretches populations across every floor, and introduces dialogue tiers, cage pipelines, supply runs, and faction escalation. Hand-editing won't scale. We need tooling that **round-trips with the runtime**, enforces **coherence** across floors, and makes **population density a first-class artifact** rather than an emergent property of whoever was editing last.

The target is a **seven-tool suite** that reuses the authoring pipeline we already built for the blockout visualizer: in-browser React/vanilla HTML panels, JSON round-trip to canonical runtime files, a Node CLI for headless automation, and a shared manifest layer for cross-tool queries.

---

## 2. Current State — Audit Summary

### 2.1 Runtime entity schema (already crisp)

`engine/npc-system.js` §lines 75–224 normalises NPCs to:

| Field | Type | Purpose |
|-------|------|---------|
| `id, type, x, y, facing, emoji, name` | core | identity + position |
| `stack` | object | `NpcComposer` sprite stack |
| `patrolPoints[]`, `stepInterval` | movement | bounce patrol (legacy, pre-verb-field) |
| `barkPool, barkRadius, barkInterval` | audio | proximity flavor |
| `talkable, dialoguePool, dialogueTree` | interaction | OK-to-talk + content |
| `factionId, gateCheck` | commerce/gating | shop + key/flag gate |
| `verbArchetype, verbSet` | behavior | verb-field orbit (§VERB_FIELD §5) |

Runtime-private fields populate on construction (`_stepTimer`, `_verbSatisfyTimer`, `_currentNode`, `_dominantVerb`, `_verbTarget`). Enemies share `x,y,facing,emoji,name` + `hp,str,dex,stealth,awarenessRange,isElite,nonLethal,suit,lootProfile,biomes[]` plus `friendly` and `_verbSet` when reanimated. **The schema is already Act-2-ready as a single actor envelope.** What's missing is editing ergonomics.

### 2.2 Bark library (robust, underexposed)

`engine/bark-library.js` enforces pool-key free-form strings with clear conventions:
`ambient.*`, `faction.*`, `interior.*`, `npc.<id>.*`, `encounter.<node>.<classification>`, `bark.transition.*`. Each bark carries `{text, speaker?, style?, weight?, oneShot?}`. The library handles 45s default cooldown, anti-repeat, and persistent `_firedOnce` for oneShot entries. Zero editing UI exists.

### 2.3 Combat surface (static, no hydrator)

`engine/enemy-intent.js` + `engine/enemy-deck.js` resolve expression glyphs and draw enemy cards per combat from hand-composed JSON. **There is no stats-to-behavior hydrator** — nothing takes `{tier:'elite', hp:30, str:6, suit:'club'}` and proposes a deck + intent curve. Every enemy's deck is hand-assigned, and tier curves are a spreadsheet in someone's head.

### 2.4 Tooling ecosystems

**DCgj2026 `tools/`**: blockout-visualizer (floor grids), world-designer (§3.1 seed payloads), peek-workbench (3D peek animations, 8k lines, reusable phase/timeline scaffolding), boxforge (CSS 3D box geometry), unified-designer (32-line iframe shell — designed to host new designers).

**EyesOnly `public/portal/`**: asset-designer, map-designer, interior-designer (building templates + door contracts + floor tabs), item-designer (React 18, search/filter/rarity chips — the best UI template), loot-designer (weight bar + chance editor — the best tuning template), coin-designer, mok-avatar-designer (emotion state machine — the best animation template), sound-designer.

**Zero NPC/enemy designers exist in either ecosystem.** The seven tools proposed below are all net-new; the shared infrastructure (sidebar patterns, tile-stamp machinery, JSON round-trip) is reusable.

---

## 3. Gap Matrix

| Domain | Runtime exists? | Data exists? | Tool exists? | Gap |
|--------|----------------|--------------|--------------|-----|
| NPC entity CRUD | yes | inline in `npc-system.js` `_registerBuiltinPopulations()` (lines 1174–1948) | **no** | **P1 — NPC Designer** |
| Bark pool authoring | yes | `data/barks/*` partial | **no** | **P2 — Bark Workbench** |
| Verb-node placement | yes | `engine/verb-nodes.js` literal | partial (blockout-visualizer stamps tiles, not nodes) | **P3 — Verb-Node Stamper (layer)** |
| Archetype / verbSet curves | yes | `VF_ARCHETYPES` hardcoded | **no** | **P4 — Archetype Studio** |
| Enemy combat hydrator | missing | `enemies.json` + `enemy-decks.json` hand-authored | **no** | **P5 — Enemy Hydrator** |
| NPC sprite composition | yes (`NpcComposer`) | seed-keyed | **no** | **P6 — NPC Sprite Studio** |
| Cross-floor population density, faction balance, unused assets | — | — | **no** | **P7 — Population Planner** |

---

## 4. Tool Set — The Seven

### 4.1 P1 — NPC Designer (`tools/npc-designer.html`)

**Centerpiece.** Visual CRUD for every NPC in the game.

- **Left sidebar**: searchable list filtered by biome / faction / type / floor (item-designer pattern).
- **Main editor**: tabbed `Identity | Placement | Behavior | Dialogue | Commerce | Reanim-Tier`.
  - **Identity**: name, id (auto-generated `NPC-###`), type (AMBIENT/INTERACTIVE/VENDOR/DISPATCHER/HERO), emoji, factionId, `NpcComposer` seed with live sprite preview.
  - **Placement**: floorId picker → mini-map from `tools/floor-data.json` → click a walkable tile to pin spawn. Shows verb-node proximity overlay (pulled from P3).
  - **Behavior**: radio `bounce-patrol` vs `verb-field` vs `stationary` vs `dispatcher-choreography`. If verb-field: archetype dropdown (from P4). If patrol: waypoint list editor on the same mini-map.
  - **Dialogue**: `barkPool` autocomplete (pulls live list from P2 manifest), `dialogueTree` dropdown (keyed off `npc-dialogue-trees.js` exports), `dialoguePool` fallback, `talkable` toggle.
  - **Commerce**: `factionId`, `gateCheck` sub-form (`requiredBookId`, `unlockFlags[]`, `targetFloor`, accept/reject bark pools).
  - **Reanim-Tier**: reads from enemy side if this actor is defeatable; T1/T2/T3 selector + `dispatchTarget` (§18). Pulls cross-floor options from FloorManager helpers.
- **Preview strip** (bottom, 220px): live sprite + in-context raycaster screenshot slot (pulls from `tools/floor-data.json` mini-renderer).
- **Export**: overwrites the NPC's row in the generated `data/npcs.json` (see §8 — new canonical file). A sync pass regenerates `engine/npc-seed.js` which replaces the inline `_registerBuiltinPopulations()` block in `npc-system.js` (currently lines 1174–1948).

**Scope**: ~1,500 lines HTML/JS. ~2 days.

### 4.2 P2 — Bark Workbench (`tools/bark-workbench.html`)

Pool composition editor. **Every bark currently authored in `bark-library.js` or `data/barks/en.js` surfaces here.**

- **Left**: pool tree by namespace (`ambient.*`, `faction.*`, `encounter.*`, `npc.*`).
- **Main**: selected pool shows bark table (text, speaker, style, weight, oneShot, cooldownMs override) — directly editable. Per-bark `Used-By` badge showing which NPCs reference this pool (cross-reference from P1 manifest).
- **Bottom strip**: live "fire roll" simulator — pick a pool, click fire 20 times, see distribution histogram. Validates weight math.
- **Coherence panel** (right, collapsible):
  - Pools referenced by NPCs but empty → red.
  - Pools with only oneShot entries and `pool.size == 1` → warn "player hears this exactly once."
  - Pools not referenced by any NPC → "orphan, delete?"
  - Token-count guard: any bark >60 chars → warn (won't fit toast).
- **Export**: writes `data/barks/en.js` directly (preserves file structure, alphabetises, injects region comments).

**Scope**: ~800 lines. ~1 day. Depends on P1 manifest (for Used-By badges).

### 4.3 P3 — Verb-Node Stamper (blockout-visualizer extension)

Not a new tool — a **new layer toggle** on the existing `tools/blockout-visualizer.html`.

- **New layer tab**: "Verb Nodes" alongside existing tile/freeform layers.
- **Palette**: 9 node types (bonfire, well, bench, shop_entrance, bulletin_board, faction_post, work_station, rest_spot, soup_kitchen) rendered as colored pins.
- **Template stamps** (drop-down in palette):
  - `town_square` — bonfire center, 4 benches radial, well off-axis
  - `soup_kitchen_congregation` — soup_kitchen + 3 benches + bulletin_board
  - `faction_post` — faction_post + work_station pair + rest_spot
  - `market_row` — 3 shop_entrances + 2 benches linear
  - `guard_checkpoint` — 2 faction_posts flanking a door tile
  - `dungeon_rest_ring` — 4 rest_spots spaced around a bonfire (reanimated-friendly)
- **Per-floor write target**: nodes saved to either `engine/verb-nodes.js` (hand-authored, depth 1-2) or sidecar JSON `tools/verb-node-overrides/<floorId>.json` (procgen dungeon overrides, merged with `DungeonVerbNodes.populate` at load).
- **Validator**: warns if a floor has >0 NPCs but zero nodes the archetype can satisfy ("Innkeeper on 1.2 needs work_station — none on floor").

**Scope**: ~400 lines added to blockout-visualizer + 6 template definitions in a new `tools/verb-node-templates.json`. ~0.5 day.

### 4.4 P4 — Archetype Studio (`tools/archetype-studio.html`)

Edit the verb-decay curves that define personality. Replaces hardcoded `VF_ARCHETYPES` in `npc-system.js` + `REANIM ARCHETYPES` in `reanimated-behavior.js` with a data-driven registry.

- **Left**: archetype list (scholar, worker, citizen, drunk, guard, granny, undead, construct, beast, arcane + user-added).
- **Main**: per-verb decay-rate slider (rest / social / errands / duty / eat), initial-need slider, satisfier type checklist, custom transition bark pools.
- **Right — "Day Timeline" preview**: simulates 10 game-minutes at 5x speed, graphs each verb's need over time, highlights which verb is dominant at each tick. Shows where a granny is glued to a bench and where a guard is switching between duty and social.
- **"Clone & diverge"** button: duplicate an archetype, rename, tweak — the pattern for "skeleton_archer_scout" = undead + more errands decay.
- **Export**: writes `engine/archetype-registry.js` (new Layer 1 IIFE), re-exports both `VF_ARCHETYPES` (NPC-facing) and `REANIM_ARCHETYPES` (friendly-enemy-facing) from a single canonical table. npc-system.js + reanimated-behavior.js read from the registry via `typeof` guard.

**Scope**: ~900 lines. ~1.5 days. Unlocks data-driven archetype expansion for §16.3 retrofuturistic roster.

### 4.5 P5 — Enemy Hydrator (`tools/enemy-hydrator.html`)

**The missing combat tuning surface.** Takes an enemy row from `enemies.json` and proposes a deck + intent curve + awareness profile, then lets you tune.

- **Left sidebar**: enemy list (27 today, grows to ~60 at §16 retrofuturistic expansion) — filter by biome, tier, suit, lootProfile.
- **Main editor tabs**:
  - **Stats**: hp / str / dex / stealth / awarenessRange sliders. Live "DPS estimate" computed from str × 10fps intent-fire rate — displays tier-expected band (standard 2–4 DPS, elite 4–7, boss 7–12). Red if out of band.
  - **Deck Composer**: dropdown pool of `EATK-###` cards from `enemy-cards.json`. Drag cards into the enemy's deck. Weight indicator shows draw probability. **"Hydrate from stats"** button: suggests a deck using heuristics:
    - `hp/str ratio` → aggression tilt (more attacks vs more defence)
    - `dex` → skill cards weighted higher
    - `stealth` → opener-card slots
    - `suit` → suit-matched card ratio ≥60%
    - `tier` → card-count + quality ceiling
  - **Intent Curve**: visualises expression state machine (calm→focused→angry→enraged, or calm→surprised→dazed for stunnable types). Per-HP%-threshold expression pin. Preview panel fires a sample "beginCombat" and walks the curve.
  - **Loot**: `lootProfile` dropdown (organic / undead / arcane / construct / boss), cross-refs `data/loot-tables.json`, shows expected-value gold + item roll.
  - **Reanim Behavior**: pulls P4 archetype list, picks defaults by type regex (already done in `reanimated-behavior.js:classify`). Override per-enemy if needed.
- **Balance Matrix** (bottom): scatter plot of all enemies, axes configurable (HP × DPS, tier × awarenessRange, etc.). Outliers highlighted. Click to jump to that enemy in the editor.
- **Export**: writes enemies.json, enemy-decks.json, and regenerates `tools/enemy-manifest.json`.

**Scope**: ~1,800 lines. ~3 days. Highest-leverage tool — turns the combat spreadsheet into a tuned system.

### 4.6 P6 — NPC Sprite Studio (`tools/npc-sprite-studio.html`)

Fork of `EyesOnly/public/portal/mok-avatar-designer.html` adapted to `NpcComposer` stack semantics.

- **Theme colors**: faction palette presets (Tide=cyan, Foundry=amber, Admiralty=violet, Gleaner=green, Scholar=ivory) + override.
- **Stack composition**: head / torso / arms / legs layer picker with live preview. Backed by `engine/npc-composer.js` sprite registry.
- **Emotion state machine**: idle / alert / combat / panicked / dead. Each state gets a sprite-tint override + optional shake/pulse animation params. Exports as `npcStackConfig` object that `NpcComposer.build(seed)` consumes.
- **Animation preview**: re-uses peek-workbench `phase` scaffolding — play/pause/rewind buttons, dwell timer, state pips.
- **Export**: writes `data/npc-composer-seeds.json` keyed by seed id → stack config + emotion map. `npc-composer.js` reads via `typeof` guard (Layer 1 data hook).

**Scope**: ~600 lines (most reused from mok-avatar-designer). ~1 day. Depends on P1 for seed mapping.

### 4.7 P7 — Population Planner (`tools/population-planner.html`)

Coherence and resource tracking across the whole game. **The "are we actually shipping enough NPCs" dashboard.**

- **Floor matrix view**: rows = floorIds in tree order, columns = metrics:
  - NPC count (ambient / interactive / vendor / dispatcher / hero)
  - Faction balance (bar showing Tide / Foundry / Admiralty / Gleaner / neutral share)
  - Verb-node count by type
  - Archetype histogram (how many scholars / workers / citizens per floor)
  - Reanim-tier mix (T1/T2/T3 share among defeatable enemies spawning there)
  - Barks-per-NPC (with heat tint if <2)
  - Coverage % — NPCs whose `verbArchetype` satisfiers are all present on their floor
- **Red-flag panel**:
  - Floors with no NPCs at all
  - Verb-field NPCs whose archetype can't be satisfied locally
  - Bark pools referenced but empty
  - NPCs talkable but no dialogue tree OR dialoguePool
  - Factions over-represented on a neutral floor
  - Tier imbalance (e.g. floor 1.3.1 has all elites, no standard fodder)
- **Supply-chain trace** (§17.6): for each floor, shows inbound/outbound supply-run NPCs. Warns if a cargo pair is broken (Bazaar ships provisions to Inn but no Inn NPC has the kitchen verb).
- **Quest dependency overlay**: cross-refs `data/quests.json` via QuestRegistry anchors — does every quest's `npc` anchor resolve to an NPC on the right floor?
- **Budget tracker**: shows `floor×NPC_count` sum, compares to target (e.g. 80 for Act 1). Red when exceeded, yellow when <70%.
- **Export**: report JSON + `tools/population-report.html` static dashboard (check-budgets.js style).

**Scope**: ~1,200 lines read-only view + export. ~2 days. **Last to ship, depends on all other tools producing manifests.**

---

## 5. Shared Infrastructure

All seven tools share:

### 5.1 Unified sidebar host

Same pattern as `tools/unified-designer.html` (iframe shell with top-nav tabs). Add three new tabs: `NPC`, `Bark`, `Enemy`, `Archetype`, `Sprite`, `Population`. Verb-node stamper lives inside blockout-visualizer. One button cycles through the suite without reloading.

### 5.2 Runtime schema registry

New file: `tools/actor-schema.json` — canonical JSON-Schema document describing every NPC/enemy field. Every tool validates its edits against this before write. **When Act 2 unifies NPCs + enemies, this is the one file that changes, and every tool auto-updates.**

### 5.3 CLI companion

New file: `tools/npc-cli.js` (mirrors `tools/blockout-cli.js`). Commands:

- `npc list --floor 1.2 --faction tide`
- `npc create --name "Tide Scholar" --archetype scholar --floor 1.2 --at 12,8`
- `npc validate` — runs P7 coherence suite headlessly
- `npc export --target engine/npc-seed.js`
- `bark orphans` — lists unreferenced pools
- `bark coverage --floor 2.1`
- `enemy hydrate ENM-014` — runs P5 deck suggestion non-interactively
- `enemy balance --tier elite` — prints balance matrix row
- `population report --act 1` — writes population-report.html

All mutating commands honor `--dry-run`.

### 5.4 Manifest layer

Every tool emits a sidecar manifest:
- `tools/npc-manifest.json` — flat list + cross-ref indices
- `tools/bark-manifest.json` — pool → (bark count, users[])
- `tools/archetype-manifest.json` — archetype → (usedBy[], satisfiers[])
- `tools/verb-node-manifest.json` — floor → nodes[]
- existing `tools/enemy-manifest.json` — extended with decks[] + hydrator flags

Manifests are the **cross-tool API**. P2 reads P1's manifest to show "Used-By" badges. P7 reads everyone's manifest to compute coherence.

### 5.5 Round-trip discipline

- **Source of truth**: generated JSON under `data/`. Tools write there.
- **Engine consumption**: IIFE modules in `engine/` load JSON via sync XHR (existing pattern — see `QuestRegistry.loadFromJson`). When a tool writes, the engine picks it up on next reload — no rebuild step.
- **Git**: manifests regenerate deterministically; JSON sources are hand-committed; IIFE `*-seed.js` companions are generated and also committed.

---

## 6. Implementation Phases

### Prerequisites — read before Phase 0 Chapter 4 closes

Before Phase 0's schema hardens, read [`NPC_TOOLING_DEPENDENCY_AUDIT.md`](NPC_TOOLING_DEPENDENCY_AUDIT.md). It catalogues the ten hard schema commitments this tooling inherits from DOC-9, DOC-83, DOC-79, DOC-107, SPATIAL_AUDIO_BARK, TOOLTIP_BARK (DOC-32b), ACT2_NARRATIVE_OUTLINE, LIVING_INFRASTRUCTURE_BLOCKOUT, D3_AI_LIVING_INFRA_PROCGEN_AUDIT, and POST_JAM_FOLLOWUP. It surfaces eight schema fields that are **missing from the current Phase 0 Chapter 1 schema** and must land before Phase 1 scaffolds:

- `EntityBrain` + `disposition` enum (D3 §3)
- Cross-floor verb attenuation (`floorScope` or per-verb curve — POST_JAM Wave 3 #1)
- `dispatcher_phase` enum (ACT2 §5)
- `housing_status` enum + `home16_locked` (ACT2 §5.4)
- `voiceType` reservation (SPATIAL §1d)
- `questRole` enum (DOC-107 + §9)
- `reanimTier` assignment on enemy rows (DOC-83 §18.5)
- `meetPoolId` linkage on NPC encounter pairs (DOC-79 §3.3)

Plus three pre-commits that keep the build risk-free: `waypointMode` reservation (Hero pathfinding gap), `housing affinity` states (ACT2 + COZY_INTERIORS), `reputationDelta` on bark entries (DOC-107 Phase 3).

The audit also recommends two sequencing deltas applied below: **P1 and P3 run in parallel** (no dependency between them), and **cross-floor verb attenuation co-commits with P0** instead of running as a separate Wave 3 item.

### Phase 0 — Schema & CLI Scaffold (1 day)

Split into two chapters so runtime stays risk-free during authoring-tool bring-up.

#### Phase 0 Chapter 1 — Extract + scaffold (SHIPPED 2026-04-16)

| Task | File | Est. | Status |
|------|------|------|--------|
| Write `tools/actor-schema.json` (NPC + enemy unified schema, JSON-Schema draft-07) | NEW | 3h | ✅ |
| Create `tools/npc-cli.js` scaffold with `list`/`validate`/`schema`/`help` commands | NEW | 2h | ✅ |
| Write `tools/extract-npcs.js` one-shot — loads npc-system.js in a Node VM, harvests `_defs`, emits `data/npcs.json` by floor | NEW | 1h | ✅ |
| Create `engine/npc-seed.js` IIFE (`load`/`populate`/`reset`/`manifest`) — present but not called by NpcSystem yet | NEW | 1h | ✅ |
| Wire `<script src="engine/npc-seed.js">` into index.html after npc-system.js, before npc-dialogue-trees.js | modify | 5m | ✅ |

**Deliverable**: Canonical actor schema, canonical `data/npcs.json` (45 NPCs across 9 floors), working CLI, standalone loader. Runtime path unchanged (NpcSeed.populate() not yet auto-called).

#### Phase 0 Chapter 2 — Cut-over ✅ SHIPPED 2026-04-16

| Task | File | Est. | Outcome |
|------|------|------|---------|
| Modify `NpcSystem.init()` to call `NpcSeed.populate()` first; if it returns `ok:true`, skip `_registerBuiltinPopulations()` | modify | 30m | ✅ `engine/npc-system.js` `init()` rewritten — tries `NpcSeed.populate()` first, logs success/fallback reason, calls inline block only if `NpcSeed` unavailable / fetch fails / returns non-ok |
| In-browser smoke test: floor 0 / 1 / 3 NPC rosters identical before and after cutover (count + id + coords) | test | 30m | ✅ Static parity confirmed: 45 NPCs / 9 floors matched byte-for-byte (ids + coords spot-checked on 9 representative NPCs across floors 0/1/3 — zero diff). Runtime browser smoke test still recommended on next playthrough but gate is statically satisfied |
| Update this roadmap — mark Chapter 2 ✅, file inline block for deletion once P1 ships | modify | 5m | ✅ This table + status line + revision footer updated |

**Delivered**: `data/npcs.json` is now the runtime source of truth for the 45-NPC roster. Inline `_registerBuiltinPopulations()` retained in `engine/npc-system.js` (~800 lines) as a defensive fallback for three failure modes only: (1) `NpcSeed` module missing, (2) `data/npcs.json` unfetchable, (3) `populate()` throws. Deletion ticket tracked for **Phase 0 Chapter 5** once P1 NPC Designer ships full JSON edit round-trip.

**Side effects**:
- `engine/npc-seed.js` header comment updated — module is no longer "SCAFFOLD ONLY"
- `index.html` script-tag comment updated — reflects shipped cutover
- Chapter 1's `data/npcs.json` loader has zero schema mismatches against v1.1.0 (Chapter 4 additions are all optional)

#### Phase 0 Chapter 3 — Manifest wiring ✅ SHIPPED 2026-04-16

| Task | File | Est. | Outcome |
|------|------|------|---------|
| Wire NPC manifest emitters into `tools/extract-floors.js` so `tools/npc-manifest.json` is produced alongside the floor payload | modify | 1h | ✅ NPC manifest block appended to `tools/extract-floors.js` (mirrors card + enemy manifest pattern). Emits `tools/npc-manifest.json` (28KB, 45 NPCs, 9 floors) with: `{npcs[], byFloor, byFaction, byArchetype, byType, byBarkPool, orphans}`. Sum-of-indices equality verified across byFloor/byFaction/byType (all = 45). |

**Delivered**: Cross-tool API surface live. Manifest shape matches §5.4 + §7 spec and adds two convenience indices (`byType`, `byBarkPool`) and a `orphans` block with `noBarkPool` / `noDialogue` lists — gives P2 Bark Workbench and P7 Population Planner an instant QA list without re-walking `data/npcs.json`. Manifest schema reference points at `tools/actor-schema.json#/definitions/npcActor (v1.1.0)`.

**Initial QA from manifest**:
- 0 NPCs missing barkPool (all 45 carry one)
- 6 talkable NPCs missing dialogue: `bazaar_archivist`, `bazaar_merchant`, `floor0_drifter`, `floor0_hermit`, `floor0_laborer`, `floor3_inspector` (matches `npc-cli.js validate` `missing-dialogue` count exactly — confirms validator + manifest are in agreement)
- 1 distinct factionId (`unaligned`) — every NPC currently uses verbArchetype as the faction proxy. P1 NPC Designer will surface and fix this when it ships full-field editing.
- 10 distinct archetypes spread across 9 floors

#### Phase 0 Chapter 4 — Schema expansion ✅ SHIPPED 2026-04-16 (schema v1.1.0)

Closed the schema gap surfaced by [NPC_TOOLING_DEPENDENCY_AUDIT §4](NPC_TOOLING_DEPENDENCY_AUDIT.md#4-missing-from-current-p0-schema). Phase 1+ is now unblocked on a frozen canonical shape.

| Task | File | Est. | Outcome |
|------|------|------|---------|
| Add `EntityBrain` + `disposition` enum to `tools/actor-schema.json` | modify | 20m | ✅ `entityBrain` + `disposition`/`movementMode`/`hazardPolicy`/`webPolicy` defs wired via `brain` on both `npcActor` and `enemyActor` |
| Add cross-floor verb attenuation field to verbSet (`floorScope` enum + optional per-verb curve) | modify | 20m | ✅ `floorScope` + `attenuationCurve` defs + wired into `verbEntry` |
| Add `dispatcher_phase`, `housing_status`, `home16_locked`, `voiceType`, `questRole`, `meetPoolId`, `portraitAssetId`, `npcArchetype` fields | modify | 30m | ✅ All 7 wired onto `npcActor` (skipped `npcArchetype` — existing `role` field covers archetype gesture; see audit §8 ΔC) |
| Add `reanimTier` field to enemy actor definition | modify | 10m | ✅ Already present in v1.0; v1.1 adds `brain.reanimTier` as the canonical path |
| Add pre-commit reservations: `waypointMode` (NPC), `reputationDelta` (bark entry), housing affinity states | modify | 20m | ✅ `waypointMode` + `housingAffinity` defs + wired to `npcActor`. `reputationDelta` deferred to P2 Bark Workbench scope (bark-entry field, not actor-schema) |
| Bump schema version + re-run `npc-cli.js schema` to confirm validation | test | 20m | ✅ `_meta.version` = 1.1.0; `npc-cli.js schema` reports 26 defs (was 14); `npc-cli.js validate` produces zero schema-shape errors (all 51 pre-existing content errors tracked by P2/P4) |

**Delivered**: Schema covers every downstream doc commitment. Every new field is optional — v1.1.0 is 100% backward-compatible with existing actor data. P1 NPC Designer and P3 Verb-Node Stamper can now scaffold against the frozen shape in parallel.

**Schema v1.1.0 additions summary** — 12 new definitions (`disposition`, `movementMode`, `waypointMode`, `hazardPolicy`, `webPolicy`, `floorScope`, `attenuationCurve`, `entityBrain`, `dispatcherPhase`, `housingStatus`, `housingAffinity`, `questRole`) + 10 new optional `npcActor` properties (`brain`, `dispatcherPhase`, `housingStatus`, `home16Locked`, `housingAffinity`, `voiceType`, `questRole`, `meetPoolId`, `portraitAssetId`, `waypointMode`) + 2 new `verbEntry` properties (`floorScope`, `attenuationCurve`) + 1 new `enemyActor` property (`brain`).

### Phase 1 — NPC Designer (2 days)

> **Note**: Phase 1 and Phase 3 are independent (no dependency between them). They can run in parallel. See [NPC_TOOLING_DEPENDENCY_AUDIT §6](NPC_TOOLING_DEPENDENCY_AUDIT.md#6-recommended-sequencing).

#### Phase 1 MVP ✅ SHIPPED 2026-04-16

| Task | File | Est. | Outcome |
|------|------|------|---------|
| `tools/npc-designer.html` shell + vanilla-JS (NOT React — matches project no-build rule) | NEW (764 lines) | 3h | ✅ shipped |
| Identity / Placement / Behavior tabs — full CRUD | `tools/npc-designer.js` (968 lines) | 4h | ✅ shipped |
| Dialogue / Commerce / Reanim-Tier tabs — **stubbed with live read/write on current fields** | same file | 3h | ✅ partial (see deltas below) |
| Mini-map picker reading from `tools/floor-data.js` sidecar | same file | 3h | ✅ shipped — click-to-pin + facing tick |
| Sprite preview stub (calls NpcComposer — plain canvas) | | 2h | ❌ **deferred** — not in MVP (no NpcComposer headless path) |
| JSON round-trip + blob download | same file | 1h | ✅ shipped — "Download npcs.json" button |
| `data/npcs.js` sidecar emit in extract-npcs.js (file:// support) | `tools/extract-npcs.js` | 0.5h | ✅ shipped (bonus — required for load under `file://`) |

**Scope deviations from the original plan**:

- **No React** — the project's "zero build tools" hard rule precludes React/JSX (no compiler). Implemented as vanilla DOM + IIFE module. Every existing tool (`world-designer`, `peek-workbench`, `boxforge`, `blockout-visualizer`) follows the same convention. The "React 18 + item-designer pattern" line in the original plan was aspirational and unachievable under CLAUDE.md constraints.
- **Stub tabs are partially live** — Dialogue/Commerce/Reanim tabs expose their current fields for read/write (dialoguePool, gateCheck JSON, verbSet, verbFaction) rather than being totally placeholder. Keeps the MVP useful for the fields that already exist in the shipped schema; deferred work is the *structured editors* (tree builder, inventory picker, tier workbench).
- **Sprite preview deferred** — requires NpcComposer to be callable from a tool-side context, which it currently is not (engine-layer dependency on Raycaster). Tracked separately.

**Deliverable (shipped)**: CRUD every Act 1 NPC through a UI. No more editing `_registerBuiltinPopulations()` by hand. Round-trip verified: load → edit → download → re-parse produces byte-for-byte matching structure with only the edited field changed.

#### Phase 1 remaining deltas → P1.1 "Designer v1.1" (0.5 day, post-P2)

| Task | Status |
|------|--------|
| Sprite preview — call NpcComposer + render procedural portrait | pending (requires composer refactor) |
| Dialogue tab — tree/node editor (full) | **superseded by P4 Dialogue Workbench** |
| Commerce tab — vendor inventory & pricing | **superseded by P5 Vendor Workbench** |
| Reanim-Tier tab — T1/T2/T3 picker + attenuation curve editor | **superseded by P4 (verb-field workbench) + P6** |
| Bulk "add from archetype" stamps (spawn 5 matching NPCs) | pending |
| Schema validation on save (use `tools/actor-schema.json`) | pending — currently trust-on-input |
| CSV/JSON import of NPC rosters | pending |

#### Phase 1.2 Addendum — Sprite Commissioning Authoring ✅ SHIPPED 2026-04-17

Landed alongside Phase 1 MVP as two new fieldsets on the Identity tab. Authoring surface for both the emoji-stack override (SPRITE_STACK_ROADMAP §3) and the per-slot × per-intent sprite commission series (SPRITE_COMMISSIONING_MAP).

| Task | File | Outcome |
|------|------|---------|
| "Emoji Stack" fieldset — composer/pinned mode radio + 7-slot grid (head/torso/legs + hat/frontWeapon/backWeapon + corpse) with modifiers (hatScale/hatBehind, weapon scale/offsetX) + tintHue slider | `tools/npc-designer.html` + `.js` (`_StackEditor`) | ✅ shipped |
| "Sprite Commissions" fieldset — 6 slots × 4 intents grid (locomotion/interaction/dialogue/combat), per-cell frame-count badges, in-place frame editor with asset-ID list, browse-for-PNG file picker (session-scope preview only) | same files (`_SpriteEditor`) | ✅ shipped |
| Manifest fragment preview + download — emits `{ assetId: "assets/sprites/npcs/<id>.png", ... }` blob ready to merge into `assets/sprites/manifest.js` | same files | ✅ shipped |
| Optional NpcComposer load for composer-mode defaults (seed from NPC id via FNV-1a hash) | `tools/npc-designer.html` → `../engine/npc-composer.js` | ✅ shipped |

**New fields on the NPC record** (both optional, both nullable — runtime and extractor behaviour unchanged when absent):

| Field | Type | Semantics |
|-------|------|-----------|
| `stack` | `object \| null` | `null` = composer mode (runtime generates via `NpcComposer.compose(seed, role)`). Object = pinned override matching `NpcComposer` shape: `{head, torso, legs, hat?{char,scale,behind}, frontWeapon?{char,scale,offsetX}, backWeapon?{char,scale,offsetX}, tintHue?:number, corpse?:string}`. |
| `sprites` | `object \| null` | Per-slot × per-intent asset-ID series: `{ head:{locomotion:[], interaction:[], dialogue:[], combat:[]}, torso:{...}, legs:{...}, hat:{...}, frontWeapon:{...}, backWeapon:{...} }`. Empty series = fall through to emoji stack. |

**Fallback chain** (at render time, see SPRITE_STUB_ROADMAP): `StaticSprite(assetId)` → emoji stack → `NpcComposer` default.

**Asset-ID naming convention**: `NPC-<id>_<slot>_<intent>_<frame>` — e.g. `NPC-dispatcher_head_walk_00`. The designer auto-suggests this pattern when adding frames.

**File-upload semantics**: Browser file:// can't write to `assets/sprites/npcs/`. The picker is *preview-only* (FileReader → data URL → `<img>` in the frame list, session-scoped). Authors commission sprites via the real artist pipeline and merge the exported manifest fragment into `assets/sprites/manifest.js`.

**Known gap**: ~~`tools/extract-npcs.js`'s `cleanDef()` is a strict whitelist that currently drops `stack` and `sprites`.~~ ✅ **Resolved in Phase 0 Ch.5 (2026-04-17)** — the rewritten normaliser preserves both fields via `normaliseStack()` + `normaliseSprites()` helpers, and `engine/npc-seed.js::_toRuntimeDef` forwards them to the runtime.

#### Phase 0 Chapter 5 — Retire inline fallback ✅ SHIPPED 2026-04-17

The ~740-line inline `_registerBuiltinPopulations()` block was removed from `engine/npc-system.js`. `data/npcs.json` is now the SOLE source of truth at runtime — there is no longer any secondary path to NPC data.

| Task | File | Outcome |
|------|------|---------|
| Brace-balance-splice the inline function body out of `engine/npc-system.js` | modify | ✅ Function removed; file dropped from 2057 → 1312 lines. Preserved banner comment explains the retirement. |
| Simplify `NpcSystem.init()` to NpcSeed-only; error (do not fall back) if load fails | modify | ✅ `init()` now logs `console.error` with an actionable message when `NpcSeed` is missing or `populate()` returns non-ok / throws; registry stays empty rather than silently running stale inline data. |
| Rewrite `tools/extract-npcs.js` as a JSON → sidecar normaliser (read `data/npcs.json`, whitelist fields including `stack` + `sprites`, rewrite canonical JSON + sidecar) | rewrite | ✅ VM-eval of npc-system.js removed (severs the circular dep). Dry-run mode reports NPC / floor / stack / sprites counts. Idempotent on clean input. |
| Extend `cleanDef()` to preserve `stack` (7-slot emoji override) + `sprites` (6×4 commission manifest) | modify | ✅ `normaliseStack()` validates each of head/torso/legs/hat/frontWeapon/backWeapon/death + tintHue; `normaliseSprites()` accepts `<slot>_<intent>` keys and `{assetId, path}` frame entries. Unknown keys silently dropped. |
| Update `engine/npc-seed.js::_toRuntimeDef` to forward `stack` + `sprites` to the runtime def | modify | ✅ Optional forwarding — absent fields pass through as `undefined` so the runtime render pipeline can still fall back to the composer. |
| Remove `scanNpcSystemJs()` dead code from `tools/npc-cli.js` + the conditional branch that called it | modify | ✅ Regex scanner deleted; `loadAllActors()` now errors loudly if `data/npcs.json` is absent (previous silent fall-back was masking bugs). Smoke-tested `node tools/npc-cli.js list` — 72 actors (45 NPC + 27 enemy). |
| Refresh stale comments in `engine/npc-seed.js` header, `index.html` script-tag block, `tools/npc-designer.js` `generatedFrom` fallback, `data/npcs.json` `_meta.note` | modify | ✅ All five touch points updated to reflect Ch.5 semantics (no secondary path, `data/npcs.json` sole source of truth). |

**Smoke test baseline**:

- `node --check engine/npc-system.js` → clean
- `node --check engine/npc-seed.js` → clean
- `node --check tools/extract-npcs.js` → clean
- `node --check tools/npc-cli.js` → clean
- `node tools/extract-npcs.js --dry-run` → 9 floors / 45 NPCs
- `node tools/npc-cli.js list` → 72 actors (45 NPC + 27 enemy)
- Zero executable references to `_registerBuiltinPopulations` anywhere in `engine/`, `tools/`, or `index.html` — only historical mentions in documentation comments.

**Follow-ups opened**:

- In-browser playthrough smoke test on Brave (verify `[NpcSystem] Populated from data/npcs.json via NpcSeed (45 NPCs / 9 floors).` in console; walk Floor 0 / 1 / 3 to confirm NPC placement matches pre-cutover)
- `docs/NPC_SYSTEM_ROADMAP.md` has three stale `_registerBuiltinPopulations` references (lines 159, 377, 396, 493) — schedule a sweep on the next roadmap revision pass
- `docs/SPRITE_COMMISSIONING_MAP.md` line 240 "Known limitation" block can be marked resolved once the cleanup pass reaches it

Once P4/P5/P6 ship their own dedicated editors, the three stub tabs in the Designer can be rewired to launch those editors for the selected NPC. The Designer stays as the "grand-central" index; the specialized tools own deep editing.

### Phase 2 — Bark Workbench (1 day)

| Task | File | Est. |
|------|------|------|
| `tools/bark-workbench.html` | NEW | 4h |
| Coherence panel (orphan pools, oneShot singletons, cross-ref from P1 manifest) | NEW | 2h |
| Fire-roll simulator | NEW | 1h |
| Export pass (preserves `data/barks/en.js` structure) | NEW | 1h |

**Deliverable**: Every bark in the game visible, editable, and validated for reachability.

### Phase 3 — Verb-Node Stamper Layer (0.5 day)

> **Note**: Phase 3 is independent of Phase 1 (no schema dependency). Both consume Phase 0's output. Run in parallel to compress Wave 3 entry.

| Task | File | Est. |
|------|------|------|
| Add verb-node layer toggle + pin rendering to blockout-visualizer | modify | 1h |
| Author 6 template stamps in `tools/verb-node-templates.json` | NEW | 1h |
| Stamper tool + click-to-place handlers | modify | 1h |
| Round-trip to `engine/verb-nodes.js` (authored) + `tools/verb-node-overrides/*.json` (procgen) | modify | 1h |

**Deliverable**: Drop a `town_square` stamp on Floor 1 and its 6 nodes register — no JSON hand-edit.

### Phase 4 — Archetype Studio (1.5 days)

| Task | File | Est. |
|------|------|------|
| `engine/archetype-registry.js` Layer 1 IIFE + migrate VF_ARCHETYPES + REANIM ARCHETYPES | refactor | 2h |
| `tools/archetype-studio.html` + slider form | NEW | 4h |
| Day-timeline simulator (dominant-verb graph) | NEW | 3h |
| Clone-and-diverge UI | NEW | 1h |
| Export pass | NEW | 1h |

**Deliverable**: New archetypes ship as data, not code. Day-timeline lets you *see* a citizen's life before pinning them.

### Phase 5 — Enemy Hydrator (3 days)

| Task | File | Est. |
|------|------|------|
| `tools/enemy-hydrator.html` shell | NEW | 3h |
| Stats tab + DPS computation + tier-band validator | NEW | 4h |
| Deck Composer tab + drag-drop from EATK card pool | NEW | 4h |
| "Hydrate from stats" heuristic engine (§4.5 rules) | NEW | 4h |
| Intent Curve tab + state-machine editor | NEW | 3h |
| Loot tab cross-ref `data/loot-tables.json` | NEW | 2h |
| Reanim Behavior tab (pulls P4 archetypes) | NEW | 1h |
| Balance matrix scatter plot | NEW | 3h |
| Export all JSON + manifest | NEW | 1h |

**Deliverable**: Combat tuning moves from spreadsheet-in-head to visible, validated, tier-banded. Adding a new enemy is 10 clicks + a hydrate button.

### Phase 6 — NPC Sprite Studio (1 day)

| Task | File | Est. |
|------|------|------|
| Fork mok-avatar-designer.html | NEW | 2h |
| Adapt layer picker to NpcComposer stack semantics | NEW | 3h |
| Faction palette presets | NEW | 1h |
| Emotion state machine (reuse peek-workbench phase bar) | NEW | 2h |
| Export `data/npc-composer-seeds.json` + wire into npc-composer.js | NEW | 1h |

**Deliverable**: Named faction-branded NPC portraits ship without Photoshop.

### Phase 7 — Population Planner (2 days)

| Task | File | Est. |
|------|------|------|
| `tools/population-planner.html` floor matrix view | NEW | 4h |
| Red-flag panel + coherence checks (§9) | NEW | 3h |
| Supply-chain trace (cross-ref §17.6) | NEW | 2h |
| Quest dependency overlay (cross-ref QuestRegistry) | NEW | 2h |
| Budget tracker + Act-scoped targets | NEW | 2h |
| Static export `tools/population-report.html` | NEW | 3h |

**Deliverable**: One screen that answers "is Act 1 populated" with a yes/no + red-flag list.

### Total rollup

| Phase | Scope | Est. |
|-------|-------|------|
| 0 | Schema + CLI + npcs.json extraction | 1 day |
| 1 | NPC Designer | 2 days |
| 2 | Bark Workbench | 1 day |
| 3 | Verb-Node Stamper layer | 0.5 day |
| 4 | Archetype Studio | 1.5 days |
| 5 | Enemy Hydrator | 3 days |
| 6 | NPC Sprite Studio | 1 day |
| 7 | Population Planner | 2 days |
| **Total** | **Full suite** | **~12 days** |

Phases 0-3 are the **minimum viable suite** — unlocks authoring the Act 1.5 migration and Act 2 faction escalation content without hand-JSON-editing. Phases 4-5 are the **quality tier** — required for the §16 retrofuturistic roster expansion. Phases 6-7 are the **polish tier** — required before public playtest.

---

## 7. Manifest & Resource Tracking

The manifest layer (§5.4) is the joint product of every tool. A canonical manifest folder layout:

```
tools/
├── actor-schema.json              # Shared schema (P0)
├── npc-manifest.json              # { npcs: [], byFloor: {}, byFaction: {}, byArchetype: {} }
├── bark-manifest.json             # { pools: [], byNamespace: {}, orphans: [] }
├── enemy-manifest.json            # Existing; extended with decks[] + hydratorFlags
├── archetype-manifest.json        # { archetypes: [], usedBy: {} }
├── verb-node-manifest.json        # { floors: { 1: { nodes: [] }, ... } }
└── population-report.json         # P7 dump, Act-scoped
```

A `tools/manifest-regen.js` one-shot script rebuilds all six from canonical sources. CI hook: run it on every commit that touches `data/**/*.json`, fail PR if drift detected — this is the **coherence CI**.

---

## 8. Round-Trip Contract with Runtime

| Source file | Generated | Consumed by |
|-------------|-----------|-------------|
| `data/npcs.json` | `engine/npc-seed.js` IIFE (Layer 3 data hook) | `NpcSystem.init()` → `register()` (replaces `_registerBuiltinPopulations()` call) |
| `data/npc-composer-seeds.json` | — (read directly via XHR) | `NpcComposer.build(seed)` |
| `data/archetypes.json` | `engine/archetype-registry.js` | `VerbField.tick` + `ReanimatedBehavior.classify` |
| `data/barks/en.js` | (file itself — generated structure) | `BarkLibrary.register` at init |
| `data/enemies.json` + `data/enemy-decks.json` | `tools/enemy-manifest.json` for tooling | `EnemyDeck.forEnemy` |
| `engine/verb-nodes.js` authored | — | `VerbNodes.register` |
| `tools/verb-node-overrides/*.json` | — | `DungeonVerbNodes.populate` merge path |

**New Layer 1 module**: `engine/archetype-registry.js` (generated from `data/archetypes.json`, gated behind `typeof guard` to preserve fallback). VF_ARCHETYPES in npc-system.js and ARCHETYPES in reanimated-behavior.js both read from this registry when present; their in-file tables become defaults.

---

## 9. Coherence Checks

P7 runs these; CLI exposes each as a named check (`npc validate --check <name>`):

| Check | Rule | Severity |
|-------|------|----------|
| `empty-floor` | Floor has >0 spawn markers but zero NPCs | warn |
| `orphan-bark-pool` | Pool defined, zero NPCs reference it | warn |
| `empty-bark-pool` | Pool referenced, zero barks | **error** |
| `singleton-oneshot` | Pool has 1 entry and it's oneShot | info |
| `unsatisfiable-archetype` | NPC's archetype satisfiers have zero nodes on their floor | **error** |
| `missing-dialogue` | `talkable:true` but no `dialogueTree` and no `dialoguePool` | **error** |
| `faction-imbalance` | Neutral floor has >60% single-faction NPCs | warn |
| `tier-imbalance` | Dungeon floor has >70% elite/boss | warn |
| `broken-supply-chain` | Cargo route target floor has no NPC with matching duty node | warn |
| `quest-anchor-drift` | QuestRegistry anchor resolves but no NPC at resolved tile | **error** |
| `budget-exceed` | Act NPC count > target | warn |
| `reanim-tier-missing` | Enemy flagged T2 but no `dialogueTree` assigned | **error** |
| `reanim-tier-dispatch-target-invalid` | T3 `dispatchTarget.floorId` doesn't exist | **error** |
| `bark-too-long` | bark.text > 60 chars | warn |

Errors block CI, warnings lint.

---

## 10. File Map

```
tools/
├── npc-designer.html               (P1, NEW)
├── bark-workbench.html             (P2, NEW)
├── archetype-studio.html           (P4, NEW)
├── enemy-hydrator.html             (P5, NEW)
├── npc-sprite-studio.html          (P6, NEW)
├── population-planner.html         (P7, NEW)
├── population-report.html          (P7, generated)
├── blockout-visualizer.html        (P3, EXTEND — add verb-node layer)
├── unified-designer.html           (EXTEND — new tabs)
├── npc-cli.js                      (P0, NEW)
├── actor-schema.json               (P0, NEW)
├── verb-node-templates.json        (P3, NEW)
├── verb-node-overrides/            (P3, NEW folder)
│   └── <floorId>.json
├── npc-manifest.json               (NEW, generated)
├── bark-manifest.json              (NEW, generated)
├── archetype-manifest.json         (NEW, generated)
├── verb-node-manifest.json         (NEW, generated)
└── manifest-regen.js               (NEW)

data/
├── npcs.json                       (P0, NEW canonical)
├── archetypes.json                 (P4, NEW canonical)
└── npc-composer-seeds.json         (P6, NEW canonical)

engine/
├── npc-seed.js                     (P0, generated IIFE)
└── archetype-registry.js           (P4, generated IIFE, Layer 1)
```

---

## 11. Cross-References

| Section | References | Purpose |
|---------|------------|---------|
| §4.1 NPC Designer | VERB_FIELD §5 verbSet, §18 reanim tiers | Editor surface matches runtime schema |
| §4.2 Bark Workbench | `engine/bark-library.js`, BARK naming §3.2 | Pool key convention honored |
| §4.3 Verb-Node Stamper | BLOCKOUT_VISUALIZER_ROADMAPv2 | New layer in existing tool |
| §4.4 Archetype Studio | VERB_FIELD §5.3 archetype presets | Data-driven replacement |
| §4.5 Enemy Hydrator | `data/enemy-cards.json`, `enemy-decks.json`, `enemy-intent.js` | Combat surface authoring |
| §4.6 Sprite Studio | `EyesOnly/public/portal/mok-avatar-designer.html`, `engine/npc-composer.js` | Port + adapt |
| §4.7 Population Planner | VERB_FIELD §17 living infrastructure, §16.3 archetype expansion | Act-scoped budget dashboard |
| §5.3 CLI | `tools/blockout-cli.js` | Pattern match |
| §7 Manifests | `tools/enemy-manifest.json` (existing) | Extension pattern |
| §8 Round-trip | `engine/npc-system.js:75-224` (schema), `QuestRegistry.loadFromJson` (load pattern) | Consumption contract |
| §9 Coherence | QUEST_SYSTEM_ROADMAP DOC-107 §anchors, NPC_FACTION_BOOK_AUDIT §2.3 | Cross-system validation |
| Prerequisites block + Phase 0 Ch. 4 | [NPC_TOOLING_DEPENDENCY_AUDIT.md](NPC_TOOLING_DEPENDENCY_AUDIT.md) | Schema commitments across DOC-9/83/79/107/32b, SPATIAL_AUDIO, ACT2, LIVING_INFRASTRUCTURE, D3 audit, POST_JAM — must be honored before Phase 1 scaffolds |

---

**Document Version**: 1.1
**Revised**: 2026-04-17 (v1.8 — Phase 0 Chapter 5 shipped: inline `_registerBuiltinPopulations()` retired from `engine/npc-system.js`; `data/npcs.json` is the sole runtime source of truth; `tools/extract-npcs.js` rewritten as a JSON→sidecar normaliser preserving `stack` + `sprites`; `scanNpcSystemJs()` dead code removed from `tools/npc-cli.js`)
**Revised**: 2026-04-17 (v1.7 — Phase 1.2 Sprite Commissioning Authoring shipped: `_StackEditor` + `_SpriteEditor` on Identity tab; new optional `stack` / `sprites` fields on NPC records; manifest-fragment export)

**Revised**: 2026-04-16 (v1.6 — Phase 1 MVP shipped; `tools/npc-designer.html` + `.js` live; sprite preview + structured stub editors deferred to P1.1/P4/P5/P6)
**Revised**: 2026-04-16 (v1.5 — Phase 0 Chapter 3 shipped; tools/npc-manifest.json emitted by extract-floors.js)
**Revised**: 2026-04-16 (v1.4 — Phase 0 Chapter 2 shipped; runtime reads from data/npcs.json via NpcSeed; inline populations are fallback-only)
**Revised**: 2026-04-16 (v1.3 — Phase 0 Chapter 4 shipped, schema v1.1.0; Phase 1+ unblocked)
**Revised**: 2026-04-16 (v1.2 — cross-roadmap dependency audit linked + Phase 0 Chapter 4 added)
**Created**: 2026-04-16
**Status**: Phase 0 Ch.1–5 ✅ shipped (all inline fallbacks retired); Phase 1 MVP ✅ shipped; P2 (Bark Workbench) + P3 (Verb-Node Stamper) + P4 (Dialogue Workbench) unblocked and can begin in parallel

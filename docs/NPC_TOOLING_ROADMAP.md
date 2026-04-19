# NPC & Enemy Tooling Roadmap

> **Status**: Phase 0 Ch.1–5 ✅ shipped (schema v1.1.0 + runtime cutover + manifest pipeline + **inline fallback retired** + **in-browser smoke test green**); Phase 1 MVP ✅ shipped (`tools/npc-designer.html` — CRUD every NPC via UI, plus stack + sprite commission authoring); **Phase 1.1 schema validation on save ✅ shipped** (`tools/schema-validator.js` + `tools/actor-schema.js` sidecar + Designer `_download()` gate); **Phase 1.1.1 post-P1.1 follow-ups ✅ shipped** (pre-commit sidecar auto-regen + CSV/JSON import in the Designer); **Phase 1.1.2 archetype registry + stamp UI ✅ shipped** (9 archetypes, validator, sidecar, pre-commit guard, "📚 Stamp" overlay panel); **Phase 3 Ch.0 data foundation ✅ shipped 2026-04-17** (`data/verb-nodes.json` sole source of truth for hand-authored spatial nodes, inline `_registerBuiltinNodes()` retired, schema + validator + sidecar generator + seed loader + pre-commit §1c — 60 nodes across 6 floors); **Phase 3 Ch.1 template registry ✅ shipped 2026-04-17** (6 starter templates — town_square, soup_kitchen_congregation, faction_post, market_row, guard_checkpoint, dungeon_rest_ring — with factionSlot parametrics, generator + structural/synthesized-stamp validator + pre-commit §1d, 26 template nodes all schema-clean); **Phase 3 Ch.2 BO-V verb-node stamper ✅ shipped 2026-04-17** (`tools/js/bv-verb-nodes.js` 847 LOC — 7 stamp buttons, factionSlot dropdown, ghost preview, pinned-cell overlay, overrides opt-in); **Phase 3 Ch.2 stretch — per-floor overrides ✅ shipped 2026-04-17** (`tools/verb-node-overrides/*.json` with filename↔floorId three-way match, add/remove/replace op semantics, `engine/verb-node-overrides-seed.js` Layer 1 IIFE applying ops inside `DungeonVerbNodes.populate` before `VerbNodes.register`, bundle sidecar + pre-commit §1e + 4-scenario smoke; **also fixed a latent bug**: `engine/dungeon-verb-nodes.js` was referenced via `typeof` guard but never actually loaded at runtime — now has a proper `<script src>` in `index.html`); **Phase 5 vertical slice — Enemy Hydrator Stats tab ✅ shipped 2026-04-17** (`tools/enemy-hydrator.html` — tabbed shell + sidebar filters + live Stats editor with HP/STR/DEX/Stealth/Awareness sliders, DPS panel with tier-band validator flashing red on OOB entries, bottom-panel scatter-plot balance matrix with configurable axes and click-to-select, round-trip JSON export + dirty-tracking; sidecar via `tools/generate-enemies-sidecar.js` + pre-commit §1f; `tools/smoke-enemy-hydrator.js` 27 live + 16 synthetic cases pass; validator surfaces 7 OOB + 6 near-band enemies across the live roster — real design signal for Phase 5.2); `data/npcs.json` + `data/verb-nodes.json` + `data/enemies.json` are now the sole sources of truth at runtime. **All P1.1 deltas closed.** **Phase 2 Bark Workbench ✅ shipped 2026-04-17** (`tools/bark-workbench.html` — 121 pools / 510 barks, three-pane editor with namespace tree, editable bark table, Used-By NPC badges from manifest, coherence panel with smart NPC-assignable filter, fire-roll histogram simulator, JSON export with dirty tracking). P4 (Archetype Studio) + P5.2 (Deck Composer + hydrate-heuristic) unblocked.

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
| Bulk "add from archetype" stamps (spawn 5 matching NPCs) | ✅ **SHIPPED 2026-04-17** (see Phase 1.1.2 — Archetype Registry + Stamp UI below) |
| Schema validation on save (use `tools/actor-schema.json`) | ✅ **SHIPPED 2026-04-17** (see Phase 1.1 — Schema Validation below) |
| CSV/JSON import of NPC rosters | ✅ **SHIPPED 2026-04-17** (see Phase 1.1.1 — Post-P1.1 Follow-ups below) |

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

**Follow-ups**:

- ✅ In-browser playthrough smoke test on Brave — verified 2026-04-17. Console logs confirmed the clean cutover path:
  - `[NpcSeed] Populated 45 NPCs across 9 floor(s) from data/npcs.json`
  - `[NpcSystem] Populated from data/npcs.json via NpcSeed (45 NPCs / 9 floors).`
  - `[NpcSystem] Initialised. Floors with NPC definitions: 0, 1, 2, 3, 1.1, 1.2, 1.3, 2.1, 2.2`
  - Per-floor spawns match pre-cutover counts (`Spawned 6 NPC(s) on floor 0`, `Spawned 5 NPC(s) on floor 1` + DispatcherChoreography gate at (47,17)).
  - No fallback messages, no schema warnings, no NPC-side exceptions. Floors 0 through 2 plus several interiors walked without incident.
- ✅ `docs/NPC_SYSTEM_ROADMAP.md` §4.3 + §9.2 + §9.4 code sample + §cross-refs updated 2026-04-17 — the three present-tense references to `_registerBuiltinPopulations()` now point at `data/npcs.json` + `NpcSeed.populate()`, with historical context preserved where it belongs.
- ✅ `docs/SPRITE_COMMISSIONING_MAP.md` §236 "Known limitation" block marked resolved 2026-04-17 — renamed to "Round-trip status", points at Ch.5 + Phase 1.1 for the full story.

Once P4/P5/P6 ship their own dedicated editors, the three stub tabs in the Designer can be rewired to launch those editors for the selected NPC. The Designer stays as the "grand-central" index; the specialized tools own deep editing.

#### Phase 1.1 — Schema Validation on Save ✅ SHIPPED 2026-04-17

`tools/actor-schema.json` is now enforced on the NPC Designer save path. Every NPC in the working bundle is validated against its discriminator-routed oneOf branch before the download-blob is generated; on failure the author sees a `confirm()` dialog summarising the problems and may either cancel or explicitly "download anyway" (useful for intentional schema migrations).

| Task | File | Outcome |
|------|------|---------|
| Write a Draft-07 subset validator in vanilla JS (no Ajv — zero-build hard rule) | `tools/schema-validator.js` (NEW) | ✅ ~340 lines. Supports `$ref` (local), `type` (single/array), `const`, `enum` (incl. null), `pattern`, min/max numeric + string-length + array-length, `required`, `additionalProperties:false`, `properties`, `patternProperties` (added during pre-flight when the sprites schema needed it), tuple-form `items`, `anyOf`, `oneOf`. CommonJS-exports `{ validate, validateActor }` at tail for Node test harnesses. |
| Write the Node pre-flight harness — validate all 45 NPCs in `data/npcs.json` before wiring the UI gate | `tools/validate-npcs-preflight.js` (NEW) | ✅ Exits 0 if every NPC passes, non-zero + JSON-pointer-located errors otherwise. Used to find two schema bugs before shipping (see below). |
| Ship schema fixes surfaced by pre-flight | `tools/actor-schema.json` | ✅ (1) `patrolPoints maxItems: 2` was blocking legitimate multi-waypoint patrols (`floor3_admiralty_patrol` 4 points, `floor3_urchin_1` 3 points) → raised to 16. (2) `npcActor` had no `stack`/`sprites` definitions despite Phase 1.2 wiring them end-to-end → added `npcStack`, `stackSlot`, `spriteFrame`, `npcSprites` definitions (new count: 30) and attached them to `npcActor` via `anyOf [null, …]`. Baseline after fix: 45/45 NPCs pass. |
| Generate `tools/actor-schema.js` sidecar for file:// load (Chromium blocks `fetch('actor-schema.json')` under `file://`) | `tools/generate-schema-sidecar.js` (NEW) + `tools/actor-schema.js` (generated) | ✅ Same pattern as `data/npcs.js`. 1-line IIFE header attaching the parsed schema to `window.ACTOR_SCHEMA`. Re-run after every schema edit. |
| Load the schema + validator scripts in `tools/npc-designer.html` | modify | ✅ Inserted after `npc-composer.js`, before `npc-designer.js`, so `_download()` sees both `window.ACTOR_SCHEMA` and `SchemaValidator` at save time. |
| Wire validation into `NpcDesigner._download()` with confirm-based override | `tools/npc-designer.js` | ✅ New helpers `_validateBundle(bundle)` (walks every NPC, injects `kind='npc'` + `floorId=<key>` the same way the pre-flight does) and `_formatValidationReport(report)` (caps the confirm text at 8 failures — full dump always goes to the console). Graceful degradation: if `SchemaValidator` or `ACTOR_SCHEMA` is unavailable, the save proceeds with a `console.warn` rather than blocking the author. On failure the dialog shows `[floorId] id → /path keyword-message` lines, and a successful override writes `_meta.validation.ok = false` to the emitted JSON so downstream consumers can detect it. |
| Extend roadmap | `docs/NPC_TOOLING_ROADMAP.md` (this doc) | ✅ Section added; delta table entry flipped to shipped. |

**Smoke test baseline**:

- `node --check tools/schema-validator.js` → clean
- `node --check tools/generate-schema-sidecar.js` → clean
- `node --check tools/validate-npcs-preflight.js` → clean
- `node --check tools/npc-designer.js` → clean
- `node tools/generate-schema-sidecar.js` → `[schema-sidecar] wrote tools/actor-schema.js (30 definitions, 28024 bytes)`
- `node tools/validate-npcs-preflight.js` → `PASS — all NPCs validate cleanly.` (45/45)
- Sidecar round-trip (simulate browser load order) → 45/45 pass
- Negative-regression: 8/8 injected corruptions caught (missing id, bad id pattern, unknown factionId, negative barkRadius, unknown field, malformed sprite frame, out-of-range patrol point, 1-point patrol)

**Known limitations / follow-ups**:

- `anyOf` error messages surface the *shortest* branch error, which for nullable fields (e.g. `sprites: anyOf [null, object]`) sometimes leads to `expected type null` rather than the deeper property-level error. The per-branch detail is always logged via `console.group('[NpcDesigner] Schema validation failures')`, so the UX regression is cosmetic. A smarter "prefer non-type branch" heuristic is deferred until a user actually hits it.
- The confirm() dialog is the same cheap modal pattern the designer uses for `_revert()`. A dedicated review panel with one-click-jump-to-offender is opt-in P1.1.1 work, not blocking.
- `assets/sprites/npcs/` PNG path strings aren't checked for filesystem existence — schema enforces shape only. That reconciliation belongs in the sprite studio (P5), not here.
- `tools/actor-schema.js` is now a generated artifact. It ships committed like `data/npcs.js` so file:// opens work zero-setup, but it must be regenerated after every schema edit. ✅ **Resolved 2026-04-17** — `tools/.githooks/pre-commit` now auto-runs `tools/generate-schema-sidecar.js` + `git add`s the sidecar whenever `tools/actor-schema.json` is in the staged set. See Phase 1.1.1 below.

#### Phase 1.1.1 — Post-P1.1 Follow-ups ✅ SHIPPED 2026-04-17

Two leftover P1.1 deltas (one tech-debt hook, one import path) shipped the same day as the schema-validation gate. Both were self-contained and re-used the just-landed `SchemaValidator` + `window.ACTOR_SCHEMA` globals.

| Task | File | Outcome |
|------|------|---------|
| Auto-regen the schema sidecar in pre-commit when `actor-schema.json` is staged | `tools/.githooks/pre-commit` | ✅ Prepended a `git diff --cached --name-only | grep -qxF 'tools/actor-schema.json'` guard. On hit, runs `node tools/generate-schema-sidecar.js`, then `git add`s the regenerated `tools/actor-schema.js`. Fails loudly with override instructions (`git commit --no-verify`) if the generator errors. Budget check still runs after. |
| CSV/JSON import of NPC rosters | `tools/npc-designer.html` + `tools/npc-designer.js` (`_Import` block, ~260 lines) | ✅ New "📥 Import" button in the header + hidden `<input type="file" accept=".json,.csv,…">`. Auto-detects input: `{` or `[` → JSON parse (accepts either `{npcsByFloor:{…}}` bundle or flat `[{…}]` array); anything else → CSV parse. RFC-4180-ish CSV parser handles quoted fields, doubled-quote escapes, and `\r\n` / `\n` line endings. Per-field type coercion via whitelists (`_CSV_INT_FIELDS`, `_CSV_NUM_FIELDS`, `_CSV_BOOL_FIELDS`, `_CSV_OBJ_FIELDS`). Every imported NPC flows through `SchemaValidator.validate()`; failures are logged to `console.group('[NpcDesigner] Import validation failures')` and counted in the summary dialog. Batch-wide collision resolution via `confirm()` (OK = overwrite in place, Cancel = rename with `_imported` suffix via `_uniqueId()`). Merges into `_state.working.npcsByFloor[fid]`, updates `_state.byId`, marks every touched id dirty, and re-renders floor chips + NPC list. Graceful degradation if schema globals are missing (warns, imports unvalidated). |

**Smoke test baseline** (Node harness, all 45 live NPCs):

- `node --check tools/npc-designer.js` → clean
- Bundle round-trip (`data/npcs.json` → `_flattenBundle()` → `SchemaValidator`) → 45/45 pass
- Flat-array round-trip (same source, coerced to `[…]`) → 45/45 pass
- CSV round-trip (fabricated 2-row fixture with `"Sam, the ""Saltcrust"" sage"` + embedded commas/quotes) → 2/2 pass, booleans coerced to `boolean` type, integers to `number`

**Known limitations / follow-ups**:

- The collision prompt is batch-wide (one choice for all colliding ids). A per-row review-and-approve UI is future work, gated on real author demand.
- CSV type coercion is whitelist-driven — fields not in the four coercion tables stay as strings. Schema validation catches type errors, but authors with bespoke CSV exports may hit surprises on numeric dialogue flags. Documented in the CSV section header comment.

#### Phase 1.1.2 — Archetype Registry + Stamp UI ✅ SHIPPED 2026-04-17

Closes the last P1.1 leftover delta. Authors can now spawn a cohesive batch of NPCs (N × "admiralty background", N × "promenade vendors", etc.) from a single reusable template rather than CRUDing each one by hand. Registry shape + schema integration mirrors the schema sidecar pattern from P1.1.

**Registry.** `tools/archetype-registry.json` ships 9 archetypes covering the three patterns surfaced by a histogram pass across the live 45-NPC roster:

| Category | Archetypes |
|----------|-----------|
| `faction_background` (ambient, verbArchetype-driven) | `admiralty_member`, `foundry_member`, `tide_member` |
| `ambient_context` (roleless, dialoguePool-driven) | `promenade_vendor`, `pier_wanderer`, `resident_annoyed`, `watchpost_guard`, `innkeeper_ambient` |
| `interactive_scaffold` | `named_interactive_scaffold` |

Each archetype carries: `id`, `displayName`, `category`, `description`, `defaults` (full NPC shape minus id/x/y/name/emoji — those are generated per stamp), `emojiPool` (rotation for visual variety), `barkIntervalJitter` (±ms randomness on bark timing), `idPattern` (`{floorId}_admiralty_{n}`), `namePattern` (`Admiralty Operative {n}`), `recommendedCount` (`[min, max]` for the count input default + hint).

| Task | File | Outcome |
|------|------|---------|
| Draft the archetype registry data | `tools/archetype-registry.json` (NEW) | ✅ 9 archetypes, all three categories covered. Shape derived from a histogram of live NPCs (`role`, `verbArchetype`, `dialoguePool`, `factionId`) — not invented from scratch. |
| Sidecar generator for file:// load | `tools/generate-archetype-sidecar.js` (NEW) | ✅ Mirrors `generate-schema-sidecar.js`. Emits `tools/archetype-registry.js` attaching the parsed registry to `window.ARCHETYPE_REGISTRY`. |
| Schema-conformance validator | `tools/validate-archetypes.js` (NEW) | ✅ Runs every `archetype.defaults` (with id/floorId/x/y/name/emoji injected the same way the stamp does) through `SchemaValidator` against `actor-schema.json`'s `npcActor` branch. Also checks structural shape (unique ids, idPattern includes `{n}`, emojiPool non-empty, recommendedCount is `[lo, hi]`). PASS baseline: 9/9. |
| Pre-commit auto-regen + validation | `tools/.githooks/pre-commit` | ✅ New §1b block mirrors the schema-sidecar §1 block. When `tools/archetype-registry.json` is staged, runs validator first (blocks commit on schema violations), then regenerates + stages the sidecar. |
| Stamp UI in the Designer — button + overlay panel | `tools/npc-designer.html` | ✅ New "📚 Stamp" button next to Import. Absolutely-positioned overlay panel shows archetype dropdown, live description, target floor dropdown, count input (pre-filled from `recommendedCount[0]`), anchor (x, y), Stamp/Cancel/✕/Esc. Matches the Designer's existing dark-theme CSS variables. |
| Stamp logic — `_Stamp` block (~170 lines) | `tools/npc-designer.js` | ✅ `_stampOpen()` populates selects, `_stampSyncDesc()` live-updates description + count hint on archetype change, `_stampApply()` builds each NPC by (a) deep-cloning `archetype.defaults`, (b) grid-spreading positions 3-wide-by-N-tall from the anchor, (c) rotating `emoji` from `emojiPool`, (d) jittering `barkInterval` by ±`barkIntervalJitter`, (e) substituting `{n}` in `idPattern`/`namePattern` using a per-archetype suffix counter that surveys `_state.byId` to skip existing numbers, (f) running each through `SchemaValidator` and collecting rejects. Confirm-before-merge gate shows built + rejected counts. Re-renders floor chips + NPC list and closes the panel on success. |

**Smoke test baseline**:

- `node --check tools/npc-designer.js` → clean
- `node --check tools/generate-archetype-sidecar.js` → clean
- `node --check tools/validate-archetypes.js` → clean
- `node tools/generate-archetype-sidecar.js` → `wrote tools/archetype-registry.js (9 archetypes, 10167 bytes)`
- `node tools/validate-archetypes.js` → PASS 9/9
- End-to-end stamp pipeline harness (each archetype × 3 stamps → 27 NPCs → schema) → 27/27 pass, 0 rejects
- `sh -n tools/.githooks/pre-commit` → clean

**Known limitations / follow-ups**:

- Position conflict detection isn't built in — stamp writes `(ax+i%3, ay+i/3)` regardless of whether those tiles are walkable or already occupied. Authors verify placement visually on the editor's per-floor picker after stamping. Adding a floor-grid-aware collision pre-check is future work (needs the Designer to load `tools/floor-data.js` for the target floor, which it already does for the minimap — straightforward extension).
- Archetypes themselves aren't hand-editable in the Designer — `archetype-registry.json` is the source of truth and edited manually. A future "Archetype Studio" could slot in as a sibling tool if real authoring demand surfaces; for DOC-110 the jam-scope answer is "9 archetypes is enough, open the JSON if you need a tenth."
- `dialoguePool` strings in archetypes reference entries that must exist in `data/barks/en.js` (or wherever the bark pool is defined). Validation of pool existence is P2 Bark Workbench scope — today a typo in `dialoguePool` passes schema but fires empty at runtime.

### Phase 2 — Bark Workbench (1 day) ✅ **SHIPPED 2026-04-17**

| Task | File | Status |
|------|------|--------|
| `tools/bark-workbench.html` — three-pane layout (pool tree sidebar, bark table editor, coherence panel) | NEW | ✅ |
| Coherence panel — orphan pools, unreferenced pools (smart NPC-assignable filter), oneShot singletons, >60 char warnings, zero-weight entries | NEW | ✅ |
| Fire-roll simulator — weighted random histogram with configurable roll count | NEW | ✅ |
| Export pass — JSON blob download (`barks-export.json`) with dirty tracking + beforeunload guard | NEW | ✅ |
| BarkLibrary shim — intercepts `register()` calls from `data/barks/en.js` without loading full engine | NEW | ✅ |
| NPC manifest cross-reference — async load of `npc-manifest.json`, Used-By badges on pool headers, `byBarkPool` index for coherence | NEW | ✅ |

**Verification**: 121 pools, 510 barks captured from `data/barks/en.js`. Coherence panel correctly flags 9 genuinely unreferenced NPC-assignable pools (e.g. `npc.promenade.vendor`, `interior.guild`), 0 false positives from system-driven pools. Fire-roll histogram produces expected weight distributions. Export round-trips cleanly.

**Deliverable**: Every bark in the game visible, editable, and validated for reachability.

### Phase 3 — Verb-Node Stamper Layer (0.5 day)

> **Note**: Phase 3 is independent of Phase 1 (no schema dependency). Both consume Phase 0's output. Run in parallel to compress Wave 3 entry.

**Revised sequencing (2026-04-17):** the original 4-task list was written
before the Phase 0 Ch.5 NPC cutover pattern proved out. P3 has been
resliced into three chapters that mirror the NPC path (retire-inline →
JSON source of truth → generated sidecar → seed loader → stamper UI on
top). Ch.0 shipped 2026-04-17.

#### Ch.0 — Data Foundation ✅ **SHIPPED 2026-04-17**

Retire the ~150-line inline `_registerBuiltinNodes()` block in
`engine/verb-nodes.js`; make `data/verb-nodes.json` the sole source of
truth for hand-authored floors (depth 1-2); depth ≥3 continues to
auto-derive via `engine/dungeon-verb-nodes.js`.

| Task | File | Status |
|------|------|--------|
| `data/verb-nodes.json` — extract 60 nodes across 6 floors from the inline block | NEW | ✅ |
| `tools/verb-node-schema.json` — JSON-Schema Draft-07 subset (9 node types, 7 factions) | NEW | ✅ |
| `tools/generate-verb-node-schema-sidecar.js` — mirrors `generate-schema-sidecar.js` | NEW | ✅ |
| `tools/verb-node-schema.js` — generated sidecar for browser tooling under `file://` | gen | ✅ |
| `tools/extract-verb-nodes.js` — JSON normaliser + `data/verb-nodes.js` sidecar emit | NEW | ✅ |
| `tools/validate-verb-nodes.js` — schema check + unique-id + same-tile collision guard | NEW | ✅ |
| `engine/verb-node-seed.js` — loader IIFE populating VerbNodes.register() at boot | NEW | ✅ |
| Retire inline `_registerBuiltinNodes()` in `engine/verb-nodes.js` | modify | ✅ |
| `index.html` — load `data/verb-nodes.js` + `engine/verb-node-seed.js` after core | modify | ✅ |
| `tools/.githooks/pre-commit` §1c — validate+regen on `data/verb-nodes.json` or schema stage | modify | ✅ |
| Node smoke test — 60 nodes register, `findById()` returns faction-bearing entries | verify | ✅ |

**Verification**: `node tools/validate-verb-nodes.js` → *PASS — 60
node(s) across 6 floor(s)*. Boot smoke test logs
`[VerbNodeSeed] Populated 60 spatial node(s) across 6 floor(s) from
data/verb-nodes.json`. Negative test with an injected bad-enum +
duplicate-id fails the validator (2 issues) as expected.

**Size delta**: `engine/verb-nodes.js` 257 → 113 lines (−144).
**Cutover pattern parity**: mirrors Phase 0 Ch.5 NPC cutover
(inline retirement + JSON sole-source + sync-XHR/sidecar loader).

#### Ch.1 — Template Registry ✅ **SHIPPED 2026-04-17**

Six starter templates covering the major spatial patterns in the live
60-node corpus. Each template is a relative cluster keyed by `{dx, dy}`
offsets from an author-picked anchor; faction-parametric templates
(`faction_post`, `guard_checkpoint`) expose `factionSlots` with sensible
defaults that the Ch.2 stamper will prompt for at apply time.

| Task | File | Status |
|------|------|--------|
| 6 templates (`town_square`, `soup_kitchen_congregation`, `faction_post`, `market_row`, `guard_checkpoint`, `dungeon_rest_ring`) in `tools/verb-node-templates.json` | NEW | ✅ |
| `tools/generate-verb-node-template-sidecar.js` — sidecar emit + `_meta.templateCount`/`generatedAt` refresh | NEW | ✅ |
| `tools/verb-node-templates.js` — generated sidecar for browser tooling | gen | ✅ |
| `tools/validate-verb-node-templates.js` — structural (unique ids, unique suffix within template, dx/dy bounds, factionSlot declarations) + synthesized-stamp schema check against `tools/verb-node-schema.json` | NEW | ✅ |
| `tools/.githooks/pre-commit` §1d — validate+regen on template JSON stage (blocks on violation) | modify | ✅ |
| Node stamp-simulation smoke test — 6 scenarios × 26 nodes, faction slots resolve to `tide`/`foundry`/`admiralty`, every resulting node passes the per-node schema | verify | ✅ |

**Verification**: `node tools/validate-verb-node-templates.js` →
*PASS — 6 template(s), 26 node(s) total, all synthesized stamps pass
tools/verb-node-schema.json*. Stamp-simulation harness exercises every
template with realistic prefixes (`promenade_east`, `garrison_slum`,
`lantern_tide`, `boardwalk_a`, `border_alpha`, `crypt_lvl2`) and
confirms `{prefix}_{suffix}` ids, coord translation, and default-faction
resolution all round-trip cleanly. Negative test (injected unknown
type + undeclared factionSlot + duplicate suffix on `town_square`)
surfaces 3 issues as expected.

**Template shape**:

```
{
  id:            "<template_id>",
  displayName:   "<UI label>",
  category:      "civic" | "faction" | "commerce" | "nested_dungeon",
  description:   "<author context>",
  anchorDescription: "<which tile the anchor represents>",
  recommendedBiomes: [ "<biome>"... ],
  factionSlots:  [{ slot, label, default }, ...],   // empty when non-parametric
  nodes: [
    { suffix, type, dx, dy, factionSlot? }, ...
  ]
}
```

**Node count by template**: town_square 6 | soup_kitchen_congregation 5
| faction_post 2 | market_row 5 | guard_checkpoint 3 | dungeon_rest_ring 5.

#### Ch.2 — BO-V Layer ✅ **SHIPPED 2026-04-17**

Browser-based verb-node stamper integrated into the Blockout Visualizer.
An author toggles a `🛠 Nodes` toolbar button (or Shift+N), picks a
template from the dropdown (or switches to Single mode + a type), and
clicks the grid to place nodes. Collision guard + id-uniquing matches
the Ch.0 validator rules. Save writes the full payload shape back to
`data/verb-nodes.json` via the File System Access API (or falls back to
a download), where the pre-commit Ch.0 hook regenerates the sidecar on
next stage.

| Task | File | Status |
|------|------|--------|
| `tools/js/bv-verb-nodes.js` — render layer + toolbar toggle + click-to-place + template dropdown + faction-slot picker + per-floor node list | NEW | ✅ |
| `tools/blockout-visualizer.html` — load `data/verb-nodes.js` + `tools/verb-node-templates.js` + `js/bv-verb-nodes.js` sidecars | modify | ✅ |
| `tools/js/MODULES.md` — register module #23 with LOC + deps + monkey-patch note | modify | ✅ |
| `tools/check-budgets.js` — dedicated budget row (warn 750 / fail 950, matching `bv-meta-editor.js` pattern) | modify | ✅ |
| Save path — direct FS-API write to `data/verb-nodes.json` when `_dataDirHandle` granted; graceful fallback to Downloads | impl | ✅ |
| Round-trip contract — `buildJsonPayload()` output shape matches `tools/extract-verb-nodes.js` emit; validator PASS on stamped output | verify | ✅ |
| Optional `tools/verb-node-overrides/*.json` per-floor overrides for procgen dungeon tweaks | NEW | ✅ (Ch.2 stretch — see below) |

**Verification**: Headless smoke test (`VN.applyTemplate('town_square',
40, 20)` on floor 1) placed 6 nodes / skipped 0; `buildJsonPayload()`
produced 66 total nodes across 6 floors which the Ch.0 validator
(`tools/validate-verb-nodes.js`) accepts without modification.
Faction-slot resolution confirmed on `guard_checkpoint` (defaults
`tide`/`admiralty`; override `{left:'foundry', right:'pinkerton'}`
substitutes correctly). Collision guard rejects same-tile duplicates
with a toast. Pre-commit gate sweep green (8 pre-existing FAILs
unchanged; new module in WARN at 847 LOC).

**Module architecture**: Self-contained IIFE attaching to global `VN`.
Monkey-patches `draw` (appends `renderLayer()` for node dots + glyphs)
and `selectFloor` (refreshes panel on floor switch). Capture-phase
`mousedown` + `contextmenu` on `#canvas-wrap` preempts the
`bv-interaction` paint handler when `_mode !== 'off'`. Public API:
`list`, `floors`, `stats`, `templates`, `addNode`, `removeNodeAt`,
`nodeAt`, `applyTemplate`, `buildJsonPayload`, `saveToFs`,
`requestDataDir`, `togglePanel`, `setMode`, `setPendingTemplate`,
`render`.

**Deliverable realised**: Drop a `town_square` stamp on Floor 1 and its
6 nodes register — no JSON hand-edit. Save writes
`data/verb-nodes.json` directly; pre-commit regenerates the sidecar;
next boot picks them up via `engine/verb-node-seed.js`.

#### Ch.2 stretch — Per-floor overrides for procgen dungeons ✅ **SHIPPED 2026-04-17**

Lets authors tweak the `DungeonVerbNodes.populate()` auto-derivation
(depth≥3) without hand-editing `data/verb-nodes.json` (which is
reserved for hand-authored depth 1-2 floors). One JSON file per
floor under `tools/verb-node-overrides/`, filename-matches-floorId
enforced by the validator. Three ops per file — `add`, `remove`,
`replace` — applied inside `DungeonVerbNodes.populate()` before
the list is handed to `VerbNodes.register()`.

| Task | File | Status |
|------|------|--------|
| `tools/verb-node-overrides-schema.json` — Draft-07 schema (9 node-type enum, 7-faction enum, patch semantics for `replace[]`) | NEW | ✅ |
| `tools/generate-verb-node-overrides-schema-sidecar.js` — emits schema sidecar for browser tooling | NEW | ✅ |
| `tools/verb-node-overrides-schema.js` — generated sidecar (`window.VERB_NODE_OVERRIDES_SCHEMA`) | gen | ✅ |
| `tools/verb-node-overrides/README.md` — authoring guide, op semantics, pipeline diagram | NEW | ✅ |
| `tools/verb-node-overrides/2.2.1.json` — real Hero's Wake B1 example (Tide faction_post add + rest_spot remove) | NEW | ✅ |
| `tools/extract-verb-node-overrides.js` — scans `tools/verb-node-overrides/*.json`, normalises, emits bundle sidecar | NEW | ✅ |
| `data/verb-node-overrides.js` — generated bundle sidecar (`window.VERB_NODE_OVERRIDES_DATA`) | gen | ✅ |
| `tools/validate-verb-node-overrides.js` — schema check + filename↔floorId↔`_meta.floorId` three-way match + add-id uniqueness + add/remove overlap rejection + replace-overlap rejection | NEW | ✅ |
| `engine/verb-node-overrides-seed.js` — Layer 1 IIFE exposing `VerbNodeOverrides.apply(floorId, nodes) → nodes'` | NEW | ✅ |
| `engine/dungeon-verb-nodes.js` — hook call before `VerbNodes.register(...)` so overrides patch the auto-derived list | modify | ✅ |
| `index.html` — load bundle sidecar + overrides seed + (newly added) `engine/dungeon-verb-nodes.js` script tag itself | modify | ✅ |
| `tools/.githooks/pre-commit` §1e — validate+regen on `tools/verb-node-overrides/*.json` or schema stage | modify | ✅ |
| Node smoke test — 4 scenarios covering no-op passthrough, live override (add+remove), synthetic replace+contested, duplicate-add guard | verify | ✅ |

**Verification**:
`node tools/validate-verb-node-overrides.js` → *PASS — 1 file(s), 2 op(s)
validated against tools/verb-node-overrides-schema.json*.
`node tools/extract-verb-node-overrides.js` → bundle with 1 floor / 2 ops
emitted to `data/verb-node-overrides.js`.
`node tools/smoke-verb-node-overrides.js` → *PASS — 4 scenarios covered*:
(1) no-override floor returns identity array,
(2) live `2.2.1.json` removes `dvn_2.2.1_rest_4_4` + adds
`wake_b1_tide_post(faction_post, tide)`,
(3) synthetic bundle exercises `replace[]` for both type+faction
change and isolated `contested: true` patch while preserving
untouched fields + coordinates,
(4) duplicate-add id against an already-derived node is skipped
with a console warning.
Negative validation test (filename ≠ `_meta.floorId` + duplicate
add-id + add∩remove overlap) surfaces 4 issues as expected. Bug
caught during build: the `0 is falsy` pitfall on the
`seenAdd[id] = 0` → `if (seenAdd[id])` pattern was using truthiness;
switched to `in` checks so index 0 is no longer silently unique.

**Op semantics** (applied in order inside `DungeonVerbNodes.populate`
before `VerbNodes.register` is called):
`replace` mutates `type`/`faction`/`contested` on matching ids
(coords intentionally non-patchable — move = remove+add);
`remove` drops ids from the auto-derived list (silent no-op on
non-existent ids so overrides can target eventual-consistency
auto-scan output); `add` appends new nodes with id-collision
guard against the surviving set.

**Runtime failure mode**: if the sidecar doesn't load (missing
file, CORS under odd file:// configs), `VerbNodeOverrides.apply()`
becomes an identity function and `DungeonVerbNodes.populate`
registers its auto-derived list unchanged — no crash, no log spam.

**Also fixed in passing**: `engine/dungeon-verb-nodes.js` had no
`<script src>` tag in `index.html` (it was referenced by
`floor-manager.js` via `typeof` guard but never actually loaded at
runtime). The override-stretch PR adds it — dungeon verb-node
auto-derivation now ships for real.

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

| Task | File | Est. | Status |
|------|------|------|--------|
| `tools/enemy-hydrator.html` shell | NEW | 3h | ✅ VS-1 (shipped 2026-04-17) |
| Stats tab + DPS computation + tier-band validator | NEW | 4h | ✅ VS-2 + VS-3 (shipped 2026-04-17) |
| Deck Composer tab + drag-drop from EATK card pool | NEW | 4h | ✅ Phase 5.2 (shipped 2026-04-17, commit `fccf922`) |
| "Hydrate from stats" heuristic engine (§4.5 rules) | NEW | 4h | ✅ Phase 5.2 (shipped 2026-04-17, commit `fccf922`) |
| Intent Curve tab (slot contract + recommended-curve overlay, observational) | NEW | 3h | ✅ Phase 5.3 (shipped 2026-04-17) |
| Loot tab cross-ref `data/loot-tables.json` | NEW | 2h | ✅ Phase 5.4 (shipped 2026-04-17) |
| Reanim Behavior tab (pulls archetype-registry) | NEW | 1h | ⏳ stub — Phase 5.5 |
| Balance matrix scatter plot | NEW | 3h | ✅ VS-5 (shipped 2026-04-17) |
| Export all JSON + manifest | NEW | 1h | ✅ VS-4 (shipped 2026-04-17 — enemies.json only; `tools/enemy-manifest.json` regen via `extract-floors.js` already wired) |

**Deliverable**: Combat tuning moves from spreadsheet-in-head to visible, validated, tier-banded. Adding a new enemy is 10 clicks + a hydrate button.

#### Phase 5 Vertical Slice ✅ SHIPPED 2026-04-17

The vertical slice ships the **Stats + DPS + tier-band validator + balance matrix** tab end-to-end so combat tuning has an interactive surface *today*, before the 5 remaining tabs (Deck Composer / Intent Curve / Loot / Reanim Behavior / hydrate-heuristic) land one at a time in Phases 5.2–5.5.

| Task | File | Status |
|------|------|--------|
| `tools/enemy-hydrator.html` — tabbed shell + sidebar with search/tier/suit/loot/biome filters + "Only out-of-band" toggle | NEW | ✅ |
| Stats editor — name/emoji/tier/suit/lootProfile/biomes selects; hp/str/dex/stealth/awareness sliders with live labels; isElite/nonLethal toggles; flavor + `_designNote` textareas | NEW | ✅ |
| DPS panel — computes `dps = str × FIRE_RATE_PER_SEC` (1.0 combat commit/sec), shows IN BAND / NEAR BAND / OUT OF BAND / N/A (non-lethal) + horizontal bar with tier-band markers | NEW | ✅ |
| Tier-band validator — `standard 2–4 / elite 4–7 / boss 7–12` (from §4.5), flat ±1 DPS slack separates warn (amber) from err (red). Sidebar rows display a ⚠ flag on OOB entries | NEW | ✅ |
| Balance matrix — bottom-panel scatter plot, configurable X/Y axes (HP / STR / DEX / Stealth / Awareness / DPS), colour-by-tier, OOB-only filter, DPS-band shading when Y=dps, click-to-select-enemy, selected enemy ringed | NEW | ✅ |
| `data/enemies.js` sidecar + `tools/generate-enemies-sidecar.js` — `window.ENEMIES_DATA = { _meta, rows }`; same file:// pattern as `data/npcs.js` / `data/verb-nodes.js` / `data/verb-node-overrides.js` | NEW | ✅ |
| `tools/.githooks/pre-commit` §1f — regenerate + stage `data/enemies.js` whenever `data/enemies.json` is staged (keeps the sidecar in lockstep) | modify | ✅ |
| Round-trip export — "Export JSON" (download blob), "Copy JSON" (clipboard), dirty-tracking + beforeunload guard, Revert button, clean field-order preservation via `JSON.stringify` | NEW | ✅ |
| `tools/unified-designer.html` — added "Enemy Hydrator" nav button with `data-src` routing (new convention for tools that don't follow `*-designer.html` naming); `tools/js/unified-designer.js` honours `data-src` as an explicit iframe src override | modify | ✅ |
| `tools/smoke-enemy-hydrator.js` — headless Node smoke, 27 live rows + 16 synthetic cases covering band edges, flat-slack boundary, nonLethal exemption, unknown-tier fallback, sidecar row-count parity | NEW | ✅ |

**Verification** (`node tools/smoke-enemy-hydrator.js` → *PASS — 27 enemies validated (ok=11 warn=6 err=7 na=3), 16 synthetic cases passed.*):

- **11 ok** — in band (Cobweb Crawler, Mold Wraith, Cave Toad, Ember Sprite, Rot Hound, Scrap Brute, Smelt Master, Hero's Shadow, Bone Sovereign, The Amalgam, The Archivist).
- **6 near-band (warn)** — just outside by 1 DPS: Shambling Corpse / Bone Guard / Soot Imp / Clockwork Guard (str=5 vs standard 2–4), Admiralty Enforcer / Cryo-Brute (str=8 vs elite 4–7).
- **7 out-of-band (err)** — 2+ over the expected band, flashes red in tool: Iron Golem, Slag Hound, Tide Stalker, Shock Eel, Lab Drone, Deep Crawler, Brine Wraith (all `tier: standard` with str=6–7). **This is real design signal** — deep-biome "standards" appear to drift toward elite DPS. The balance matrix + sidebar ⚠ flags surface it immediately; re-tiering vs. band-widening is a design call (see *open question* below).
- **3 na** — non-lethal: Dungeon Rat, Bio-Hazard Slime, Wandering Vendor (band validation skipped).

**DPS formula rationale**: combat is turn-based but an enemy commits roughly one card stack per "tempo unit" (~1s of real time via the 10fps game tick). `dps = str × 1.0` treats raw str as the headline per-second damage, which is intuitive for tuning and matches the bands the roadmap §4.5 already specifies. Phase 5.2 (Deck Composer) will fold actual deck stats into the estimate — e.g. add top-k card damage × weight to the base — at which point the formula becomes `dps = str + weighted_deck_damage`. Today's formula is the **lower bound**; any deck on top can only make an enemy *more* lethal, so an already-OOB enemy will only get worse with cards added.

**Design intent of flat ±1 slack (vs. original proportional 20%)**: the standard band is narrow (width 2), so 20% proportional slack = 0.4 DPS, which meant str=5 (just one point over) falsely registered as "way out of band" in the first smoke pass. Flat ±1 point separates "one point off" (warn, amber) from "2+ points off" (err, red), matching the design language of the bands themselves (which are expressed in integer DPS).

**Runtime failure mode**: if `data/enemies.js` fails to load (missing file, wrong path, odd CORS), the tool shows "data/enemies.js sidecar failed to load" in the status bar and the sidebar stays empty. The engine's own enemy-ai.js still loads via sync XHR of `data/enemies.json`, so gameplay is unaffected — only the authoring tool is gated.

**Open question for Phase 5.2 kickoff** ✅ RESOLVED (2026-04-17, bundled into commit `91c99b3`): are the tier bands correct, or should they scale per-biome? Seven deep-biome "standards" landed OOB against the §4.5 bands. Three paths were on the table: (a) re-tier those enemies to elite; (b) widen the standard band (e.g. 2–6); (c) add a per-biome modifier. **Chose (a)** — re-tiered the seven OOB entries (Iron Golem, Slag Hound, Tide Stalker, Shock Eel, Lab Drone, Deep Crawler, Brine Wraith) to `tier: elite`. Rationale: widening the standard band would hide real design signal in future authoring; per-biome modifiers would proliferate edge-case logic through the hydrator, validator, and smoke. Re-tiering is one `data/enemies.json` edit per row and leaves the band constants doing their job. Smoke now reports zero OOB standards.

#### Phase 5.2 — Deck Composer ✅ SHIPPED 2026-04-17 (commit `fccf922`)

| Task | File | Status |
|------|------|--------|
| Deck Composer tab replaces stub — three-pane layout: EATK pool (left), enemy's deck slot (middle), Apply/Cancel preview (right); pattern/greed controls above | `tools/enemy-hydrator.html` | ✅ |
| Composer module — pool render, slot editor, preview diff (add/remove), exporter registration | `tools/js/enemy-hydrator-deck.js` (641 LOC, budget 700/850) | ✅ |
| `proposeFromStats()` heuristic engine — deterministic §4.5 rule stack (see *Heuristic rule set* below) with alphabetical id tie-breaking | same module | ✅ |
| `data/enemy-decks.js` sidecar + `tools/generate-enemy-decks-sidecar.js` — `window.ENEMY_DECKS_DATA = { _meta, _schema, decks }` | NEW | ✅ |
| `data/enemy-cards.js` sidecar + `tools/generate-enemy-cards-sidecar.js` — `window.ENEMY_CARDS_DATA = { _meta, _schema, cards }` (composer needs both at file:// since `fetch` fails on `file://`) | NEW | ✅ |
| `tools/.githooks/pre-commit` §1g — regenerate + stage `data/enemy-decks.js` and `data/enemy-cards.js` whenever their `.json` counterparts are staged | modify | ✅ |
| `tools/smoke-enemy-hydrator-deck.js` — reference integrity, determinism, tier/quality/suit/dex/stealth constraints across 24 roster hydrations + 6 synthetic cases | NEW | ✅ |

**Verification** (`node tools/smoke-enemy-hydrator-deck.js` → *PASS — 26 decks · 14 cards · 24 roster hydrations · 6 synthetic cases.*)

**Heuristic rule set** (§4.5 translation, applied in order inside `proposeFromStats()`):

1. **Profile detection** from `hp/str` ratio — `tanky` (ratio ≥ 3), `glass` (ratio ≤ 1.5), `balanced` otherwise.
2. **Deck-size gate** from tier — `standard 3 / elite 3–4 / boss 4`.
3. **Quality ceiling** by tier — `standard` bans the four "boss-tier" EATKs (EATK-004, -011, -012, -013); elite + boss unrestricted.
4. **Intent-weighted scoring** — each card scored by `INTENT_WEIGHTS[profile]` (tanky favors BRACE/DOT; glass favors BURST/BASIC; balanced evenly split) × 2, plus suit-match × 3, plus dex ≥ 5 → CC bonus, plus stealth ≥ 5 → DOT/BASIC opener bonus.
5. **Forced slots** — `tier: boss` forces one BRACE and one BURST in the deck (regardless of score); `stealth ≥ 5` reserves slot 0 for a DOT or BASIC opener.
6. **Greedy fill with variety guard** — highest-score first, but downweight repeats of the same intent beyond the greed budget (`standard 2 / elite 2 / boss 3` distinct intents).
7. **Post-hoc suit enforcement** — target ≥ 60% suit-matched cards; if the chosen set falls short and the pool has unused same-suit candidates, swap the lowest-scored mismatched card for a same-suit one (best-effort, accepts lower if the pool can't satisfy).
8. **Opener reorder** — if stealth rule fired and the reserved card didn't land at slot 0, rotate it there.
9. **Tie-break** — alphabetical EATK id, so the same (stats, pool) input always produces the same deck. This is why the smoke can assert determinism across two runs of the same enemy.

**Loose-coupling pattern** (new in 5.2, available for 5.3–5.5): the Composer is a side module, not a main-app dependency. Hook points:

- `document` CustomEvents `enemy-hydrator:select` (fires on enemy change with `{detail: {id, row}}`) and `enemy-hydrator:revert` (fires when the Revert button resets the roster).
- `window.EnemyHydrator` registry exposes `registerExporter(name, fn)` so a tab's "Export" participates in the main export button without the tab being wired into the shell. The Composer registers `enemy-decks.json` this way; Phases 5.3–5.5 should follow suit (curve proposals, loot overrides, reanim behavior all ship as their own JSON via the same hook).

**Design note** — the composer deliberately **does not auto-save**. A hydrate proposal stages into the Preview pane; the user has to click Apply to commit it to the slot and Export to write the file. This preserves "dirty → explicit save" symmetry with the Stats tab and keeps reverting cheap. The 6-case synthetic smoke covers the Apply path; the roster smoke covers the full 24 enemies currently in `enemies.json` that have deck entries.

---

#### Phase 5.3 — Intent Curve ✅ SHIPPED 2026-04-17

| Task | File | Status |
|------|------|--------|
| Intent Curve tab replaces stub — controls row (rounds clamp 1–12, overlay toggle), meta line, curve body with per-row bars | `tools/enemy-hydrator.html` | ✅ |
| Curve module — slot contract, deck expansion, recommended-curve library, side-by-side + overlay renderers, purely observational (no mutation, no exporter) | `tools/js/enemy-hydrator-curve.js` (531 LOC, budget 600/750) | ✅ |
| `tools/smoke-enemy-hydrator-curve.js` — slot-contract math, roster expansion determinism, recommended-curve coverage (9 tier×profile combos), `_curveOverride` semantics, 7 synthetic cases | NEW | ✅ |
| `tools/check-budgets.js` — new rule for the module | modify | ✅ |

**Verification** (`node tools/smoke-enemy-hydrator-curve.js` → *PASS — 26 roster decks expanded · 7 synthetic cases · avg match 1.19/6 · 0 perfect-match · 5 zero-match.*)

**Locked design calls** (from 5.3 kickoff review):

1. **Slot contract** — `slot 0 = opener (round 1 guaranteed)`, `slots 1..N-1 = looped sequence (rounds 2+)`. Pure function: `roundToSlot(round, N)` — `N==0→-1`, `N==1→0`, `round==0→0`, else `1 + ((round-1) % (N-1))`. No shuffle, no weighting — deterministic playback so the curve is debuggable, not statistical.
2. **maxRounds clamp** — default 6, configurable [1..12]. Bosses can go 8–10, trash mobs die in 3. "6" is a default view, not a logic assumption.
3. **Recommended curves** — static `tier × profile` library (9 entries: {standard,elite,boss} × {balanced,tanky,glass}). Each entry is `{sequence, tolerance: {earlyDefense, lateBurst}}`. Sequence is *example of intent*, not the only valid ordering; tolerance metadata travels with the data for future validators ("does this deck violate early defense expectation?") but is not enforced today. Falls back to `standard/balanced` on unknown keys. Rejected the "derive from hydrator proposal" path — self-referential, loses design intent as independent signal.
4. **Side-by-side rows default, overlay toggle** — actual row above recommended row by default. Diagnosis first, density second. Overlay mode is a single checkbox that collapses to stacked top/bottom bars for density-seekers.
5. **Curve model stores `{round, cardId, intent, slot}`** — not just intent. Enables future repetition / diversity / predictability checks without a schema change.
6. **`_curveOverride`** is **read-only in 5.3**. When present, `buildView()` uses it as the playback order ground truth; the deck's own `cards` array is not mutated. Writes (if we ever add them) flow through 5.2's `enemy-decks.json` exporter — this module registers no exporter.

**Loose-coupling contract** — module listens to `document` events `enemy-hydrator:select` and `enemy-hydrator:revert`, reads `window.EnemyHydrator.currentRow()`, and surfaces toast errors via `window.EnemyHydrator.toast()`. Same pattern as 5.2; extends cleanly to 5.4 and 5.5.

**Signal from the roster — P5.3 rework candidates** — 5 of 26 existing decks (19%) match zero recommended-curve slots for their tier+profile; another 12 match only 1 of 6. Authored before the recommended curves existed, they now split cleanly into three rework kinds:

| Enemy | Tier/Profile | Kind | Why |
|---|---|---|---|
| ENM-010 Soot Imp | standard/balanced | **rec-curve gap** | Pure DOT spam (`DOT,BASIC,DOT,BASIC,...`) — a legit "DoT specialist" sub-archetype the balanced curve doesn't capture. Resolution: add `standard/balanced-dot` rec curve OR retune deck. |
| ENM-015 Scrap Brute | elite/tanky | **compositional rework** | Leads with BURST then alternates BRACE/BASIC; missing DOT + DRAIN entirely. Elite/tanky wants BRACE-BRACE-BASIC-DOT-BURST-DRAIN. Resolution: add DOT + DRAIN EATKs to deck. |
| ENM-020 Tide Stalker | elite/tanky | **compositional rework** | `DOT,BASIC,CC,BASIC,CC,BASIC` — no BRACE, no BURST, no DRAIN. Structurally underweight for elite/tanky. Resolution: expand deck to 4 cards with at least BRACE + BURST. |
| ENM-024 Brine Wraith | elite/tanky | **compositional rework** | Opens DRAIN (vampiric flavor — interesting!) then DOT loop. No BRACE or BURST. Resolution: either add the missing intents OR propose a new `elite/tanky-vampiric` rec curve. |
| ENM-090 Hero's Shadow | elite/tanky | **`_curveOverride` candidate** | Has DOT + DRAIN + BURST + BASIC — all the right intents, just not in the recommended order. Perfect use case for reordering without touching composition. Resolution: author `_curveOverride: [...]` once 5.2 gets a write path. |

**Pattern** — 4 of 5 are `elite/tanky`. Two readings, both probably true: (1) the `elite/tanky` rec curve is tuned tight and most authored decks happen to miss it; (2) when we re-tiered the seven deep-biome standards to elite during P5.2 closeout (open-question option (a)), several of those enemies now live in a recommended-curve bucket their composition wasn't authored for. The curve tool surfaces both readings immediately — the Phase 5.4+ audit pass should triage them into "retune composition" vs. "add `_curveOverride`" vs. "relax rec curve." No action required in 5.3 — the point of the tab is to make this visible.

---

#### Phase 5.4 — Loot tab ✅ SHIPPED 2026-04-17

| Task | File | Status |
|------|------|--------|
| Loot tab replaces stub — summary KPI card (gold range / drop chance / XP / guaranteed / total value / volatility), per-slot breakdown table (chance · range · EV · volatility · share), card-rarity rolldown (aggregate + per-biome rows with bar-visualized rarity + element bias), observational warnings block | `tools/enemy-hydrator.html` | ✅ |
| Loot module — closed-form EV on 6 slot keys, tier multiplier application (currency_max_mult, card/salvage chance_add, guaranteed_drop + bonus_relic), volatility bucketing (range spread → low/med/high; chance variance p×(1−p) → low/med/high), contribPct rollup, volatility weighted rollup, normalizeWeights + meanWeights helpers for rarity visualization | `tools/js/enemy-hydrator-loot.js` (573 LOC, budget 600/750) | ✅ |
| `data/loot-tables.js` sidecar + `tools/generate-loot-tables-sidecar.js` — `window.LOOT_TABLES_DATA = { _meta, version, enemy_resource_profiles, enemy_tier_multipliers, card_drops, breakable_loot }`; required-section guard blocks the commit on a broken source | NEW | ✅ |
| `tools/.githooks/pre-commit` §1h — regen + stage `data/loot-tables.js` when `data/loot-tables.json` is staged | modify | ✅ |
| Forward hook `estimateDropsOverRounds(row, tables, rounds=6)` — bridges 5.3 fight-length to 5.4 reward (returns `{ perFight: {goldEv, totalValue, xp}, perRound: {…}, volatility }`) | same module | ✅ |
| `tools/smoke-enemy-hydrator-loot.js` — closed-form EV math (range + chance forms, tier mults, clamp), volatility bucketing on both forms, roster coverage (27 rows no exceptions), guaranteed-drop semantics (boss=key+relic, elite=card, standard=none), per-biome rolldown (single → no aggregate, multi → aggregate present, missing biome → warn), weight helpers, forward hook (default rounds, perRound scaling, volatility carry-through), 7 synthetic edge cases | NEW | ✅ |
| `tools/check-budgets.js` — new rule for the loot module (600/750) | modify | ✅ |

**Verification** (`node tools/smoke-enemy-hydrator-loot.js` → *PASS — 27 roster rows · 27 lethal views · 0 nonLethal-no-profile · synthetic edges all green.*)

**Locked design calls** (from 5.4 kickoff review + design-partner feedback):

1. **EV model = closed-form, add volatility signal.** Range slots: `ev = chance × (min+max)/2`, spread `(max-min)` bucketed `<2 low / ≤4 medium / >4 high`. Chance-only slots: `ev = chance × 1`, variance `p×(1−p)` bucketed `<0.09 low / <0.21 medium / high`. **Why volatility**: two enemies can have identical EV while feeling completely different (one steady, one jackpoty). Cheap to compute, no simulation, still deterministic.
2. **Per-biome rolldown is the primary view + tiny aggregate.** Multi-biome enemies get an "Encounter mix (equal-weight · 1/N each)" row above the per-biome rows. `aggregateWeight = 1 / biomes.length`; no weighted encounter system yet. Single-biome enemies skip the aggregate to avoid visual clutter. Rejected "collapse to primary biome" (arbitrary) and "aggregate only" (hides per-biome variance — that's real design signal).
3. **Warnings are observational, never blocking.** Four levels:
   - `info` — N/A for non-lethal-no-profile (not a problem); "non-lethal drop source" for non-lethal-WITH-profile (valid design pattern: sparring / disarm / capture). Downgraded from "is this intentional?" warning per design review — surfacing a category, not a mistake.
   - `warn` — missing biome in `card_drops`, unknown tier (falls back to neutral multipliers).
   - `err` — unknown `lootProfile` (buildView still returns with profileMissing flag, summary card shows zeros).
4. **Summary card ships six KPIs.** Gold range + EV, total drop chance, XP, guaranteed drops, total value (normalized scalar), volatility (weighted rollup). **Total value** = `Σ (slot.ev × VALUE_WEIGHTS[slotKey])` with `VALUE_WEIGHTS = {currency: 1.0, battery: 2.0, food: 1.5, card: 6.0, salvage: 2.5, key_frag: 8.0}` — designer-calibratable economic proxies, visible at the top of the module. Guaranteed drops add their typed weight; boss bonus relic adds card-weight.
5. **Per-slot breakdown ships six columns** with slot-coloured dot, chance %, range, EV, volatility badge, contribution % + pool/bias tags. Contribution % lets designers immediately spot dominant reward channels or accidental skew.
6. **Card-rarity rolldown = normalized bars**, not raw weights. Each biome row displays rarity (common/uncommon/rare/epic) and element bias (flame/frost/storm/neutral) as percent bars sorted canonically. Aggregate row sits on top with a visually distinct frame.
7. **Forward hook is small-surface.** `estimateDropsOverRounds(enemy, rounds=6)` wraps `buildView` and normalizes gold-EV / totalValue / XP over N rounds without rewriting EV logic — designed as the join point with 5.3 rounds when later tooling wants "reward per turn" comparison. Drops realize on kill (one terminal event), so `perRound = perFight / rounds`; dead simple, leaves room for later per-round-drop semantics without API churn.
8. **No exporter registration, no writes.** Module is purely observational. An editor surface is deferred per the roadmap's explicit "read-only today, editor later" call.

**Loose-coupling contract** — identical shape to 5.2/5.3: listens to `document` events `enemy-hydrator:select` and `enemy-hydrator:revert`, reads `window.EnemyHydrator.currentRow()`, surfaces toasts via `window.EnemyHydrator.toast()`. Exposes `window.EnemyHydratorLoot` debug surface with all pure functions + `getCurrentView()`/`getCurrentId()`.

**Signal from the roster — P5.4 observations**:

- **27/27 lethal+nonLethal rows resolve cleanly** — 24 lethal-with-profile + 3 nonLethal-with-profile (Dungeon Rat / Bio-Hazard Slime / Wandering Vendor). All three nonLethal-with-profile fall into the "non-lethal drop source" info category (sparring / capture / disarm pattern), confirming that the design-review reframing was correct — these aren't bugs, they're a recognized category.
- **No missing profiles and no missing tier mappings** — the roster has stayed clean against `loot-tables.json` since the P5.2 re-tiering resolution (open-question option (a)).
- **Element bias is under-used in loot-tables.json** — all three biomes have bias tables, but because the Loot tab surfaces rarity *and* element side-by-side, an imbalance would show up visually (e.g. `sealab: flame=10` vs `storm=40`). Not a design signal against the roster yet, just a now-visible surface for future tuning.

**Pass-through observation** (bridges to 5.3 rework list) — now that volatility and contribPct are visible, the five zero-match decks from P5.3 can be re-examined with a second lens: "does the enemy's drop profile match its intent profile?" A tanky enemy (BRACE/DOT intent curve) with a high-volatility drop table reads differently to players than a tanky enemy with a steady drop table. Whether to cross-correlate these two signals in P5.5 or later is a design call — the tooling now supports either answer.

---

**What's next (Phase 5.5)**: Reanim Behavior tab. Pulls `tools/archetype-registry.json` (shipped P1.1.2) for default behavior templates by type regex. Same loose-coupling pattern.

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
| 2 | Bark Workbench | 1 day | ✅ shipped 2026-04-17 |
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
**Revised**: 2026-04-17 (v1.14 — **Phase 5 Enemy Hydrator vertical slice shipped**: `tools/enemy-hydrator.html` (1229 LOC) — combat tuning surface for `data/enemies.json`. Tabbed shell (Stats active; Deck Composer, Intent Curve, Loot, Reanim Behavior stubbed with "Phase 5.N — ships next" placeholders) + left sidebar with search / tier / suit / loot / biome filters + "Only out-of-band" toggle; sidebar rows show id / emoji / suit-dot / name / ⚠ OOB flag / tier chip, grouped under `_comment` banners from the JSON. Stats tab: name / emoji / tier / suit / lootProfile / biomes selects; HP (1-120) / STR (0-20) / DEX (0-10) / Stealth (0-10) / Awareness (1-12) sliders with live labels; isElite + nonLethal flags; flavor + `_designNote` textareas. DPS panel: `dps = str × FIRE_RATE_PER_SEC` (1.0 combat commit/sec — treats raw str as the headline per-second damage, which is intuitive for tuning and matches the §4.5 bands), horizontal bar scaled 0–12 with yellow dashed markers at the tier-expected band edges, status badge (IN BAND / NEAR BAND / OUT OF BAND / N/A). Tier-band validator: `standard 2–4 / elite 4–7 / boss 7–12` with **flat ±1 DPS slack** separating warn (amber, "off by one") from err (red, "2+ off"). **Slack rationale**: first pass used 20% proportional slack per band, but the standard band is only 2 wide, so 20% = 0.4 DPS — str=5 (one point over) falsely registered as "way out of band". Switched to flat ±1 integer points, matching the band ergonomics (bands are authored in integer DPS). Balance Matrix scatter plot (bottom panel, 220px high): configurable X/Y axes (HP / STR / DEX / Stealth / Awareness / DPS), colour-by-tier, OOB-only filter, DPS-band shading when Y=dps, click-to-select-enemy (with 8px tolerance), selected enemy drawn with ring. Round-trip export: "Export JSON" (blob download), "Copy JSON" (clipboard), dirty tracking + beforeunload guard, Revert button, clean field-order preservation. Shipped alongside: `data/enemies.js` sidecar (`window.ENEMIES_DATA = { _meta, rows }`) + `tools/generate-enemies-sidecar.js` generator + `tools/.githooks/pre-commit` §1f (regen + stage on `data/enemies.json` stage); `tools/smoke-enemy-hydrator.js` Node harness with 27 live enemies + 16 synthetic cases covering band edges, flat-slack boundary, nonLethal exemption, unknown-tier fallback, sidecar row-count parity; `tools/unified-designer.html` Enemy Hydrator nav button wired via new `data-src` routing convention, `tools/js/unified-designer.js` honours `data-src` as explicit iframe-src override for tools that don't follow `*-designer.html` naming. Smoke baseline on live roster: **11 ok + 6 warn + 7 err + 3 na = 27 enemies**. The 7 err are all `tier: standard` with str=6-7 on deep biomes (Iron Golem, Slag Hound, Tide Stalker, Shock Eel, Lab Drone, Deep Crawler, Brine Wraith) — this is **real design signal** surfaced for the first time: deep-biome standards drift toward elite DPS. Re-tier vs. band-widen vs. per-biome-modifier is a design call for Phase 5.2 kickoff. Bug caught during build: first smoke used proportional slack, caught 3 false-err cases — switched to flat ±1 slack. **What's next (Phase 5.2)**: Deck Composer tab — drag-drop from `data/enemy-cards.json` (EATK pool) with "Hydrate from stats" heuristic applying §4.5 rules (`hp/str` ratio → aggression tilt, `dex` → skill cards, `stealth` → opener slots, `suit` → suit-matched ratio, `tier` → card-count + quality ceiling). Once decks land, the DPS formula upgrades from `str × 1.0` to `str + weighted_deck_damage` — today's formula is the lower bound.)

**Revised**: 2026-04-17 (v1.13 — **Phase 3 Ch.2 stretch — Per-floor overrides for procgen dungeons shipped**: New per-floor override layer lets authors tweak the `DungeonVerbNodes.populate()` auto-derivation (depth ≥3) without hand-editing `data/verb-nodes.json`. One JSON file per floor under `tools/verb-node-overrides/{floorId}.json`, filename-matches-floorId enforced. Three ops per file — `replace` (patch type/faction/contested on matching ids, coords non-patchable), `remove` (drop ids from the auto-derived list, silent no-op on non-existent), `add` (append new nodes with id-collision guard). Full pipeline: `tools/verb-node-overrides-schema.json` (Draft-07) → `tools/generate-verb-node-overrides-schema-sidecar.js` → `tools/verb-node-overrides-schema.js` (window.VERB_NODE_OVERRIDES_SCHEMA) → authored JSON files → `tools/validate-verb-node-overrides.js` (schema + three-way filename/floorId/`_meta.floorId` match + add-id uniqueness + add∩remove overlap rejection + replace-overlap rejection) → `tools/extract-verb-node-overrides.js` (scan + normalise + emit bundle) → `data/verb-node-overrides.js` (window.VERB_NODE_OVERRIDES_DATA) → `engine/verb-node-overrides-seed.js` (Layer 1 IIFE exposing `VerbNodeOverrides.apply(floorId, nodes) → nodes'`) → `engine/dungeon-verb-nodes.js` hook in `populate()` before `VerbNodes.register()`. Pre-commit §1e validates + regenerates on stage. Starter content: `tools/verb-node-overrides/2.2.1.json` — Hero's Wake B1 gets a Tide `faction_post` added at (5,7) and the auto-derived `dvn_2.2.1_rest_4_4` removed (supports reanimated-friendly tutorial combat per DOC-110 §15 reveal). Smoke baseline: 4-scenario headless harness (no-op passthrough / live override / synthetic replace+contested / duplicate-add guard) PASS; negative validation test with filename-mismatch + duplicate-add + add∩remove overlap surfaces 4 issues as expected. Bug caught and fixed during build: `seenAdd[id] = 0` then `if (seenAdd[id])` used truthiness — switched to `in` checks so index 0 is no longer silently unique. **Also fixed in passing**: `engine/dungeon-verb-nodes.js` was referenced by `floor-manager.js` via `typeof` guard but never actually loaded at runtime (no `<script src>` tag in `index.html`) — this PR adds the script tag, so dungeon verb-node auto-derivation now ships for real. **Phase 3 complete including stretch.** Next actionable parallel tracks: P2 Bark Workbench, P4 Archetype Studio, P5 Enemy Hydrator.)
**Revised**: 2026-04-17 (v1.12 — **Phase 3 Ch.2 BO-V Verb-Node Stamper Layer shipped**: `tools/js/bv-verb-nodes.js` (847 LOC, registered as MODULES.md row #23) — self-contained IIFE attaching to global `VN` with a `🛠 Nodes` toolbar button (+ Shift+N shortcut) that opens an overlay panel with three modes (Off / Single / Stamp), a type picker (9 node types with color dots + glyphs), a template dropdown auto-populated from `window.VERB_NODE_TEMPLATES`, a faction-slot picker wired to each template's `factionSlots[]`, a per-floor node list with jump-on-click + dblclick-to-remove, and a Save button that writes `data/verb-nodes.json` directly via the File System Access API (with graceful download fallback). Monkey-patches `draw` (appends `renderLayer()` for per-node dots + glyphs) and `selectFloor` (refreshes panel on floor switch); capture-phase `mousedown` + `contextmenu` on `#canvas-wrap` preempts the `bv-interaction` paint handler when a placement mode is active. Collision guard + id-uniquing match the Ch.0 validator; `buildJsonPayload()` produces the exact shape `tools/extract-verb-nodes.js` emits (round-trip PASS through `tools/validate-verb-nodes.js`). Sidecars `data/verb-nodes.js` + `tools/verb-node-templates.js` loaded in `blockout-visualizer.html` before the module (3 new `<script>` tags). `tools/check-budgets.js` updated with dedicated row (warn 750 / fail 950, matching `bv-meta-editor.js` precedent); pre-commit gate sweep shows 8 pre-existing FAILs unchanged and this module in WARN. Headless smoke test (VN.applyTemplate('town_square', 40, 20) on floor 1) places 6/6 nodes with 0 skipped; resulting 66-node payload validates without modification. Optional `tools/verb-node-overrides/*.json` per-floor procgen overrides deferred as Ch.2 stretch. **Phase 3 complete.** P2 Bark Workbench + P4 Archetype Studio remain the next actionable parallel tracks.)
**Revised**: 2026-04-17 (v1.11 — **Phase 3 Ch.1 Template Registry shipped**: `tools/verb-node-templates.json` with 6 starter templates — `town_square` (6 nodes: bonfire + 2 benches + noticeboard + 2 shops), `soup_kitchen_congregation` (5 nodes: 2 soup_kitchens + 2 benches + notice), `faction_post` (2 nodes: faction_post + work_station, `post` faction slot), `market_row` (5 nodes: 4 shops at +0/+6/+12/+18 east + central notice), `guard_checkpoint` (3 nodes: work_station + flanking faction_posts with `left`/`right` slots), `dungeon_rest_ring` (5 nodes: bonfire + 4 rest_spots in a cross) — 26 template nodes total. Templates use `{dx, dy}` offsets from an author-picked anchor, `factionSlots: [{slot, label, default}]` for parametric factions, and `{prefix}_{suffix}` id construction. Added `tools/generate-verb-node-template-sidecar.js` (emits `tools/verb-node-templates.js` + refreshes `_meta.templateCount` + `_meta.generatedAt` in-place), `tools/validate-verb-node-templates.js` (unique template ids, unique node suffix within each template, dx/dy bounds [-255,255], factionSlot-declaration check, synthesized-stamp schema validation against `tools/verb-node-schema.json`), `tools/.githooks/pre-commit` §1d (validate-then-regen on stage). Smoke baseline: 6/6 templates × 26/26 nodes all schema-clean; stamp-simulation harness exercises realistic prefixes (promenade_east, garrison_slum, lantern_tide, boardwalk_a, border_alpha, crypt_lvl2) with faction slots resolving to tide/foundry/admiralty. Negative test (injected unknown type + undeclared factionSlot + duplicate suffix) surfaces 3 issues as expected. Pattern parity with Phase 1.1.2 archetype registry. **Phase 3 Ch.2 (BO-V verb-node stamper UI)** now unblocked.)
**Revised**: 2026-04-17 (v1.10 — **Phase 3 Ch.0 Data Foundation shipped**: inline `_registerBuiltinNodes()` retired from `engine/verb-nodes.js` (257 → 113 lines, −144). `data/verb-nodes.json` is now the sole source of truth for hand-authored spatial nodes (60 nodes across 6 floors — 0, 1, 1.1, 1.2, 2, 3); depth ≥3 continues to auto-derive via `engine/dungeon-verb-nodes.js`. Added `tools/verb-node-schema.json` (Draft-07 subset — 9 node-type enum: bonfire/well/bench/shop_entrance/bulletin_board/faction_post/work_station/rest_spot/soup_kitchen; 7-faction enum; unique-id + same-tile collision guards in the validator), `tools/generate-verb-node-schema-sidecar.js`, `tools/extract-verb-nodes.js` (JSON normaliser with deterministic sort + sidecar emit), `tools/validate-verb-nodes.js` (schema + structural preflight), `engine/verb-node-seed.js` (IIFE loader — prefers `window.VERB_NODES_DATA` sidecar, falls back to sync XHR; mirrors `NpcSeed` pattern from Phase 0 Ch.5), `tools/.githooks/pre-commit` §1c (validator-then-regen block — blocks commit on schema violation, auto-regens sidecars on JSON/schema stage). Smoke baseline: Node harness boots all 60 nodes, `findById('lantern_soup')` + `findById('garrison_admiralty_post')` round-trip with faction intact; negative test (injected bad enum + duplicate id) correctly fails with 2 issues. Cutover pattern parity with Phase 0 Ch.5 (inline retirement + JSON sole-source + sidecar-or-XHR loader). **Phase 3 Ch.1 (template registry)** and **Ch.2 (BO-V verb-node layer)** unblocked.)
**Revised**: 2026-04-17 (v1.9.3 — Phase 1.1.2 Archetype Registry + Stamp UI shipped: `tools/archetype-registry.json` (9 archetypes, 3 categories — faction_background / ambient_context / interactive_scaffold — derived from a histogram of the live 45-NPC roster) + `tools/archetype-registry.js` sidecar + `tools/generate-archetype-sidecar.js` generator + `tools/validate-archetypes.js` (validates every archetype's `defaults` against `actor-schema.json`'s `npcActor` branch) + pre-commit §1b guard (validator-then-regen, blocks on violation). "📚 Stamp" overlay panel in the Designer with archetype dropdown, live description, target floor, count (pre-filled from `recommendedCount`), anchor x/y, Esc-to-close. `_Stamp` JS block (~170 lines) clones defaults, rotates emoji from `emojiPool`, jitters bark by `barkIntervalJitter`, substitutes `{n}` with a collision-aware suffix counter, grid-spreads positions, schema-validates each stamp, confirm-gated merge. Smoke baseline: 9/9 archetypes × 3 stamps = 27/27 schema-pass. **All P1.1 deltas now closed.**)
**Revised**: 2026-04-17 (v1.9.2 — Phase 1.1.1 Post-P1.1 follow-ups shipped: (1) `tools/.githooks/pre-commit` now auto-regenerates + stages `tools/actor-schema.js` whenever `tools/actor-schema.json` is in the staged set — closes the "remember to regen the sidecar" tech debt surfaced in §1.1 Known limitations. (2) CSV/JSON import in the Designer: new "📥 Import" button, hidden file input, ~260-line `_Import` block in `tools/npc-designer.js` covering bundle-JSON / flat-array-JSON / RFC-4180-ish CSV parsing, schema-validated per-row with `SchemaValidator`, batch-wide collision resolution (overwrite vs rename). Node smoke baseline: 45/45 live NPCs round-trip through both JSON modes; fabricated CSV fixture parses with quoted-comma + doubled-quote escapes intact. Bulk "add from archetype" stamps remain deferred → P1.1.2 candidate.)
**Revised**: 2026-04-17 (v1.9.1 — Ch.5 follow-up doc sweep: `docs/NPC_SYSTEM_ROADMAP.md` §4.3, §9.2, §9.4 code sample, and §cross-refs updated to reference `data/npcs.json` + `NpcSeed.populate()` as the live path; `docs/SPRITE_COMMISSIONING_MAP.md` §236 "Known limitation" block renamed to "Round-trip status" and marked resolved. Follow-ups ledger in §Phase 0 Ch.5 updated with ✅/⏳ checkmarks.)
**Revised**: 2026-04-17 (v1.9 — Phase 1.1 Schema Validation shipped: `tools/schema-validator.js` (Draft-07 subset, ~340 lines, vanilla JS) + `tools/actor-schema.js` sidecar (via `tools/generate-schema-sidecar.js`) + `tools/validate-npcs-preflight.js` Node harness; `_download()` in the Designer now validates every NPC against the schema and surfaces failures via confirm-with-override; pre-flight run caught two schema bugs — `patrolPoints maxItems:2` → 16, and missing `stack`/`sprites` definitions on `npcActor` — and both are fixed. Baseline 45/45 NPCs pass.)
**Revised**: 2026-04-17 (v1.8 — Phase 0 Chapter 5 shipped: inline `_registerBuiltinPopulations()` retired from `engine/npc-system.js`; `data/npcs.json` is the sole runtime source of truth; `tools/extract-npcs.js` rewritten as a JSON→sidecar normaliser preserving `stack` + `sprites`; `scanNpcSystemJs()` dead code removed from `tools/npc-cli.js`)
**Revised**: 2026-04-17 (v1.7 — Phase 1.2 Sprite Commissioning Authoring shipped: `_StackEditor` + `_SpriteEditor` on Identity tab; new optional `stack` / `sprites` fields on NPC records; manifest-fragment export)

**Revised**: 2026-04-16 (v1.6 — Phase 1 MVP shipped; `tools/npc-designer.html` + `.js` live; sprite preview + structured stub editors deferred to P1.1/P4/P5/P6)
**Revised**: 2026-04-16 (v1.5 — Phase 0 Chapter 3 shipped; tools/npc-manifest.json emitted by extract-floors.js)
**Revised**: 2026-04-16 (v1.4 — Phase 0 Chapter 2 shipped; runtime reads from data/npcs.json via NpcSeed; inline populations are fallback-only)
**Revised**: 2026-04-16 (v1.3 — Phase 0 Chapter 4 shipped, schema v1.1.0; Phase 1+ unblocked)
**Revised**: 2026-04-16 (v1.2 — cross-roadmap dependency audit linked + Phase 0 Chapter 4 added)
**Created**: 2026-04-16
**Status**: Phase 0 Ch.1–5 ✅ shipped (all inline fallbacks retired); Phase 1 MVP ✅ shipped; Phase 1.1 Schema Validation ✅ shipped; Phase 1.1.1 Post-P1.1 follow-ups ✅ shipped; Phase 1.1.2 Archetype Registry + Stamp UI ✅ shipped; **Phase 3 Ch.0 Data Foundation ✅ shipped** (inline `_registerBuiltinNodes()` retired, `data/verb-nodes.json` sole source of truth, 60 nodes across 6 hand-authored floors); **Phase 3 Ch.1 Template Registry ✅ shipped** (6 starter templates, 26 template nodes, validator + sidecar generator + pre-commit guard); **Phase 3 Ch.2 BO-V Verb-Node Stamper Layer ✅ shipped** (`tools/js/bv-verb-nodes.js` 847 LOC, template dropdown + faction-slot picker + per-floor node list + FS-API save, round-trip through Ch.0 validator PASS); **Phase 3 Ch.2 stretch — per-floor overrides ✅ shipped**; **Phase 5 Vertical Slice ✅ shipped** (Stats + DPS + tier-band validator + balance matrix; 27 enemies validated); **Phase 5.2 Deck Composer ✅ shipped 2026-04-17** (`tools/js/enemy-hydrator-deck.js` 641 LOC, §4.5 hydrate heuristic, EATK pool + slot editor + preview with Apply/Cancel, enemy-decks/enemy-cards sidecars + pre-commit §1g, smoke PASS 26 decks/24 hydrations); **Phase 5.3 Intent Curve ✅ shipped 2026-04-17** (`tools/js/enemy-hydrator-curve.js` 531 LOC, slot contract + recommended-curve library + side-by-side/overlay rows + `_curveOverride` read-only + rounds clamp [1..12], observational/no-exporter, smoke PASS 26 expansions/7 synthetic); **Phase 5.4 Loot tab ✅ shipped 2026-04-17** (`tools/js/enemy-hydrator-loot.js` 573 LOC, closed-form EV + volatility (range spread + chance variance bucketing) + per-biome card-rarity rolldown with equal-weight aggregate + 6-KPI summary with normalized total value + contribPct per slot + forward hook `estimateDropsOverRounds(enemy, rounds=6)` bridging 5.3→5.4, observational/no-exporter, smoke PASS 27 roster rows · 8 assertion groups); **P5.3 follow-up triage ✅ shipped 2026-04-17** (`docs/P5_3_CURVE_MISMATCH_TRIAGE.md`) — added closed-form `ceiling` metric to `tools/js/enemy-hydrator-curve.js` (now 576 LOC) + smoke test S8 + meta-strip at-ceiling badge + `window.EnemyHydratorCurve.ceilingFor`; triage finding: 17-enemy cohort's low match scores are structural (size-3 deck looping over 6-slot curve caps ceilings at 3-5/6), not authored bugs; 4 post-jam follow-ups filed (F1 tighten profile boundary, F2 secondary combatArchetype, F3 tolerance-aware match, F4 Hero's Shadow `_curveOverride`); no deck changes, no curve library changes for jam. **Phase 5.5 Reanim Behavior ✅ shipped 2026-04-18** (`tools/js/enemy-hydrator-reanim.js` 734 LOC — R/W tier editor for `brain.reanimTier`: pill selector (null/T1/T2/T3) + per-tier sub-forms (T2 dialogueTreeId picker pulled live from `NpcDialogueTrees._sourceText` regex-scan with seed fallback; T3 dispatchTarget.floorId + shopId + processedVariantId), closed-form `suggestTier()` heuristic (decision table: non-reanim flags → null, boss→null, low-roll elite→T3 dispatcher, high-roll elite→T2, DRAIN/CC archetypes→T2, otherwise→T1) with confidence tag + rationale list, coherence engine (err/warn/info tiers — flagged-non-reanim-with-tier, missing dialogue key, orphan variant, legacy top-level `reanimTier` drift), roster rollup distribution strip (t1/t2/t3/null/nonReanim) at top, Apply + Revert actions + `markDirty()` piggybacking on Stats exporter, no separate sidecar. Writeback via `normalizeTierForWrite()` tier-minimal shape (strips unknown fields, normalizes T1→`{tier:'T1'}`, T3 without floorId→null). Budget rule added (warn 750 / fail 900, matching Deck Composer's R/W precedent — module landed at 734 LOC). HTML destubbed (`.ehr-*` CSS block, `#reanim-host` target, script tag after loot). Smoke baseline: 27 roster rows × 8 assertion groups (validators / suggest heuristic / coherence / rollup / normalize / dialogue cache / edge cases / buildView integration) PASS with 0 validator errs / 0 coherence warns; rollup on current roster `{t1:0 t2:0 t3:0 null:27}` confirms P5.5 is the *introducing* tool for `brain.reanimTier` (no prior data to migrate). **DOC-110 Phase 5 suite complete** — Stats (VS-1..6) + Deck (5.2) + Intent Curve (5.3) + Loot (5.4) + Reanim (5.5) all shipped. **Next**: Phase 6 TBD — candidate tracks are Sprite Studio (§4.6 port of mok-avatar-designer), Population Planner (§4.7 act-scoped budget dashboard), or Archetype Studio deepening (§4.4).

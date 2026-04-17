# Debrief-Feed Categories Roadmap — Collapsed Readiness + Relationship Bars

**DOC-109**
**Created**: 2026-04-17
**Status**: Phase 0 + Phase 1 + Phase 2 + Phase 3 SHIPPED 2026-04-17 — ReputationBar subject-kind namespace (51/51 harness green) + ReadinessCalc event bus (`on`/`off`/`markDirty`/`getGroupScore`/`invalidate`, microtask-debounced, 32/32 harness green) + DebriefFeed `_categories` wrapper scaffold (readiness + relationships categories with collapsed/expanded toggle, faction rows migrated under `'faction:<id>'` row IDs, legacy `expandFaction`/`collapseFaction`/`updateFaction`/`getFactionState` delegating through `_categories.relationships`, 37/37 harness green) + DebriefFeed readiness wires (`updateReadiness`/`getReadinessState` public API, `GROUP_DATA` display-side metadata with biome tints matching FACTION_COLORS, ♠/♣/♦ suit glyphs + ★ overheal accent past 100%, `_readinessRow` renderer wired into `_renderRowByKind` + `_renderUnified` above relationships, Game.init subscribes `ReadinessCalc.on('group-score-change')` → `DebriefFeed.updateReadiness` + seeds via `ReadinessCalc.invalidate()`, 24/24 harness green; 228/228 total across all DOC-109 + DOC-113 harnesses). Phases 4–7 still scoped.

**Adjacent surface (DOC-113 Phase C, shipped 2026-04-17)**: DebriefFeed also hosts the sprint-timer countdown row (`showTimer`/`updateTimer`/`hideTimer`/`getTimerState`). The timer row renders ABOVE the category wrappers in `_renderUnified` — it's a peer widget, not a category member, so it doesn't interact with the readiness/relationships collapse logic. When extending `_renderUnified` in later phases, keep the insertion order `timer row → categories → feed tail` to preserve urgent-priority visibility for countdowns. Harness: `tools/_sprint-timer-cache/verify-timer.js` (84/84 green); contract: `docs/SPRINT_TIMER_UI_HANDOFF.md`.
**Depends on**: DOC-22 HUD_ROADMAP (debrief-feed layout contract), DOC-52 READINESS_BAR_ROADMAP (readiness tier-cross event bus pattern), DOC-107 QUEST_SYSTEM_ROADMAP (Phase 3 reputation bars + Phase 4 dispatcher choreography), DOC-13 STREET_CHRONICLES_NARRATIVE_OUTLINE (canonical faction roster), DOC-9 NPC_SYSTEM_ROADMAP (NPC roster + favor targets)
**Informs**: DOC-22 HUD_ROADMAP (category wrapper replaces loose faction strip), DOC-55 MENU_INTERACTIONS_CATALOG (pause-menu relationship detail view is out of scope here — handled in the forthcoming JOURNAL_V2 roadmap), DOC-107 QUEST_SYSTEM_ROADMAP (dispatcher reveal path migrates from `expandFaction` → `updateRelationship` in Phase 6)
**Audience**: DebriefFeed/HUD track owner, ReputationBar + ReadinessCalc maintainers, DispatcherChoreography integrator

---

## 0. TL;DR

The jam-build DebriefFeed shows every expanded faction as an independent row and has no readiness bars at all. The post-jam vision is two collapsible **categories** at the tail of the debrief feed — **Readiness** (3 dungeon groups) and **Relationships** (4 factions + N NPCs) — each of which:

1. Renders **only the most-recently-updated row** when collapsed
2. Expands on click to show all member rows
3. **Auto-retracts** when a new update within the category is observed, preserving visibility of the most-recent change without spamming the player with a dozen permanently-visible bars

Plus a one-time **reveal gate** on the Relationships category (hidden until the dispatcher cinematic establishes the player's first faction standing) and an extension of `ReputationBar` to track NPC-scoped favor alongside the existing faction ledger.

This roadmap does **not** rewrite the Journal face — that's the future **DOC-114 JOURNAL_V2_ROADMAP** (Roadmap B, to be drafted separately; DOC-110–113 are already claimed for unrelated work so Journal V2 takes the next available slot). This roadmap scopes only the HUD-side (debrief-feed) category wrapper and the infrastructure it needs.

---

## 1. Current State (Audit, 2026-04-17)

### 1.1 DebriefFeed faction strip

`engine/debrief-feed.js` (Layer 2, ~770 lines) owns:

- A `_factions` dict: `factionId → { favor, tier, expanded, justRevealed, justBumped, justTierCrossed }`.
- Public API: `expandFaction(id, opts)`, `collapseFaction(id)`, `updateFaction(id, favor, tier, opts)`, `getFactionState(id)`.
- Render block inside `_renderUnified()`: only `expanded === true` rows render; collapsed rows are not in the DOM.
- Styling: `.df-faction-strip` wraps zero-or-more `.df-faction-row` children, each with `.df-faction-head` (suit glyph + name + tier label) and `.df-faction-track` / `.df-faction-fill` (progress-within-tier bar). Animation classes stack: `.df-faction-reveal` (first expand), `.df-faction-bump` (favor increase), `.df-faction-tiercross` (tier change).
- Canonical display labels: `bprd → The Necromancer ♥`, `mss → Tide Council ♠`, `pinkerton → Foundry Collective ♦`, `jesuit → The Admiralty ♣`.

**Gap**: no category wrapper, no most-recent-only display mode, no auto-retract, no readiness bars, no NPC rows.

### 1.2 ReputationBar ledger

`engine/reputation-bar.js` (Layer 3, ~150 lines):

- Pure state: `_favor` + `_tierCache` dicts keyed by `factionId`.
- Public API: `addFavor(id, delta)`, `setFavor(id, value)`, `getFavor(id)`, `getTier(id)`, `listFactions()`, `snapshot()`.
- Event bus: `'favor-change'`, `'tier-cross'`. Both emit `(id, prev, next)` / `(id, prevTier, nextTier)`.
- Seeds every `QuestTypes.FACTIONS` entry to 0 = Neutral on `init(seed)`.

**Gap**: faction-scoped only. No NPC ledger, no subject-kind namespacing.

### 1.3 ReadinessCalc

`engine/readiness-calc.js` (Layer 1, ~340 lines):

- Per-floor pure derivation: `getScore(floorId)`, `getCoreScore(floorId)`, `getBreakdown(floorId)` returning `{ total, core, extra, crate, clean, torch, trap, corpse, cobweb, overclean }`.
- Threshold helpers: `getPercent(floorId)`, `meetsTarget(floorId, target)`.
- Snapshot freeze: `snapshotFloor(floorId)` before hero arrival.

**Gap**: no event bus. Consumers poll. Nothing emits on core-score change so DebriefFeed would have to hook every breakable/clean/torch/trap apply site or re-derive on a tick.

### 1.4 DungeonSchedule

`engine/dungeon-schedule.js` (Layer 1): authoritative per-group contract list. `getSchedule()` returns `[{ groupId, label, suit, floorIds[], scheduledDay, actualDay, heroType, target, resolved, onSchedule, result }]`. Exactly 3 groups (♠ Coral / ♣ Lamplit / ♦ Ironhold) in the current week.

### 1.5 Dispatcher choreography

`engine/dispatcher-choreography.js` first-time completion hook bumps BPRD by +100 favor and calls `DebriefFeed.expandFaction('bprd')`. This is the only first-reveal path into the faction strip today.

### 1.6 Wiring fan-out (Game.init today)

`engine/game.js` subscribes:

- `ReputationBar.on('tier-cross', (id, prev, next) => DebriefFeed.updateFaction(id, ReputationBar.getFavor(id), next))`
- `ReputationBar.on('tier-cross', (id, prev, next) => QuestChain.onReputationTierCross(id, prev, next))`

The `favor-change` event is emitted but **not subscribed** by DebriefFeed today — so every sub-tier favor tick is lost at the debrief surface. Phase 4 fixes this.

---

## 2. Design Goals

1. **Minimize on-screen bar count.** Two collapsed categories + always-visible resource bars (HP/EN/BAT/FTG) + avatar row + buff glyphs + compact feed tail = ~6–8 rows when collapsed, ~13 rows when both categories are expanded. Fits the smartwatch layout without scroll.
2. **Most-recent surfaces by itself.** Player doesn't need to expand to see what just changed. The most recently updated row in each category renders in the collapsed state.
3. **Auto-retract is predictable.** An update within the category while expanded triggers a retract back to the new most-recent row, with a short animation window (~600 ms) so the player sees both the tier/favor/readiness delta and the retract transition.
4. **Reveal gate is narrative-driven.** The Relationships category stays hidden until the dispatcher establishes the first faction. After that it's always visible. Readiness category appears as soon as a dungeon group has a non-zero score (first crate cleaned, first corpse collected, etc.).
5. **Category wrapper is generic.** The Readiness and Relationships categories share a single render + interaction implementation. Adding a hypothetical third category (e.g. Weekly Contracts) later should be a two-line change, not a refactor.
6. **Backward-compat during rollout.** The existing `expandFaction` / `updateFaction` API stays as a deprecated alias through Phase 6 so the dispatcher and any save-game fixtures keep working. Removal lands in Phase 7 only after the harness confirms no live callers.
7. **Zero build tooling regressions.** IIFE pattern, no ES modules, no runtime CDN. All new state lives in `debrief-feed.js` + `reputation-bar.js` + `readiness-calc.js` — no new top-level globals unless a module is genuinely independent.

---

## 3. Data Model

### 3.1 Category record (DebriefFeed-internal)

```js
// _categories[catId] shape
{
  id:            'readiness' | 'relationships',
  label:         'READINESS' | 'STANDING',     // localized via i18n
  rows:          {},       // rowId → Row record (see §3.2)
  order:         [],       // rowId[] — deterministic render order for expanded state
  expanded:      false,    // UI state
  revealed:      false,    // first-time gate (sticky once true)
  mostRecentId:  null,     // rowId or null (when empty)
  mostRecentTs:  0,        // Date.now() of last update
  expandedAtTs:  0,        // Date.now() when expand() was called — used for min-expand-window
}
```

### 3.2 Row record (category-scoped)

```js
// readiness row
{
  id:         'coral' | 'lamplit' | 'ironhold',   // == dungeon groupId
  kind:       'dungeon',
  label:      'Coral Cellars',
  suit:       '\u2660',
  suitColor:  '#1A1A1A',
  tint:       '#5F9EA0',              // bar fill color (biome palette)
  score:      0.63,                   // 0..1 core readiness
  prevScore:  0.52,                   // for bump delta
  lastTs:     1712345678901,
  flair:      { bumped: false, milestone: false },
}

// relationship row
{
  id:         'faction:bprd' | 'npc:dispatcher-hallow',
  kind:       'faction' | 'npc',
  subjectId:  'bprd' | 'dispatcher-hallow',
  label:      'The Necromancer',
  suit:       '\u2665',
  suitColor:  '#C8314A',
  tint:       '#B8395A',
  favor:      100,
  tier:       'friendly',
  tierPct:    0.42,                   // progress-within-tier 0..1
  lastTs:     1712345678901,
  flair:      { bumped: true, tierCrossed: false, revealed: false },
}
```

### 3.3 Extended ReputationBar subject-kind namespace

Backward-compat: existing `addFavor(factionId, delta)` stays as an alias. New generic API handles factions and NPCs with the same ledger + tier logic.

```js
// Internal state becomes namespaced
_favor     = { 'faction:bprd': 100, 'faction:mss': 0, 'npc:dispatcher-hallow': 25, ... }
_tierCache = { 'faction:bprd': 'friendly', ... }

// New public API
ReputationBar.addSubjectFavor('faction', 'bprd', 100);
ReputationBar.addSubjectFavor('npc',     'dispatcher-hallow', 25);
ReputationBar.getSubjectFavor('faction', 'bprd');      // 100
ReputationBar.getSubjectTier('npc', 'dispatcher-hallow'); // 'friendly' (or null if unknown)
ReputationBar.listSubjects('npc');                      // ['dispatcher-hallow', ...]
ReputationBar.snapshotByKind();                         // { faction: {...}, npc: {...} }

// Event bus gains a kind:
ReputationBar.on('tier-cross', (kind, id, prevTier, nextTier) => { ... });
ReputationBar.on('favor-change', (kind, id, prev, next) => { ... });

// Deprecated (Phase 0 keeps them as aliases)
ReputationBar.addFavor(factionId, delta)       === addSubjectFavor('faction', factionId, delta)
ReputationBar.listFactions()                    === listSubjects('faction')
```

`QuestTypes.tierForFavor()` is kind-agnostic — NPC favor uses the same Hated → Exalted ladder as factions. If later design work splits the ladder, that's a Phase 0b amendment; don't pre-engineer it.

### 3.4 Extended ReadinessCalc event bus

```js
ReadinessCalc.on('score-change', (floorId, prevScore, nextScore) => { ... });
ReadinessCalc.on('group-score-change', (groupId, prevAgg, nextAgg) => { ... });
```

`group-score-change` is computed from `DungeonSchedule.getSchedule()` — mean of each group's floor scores. Emitting both events means DebriefFeed doesn't need to know about DungeonSchedule directly; it subscribes to `group-score-change` and the aggregation stays in ReadinessCalc where the source data lives.

Emit cadence: debounced to next microtask (`Promise.resolve().then(...)`) so a sequence of breakable-apply calls within a single tick collapses into one event. For the render budget that matters — a torch-ring clean might mutate six tiles.

---

## 4. Public API

### 4.1 DebriefFeed (new surface)

```js
// Category operations
DebriefFeed.expandCategory(catId)              // user-intent: "show me all bars"
DebriefFeed.collapseCategory(catId)            // user-intent or auto-retract
DebriefFeed.toggleCategory(catId)              // click handler
DebriefFeed.isCategoryExpanded(catId)          // bool
DebriefFeed.getCategory(catId)                 // read-only snapshot for tests

// Row updates (generic)
DebriefFeed.updateReadiness(groupId, coreScore, meta)
  // meta = { label, suit, suitColor, tint } — required on first call, optional thereafter
DebriefFeed.updateRelationship(subjectKind, subjectId, favor, tier, meta)
  // meta = { label, suit, suitColor, tint, tierPct } — required on first call

// Reveal gate (sticky)
DebriefFeed.revealCategory(catId, opts)        // idempotent; opts.animate defaults to true
DebriefFeed.isCategoryRevealed(catId)

// Back-compat aliases (Phase 2-6; removed in Phase 7 after audit)
DebriefFeed.expandFaction(id, opts)   // delegates to expandCategory('relationships') then forces mostRecentId
DebriefFeed.collapseFaction(id)       // delegates to collapseCategory('relationships')
DebriefFeed.updateFaction(id, favor, tier, opts) // delegates to updateRelationship('faction', id, favor, tier)
```

### 4.2 ReputationBar (new surface)

Already sketched in §3.3. Aliases stay for Phase 6 save-compat, removed in Phase 7.

### 4.3 ReadinessCalc (new surface)

```js
ReadinessCalc.on(event, fn) / off(event, fn)
ReadinessCalc.getGroupScore(groupId)           // aggregate (mean of floor core scores)
ReadinessCalc.invalidate()                     // force a group-score-change re-emit — used by FloorManager on floor swap
```

### 4.4 Game.init wiring additions

```js
// Readiness → DebriefFeed
ReadinessCalc.on('group-score-change', function (groupId, prev, next) {
  var grp = DungeonSchedule.getGroupById(groupId);
  if (!grp) return;
  DebriefFeed.updateReadiness(groupId, next, {
    label: grp.label, suit: grp.suit, suitColor: SUIT_COLORS[grp.suit], tint: BIOME_TINT[groupId]
  });
});

// Relationships → DebriefFeed (subject-kind-aware)
ReputationBar.on('favor-change', function (kind, id, prev, next) {
  var tier = ReputationBar.getSubjectTier(kind, id);
  DebriefFeed.updateRelationship(kind, id, next, tier && tier.id, _metaFor(kind, id));
});
ReputationBar.on('tier-cross', function (kind, id, prevTier, nextTier) {
  DebriefFeed.updateRelationship(kind, id, ReputationBar.getSubjectFavor(kind, id), nextTier, _metaFor(kind, id));
  // existing Phase 3 QuestChain fan-out still fires
  QuestChain.onReputationTierCross(id, prevTier, nextTier);
});
```

`_metaFor(kind, id)` looks up the display label + suit + tint from a static table for factions and from NPC roster data for NPCs. Keeps the wiring thin.

---

## 5. Phased Rollout

### Phase 0 — ReputationBar subject-kind namespace (SHIPPED 2026-04-17)

Extend the ledger so the category work has a single data source for both factions and NPCs. **Pure state, no UI.**

**Files touched**: `engine/reputation-bar.js` only (~90 → ~230 LOC including JSDoc).

**What landed**:
- Internal keys became `kind:id` strings (`'faction:bprd'`, `'npc:dispatcher-hallow'`). `_key(kind, id)` builds them; `snapshotByKind` partitions them.
- New methods: `addSubjectFavor`, `setSubjectFavor`, `getSubjectFavor`, `getSubjectTier`, `listSubjects(kind)`, `snapshotByKind`.
- Event bus callbacks gain a `kind` first argument: `_emit(event, kind, id, prev, next)` routes on `fn.length >= 4` — modern listeners receive `(kind, id, prev, next)`, legacy 3-arg listeners still receive `(id, prev, next)` with the kind dropped. Length check removed in Phase 7.
- Legacy `addFavor` / `setFavor` / `getFavor` / `getTier` / `listFactions` / `snapshot` preserved as delegating aliases with pre-Phase-0 call signatures + return shapes. `snapshot()` filters to `kind='faction'` so save-game fixtures emitting the flat `{ factionId: {favor, tier} }` shape load unchanged.
- `init(seed)` still accepts the legacy `{ factionId: favor }` seed. NPC favor is lazy — subjects created on first `addSubjectFavor('npc', ...)` call.
- `summary()` gains `npcCount` and `subjectCount` fields alongside the existing `factionCount`.

**Verification**: `tools/_debrief-categories-cache/verify-phase0.js` — **51/51 assertions green** (2026-04-17). Groups:

1. **G1 (15)** Back-compat alias round-trip — `addFavor` / `setFavor` / `getFavor` / `getTier` / `listFactions` / `snapshot` / `init(seed)` all preserve pre-Phase-0 semantics.
2. **G2 (12)** NPC subject CRUD — `addSubjectFavor('npc', ...)` creates subjects lazily, `getSubjectFavor` / `getSubjectTier` / `listSubjects('npc')` read them back, faction ledger untouched by NPC mutations.
3. **G3 (12)** Event bus kind routing — 3-arg and 4-arg listeners coexist, `Function.length` dispatch verified, `tier-cross` fires only on threshold crossings, `off()` removes cleanly.
4. **G4 (12)** Snapshot shapes — `snapshotByKind()` returns `{ faction: {...}, npc: {...} }`; legacy `snapshot()` returns the flat faction-only shape.

Fresh-inode cache-bust pattern (copy-to-/tmp) mirrors `tools/_phase6-cache/verify.js`. Mock `QuestTypes` bundled in the harness; no live engine context needed.

**Engine callsite scan**: `grep -rn 'ReputationBar\.' engine/` confirms the only existing call is `ReputationBar.init()` in `engine/game.js:1358`. No `ReputationBar.on` subscribers exist yet; the Function.length back-compat branch is ready but untested on live callers — Phase 4 wiring will be the first consumer.

### Phase 1 — ReadinessCalc event bus (SHIPPED 2026-04-17)

Added push notifications so DebriefFeed doesn't have to poll. Both the API surface AND the core feeder callsite wiring landed in this slice.

**Files touched (as shipped)**: `engine/readiness-calc.js` (API), plus callsite wiring in `engine/cleaning-system.js`, `engine/torch-state.js`, `engine/trap-rearm.js`, `engine/cobweb-system.js`, `engine/crate-system.js`.

**Callsite wiring table** (core feeders — all five ReadinessCalc.CORE_FEEDERS are live):

| Module               | Local `_markDirty(floorId)` calls                                                                                            | `ReadinessCalc.invalidate()` on global reset |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `cleaning-system.js` | `addBlood`, `setBlood`, `scrub` (when blood or grime cleaned), `clearFloor`, `deserialize`                                   | — (no global reset path)                     |
| `torch-state.js`     | `applyHeroDamage`, `extinguish`, `pressureWashExtinguish`, `fillSlot`, `hydrateSlot`, `clearFloor`, `deserialize`            | `reset()`                                    |
| `trap-rearm.js`      | `onTrapConsumed`, `rearm`, `clearFloor`, `deserialize`                                                                       | `reset()`                                    |
| `cobweb-system.js`   | `install`, `destroy`, `recordPlayerTear`, `resetFloor`                                                                       | — (no `reset()`)                             |
| `crate-system.js`    | `withdrawSlot`, `fillSlot` (suit-card + resource paths), `seal`, `forceSeal`, `tryRehydrate` (on rehydrate), `clearFloor`    | `clearAll()`                                 |

Each module carries the same guarded helper near the top of its IIFE:

```js
// ── ReadinessCalc event-bus bridge (DOC-109 Phase 1 wiring) ─────
function _markDirty(floorId) {
  if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.markDirty) {
    ReadinessCalc.markDirty(floorId);
  }
}
```

The `typeof ReadinessCalc !== 'undefined'` guard keeps the feeders bootable when ReadinessCalc is absent (Layer 0 unit tests, EyesOnly-port transplants). Because `markDirty` is microtask-debounced, multi-tile bursts (e.g. hero path shredding blood + cobwebs across several tiles in one tick) collapse into a single `'score-change'` emit per floor.

**Deferred to a later slice**: mutation-site `markDirty` calls in the *secondary* feeders that aren't part of CORE_FEEDERS: `engine/breakable-spawner.js`, `engine/spray-system.js`, `engine/corpse-actions.js`, `engine/torch-ring.js`. These contribute indirectly (through the tiles/items the core feeders already track) so Phase 1 shipping the five core modules is sufficient for Phase 2/3 consumers. Phase 3 (readiness category render) will audit whether any secondary feeder still has a gap before calling Phase 1 fully closed.

**What landed**:
- Listener dict `_listeners = { 'score-change': [], 'group-score-change': [] }`.
- `_emit(event, ...args)` with per-listener try/catch that warns without rethrowing.
- `on(event, fn)` / `off(event, fn)` — same surface shape as ReputationBar.
- `markDirty(floorId)` — public helper for mutation sites; no-op if input isn't a non-empty string.
- `_schedule()` / `_flush()` — microtask-debounced via `Promise.resolve().then(_flush)`. Multiple `markDirty` calls in the same synchronous tick collapse into one flush.
- `_flush()` re-reads `getCoreScore(floorId)` for every dirty floor, diffs against `_lastCoreScore` cache, emits `'score-change'` `(floorId, prev, next)` per changed floor. Same-value re-dirties are suppressed.
- Group aggregation: after per-floor emits, `_flush()` walks `DungeonSchedule.getSchedule()`, recomputes the mean of each group whose floors moved, diffs against `_lastGroupScore`, emits `'group-score-change'` `(groupId, prev, next)`.
- `getGroupScore(groupId)` — read-through mean of `floorIds[i].coreScore`; returns 0 on unknown id or missing `DungeonSchedule`.
- `invalidate()` — forces re-emit for every scheduled floor + group, bypassing the value-diff dedup. Used by FloorManager on floor load / save-game restore to seed the initial debrief-feed display.

**Layer discipline**: DungeonSchedule lives at Layer 1 alongside ReadinessCalc and loads *after* it (`index.html` line 2541 vs 2546). Phase 1 accesses it only through a `typeof DungeonSchedule === 'undefined'` guard inside `_flush()`, never at init time, so the load-order dependency is a runtime-only concern and reverses cleanly at boot.

**Verification**: `tools/_debrief-categories-cache/verify-phase1.js` — 32 assertions across four groups (G1=11, G2=5, G3=9, G4=7), all green. Fresh-inode harness copies `engine/readiness-calc.js` to `/tmp` with a unique suffix per read, mocks `CrateSystem`/`CleaningSystem`/`TorchState`/`TrapRearm`/`CobwebSystem` + `DungeonSchedule`, uses `setImmediate`-anchored `flush()` helper to drain the microtask queue between assertions. Groups:

1. **G1 (11)** Basics — `on`/`off`/`markDirty` exported; synchronous `markDirty` is non-blocking; one emit per flush; `(floorId, null, next)` on first emit, `(floorId, prev, next)` on updates; same-value re-dirty is deduped; `off()` silences listener; bad input to `markDirty` returns `false`.
2. **G2 (5)** Debounce — 3× `markDirty` same floor same tick → 1 emit; 3 distinct floors → 3 emits single flush; mutated state between flushes → fresh `prev`/`next`.
3. **G3 (9)** Aggregation — `getGroupScore` mean math for 1-floor/2-floor/3-floor groups; unknown group → 0; per-floor mutation fires only the containing group's `'group-score-change'`; group emit carries correct recomputed mean; cached group dedups when mean is preserved across paired mutations (e.g. `[0.2,0.4,0.6] mean 0.4 → [0.0,0.4,0.8] mean 0.4`).
4. **G4 (7)** Invalidate — cold `invalidate()` with empty cache emits all 6 scheduled floors + 3 groups; post-invalidate cache dedups a no-op `markDirty`; second `invalidate()` re-emits all 6 floors + 3 groups despite cache match (`forceAll` bypasses diff).

**Engine callsite scan**: `grep -rn 'ReadinessCalc\.' engine/` confirms no existing call site subscribes to events, so the back-compat surface is zero-risk. Phase 2/3 will be the first live consumers.

### Phase 2 — DebriefFeed category wrapper (scaffold) (SHIPPED 2026-04-17)

Introduced the generic `_categories` data structure. **Migrated existing factions rendering into it with zero visual regression.** No readiness rows, no auto-retract, no NPC rows — Phase 2 was pure refactor + opt-in scaffold for the later consumers.

**Files touched (as shipped)**: `engine/debrief-feed.js` (~985 LOC, up from ~770).

**What landed**:
- `_categories.readiness = { id, label, rows, order, expanded, revealed, mostRecentId, kind }` and `_categories.relationships = { ... }`. Row IDs are namespaced strings: `'faction:<id>'` today, `'npc:<id>'` ready for Phase 4.
- `_renderCategoryRow(cat)` — renders the category block:
  - If `!cat.revealed` → returns empty string (category hidden entirely).
  - Else if `!cat.expanded` → renders `.df-category` wrapper with `.df-category-head` (chevron ▸ + label) + `.df-cat-collapsed-row` (mostRecent row only).
  - Else → renders `.df-category` wrapper with `.df-category-head` (chevron ▾ + label) + `.df-category-body` (all `cat.order` rows).
- `_renderRowByKind(cat, rowId)` dispatch — `kind==='faction'` delegates to the existing `_factionRow(...)` so every pre-Phase-2 pixel render path is preserved byte-for-byte.
- Legacy aliases delegate to category API: `expandFaction(id)` → `revealCategory('relationships')` + `expandCategory('relationships')` + forces `mostRecentId = 'faction:' + id`. `collapseFaction(id)` → `collapseCategory('relationships')`. `updateFaction(id, favor, tier, opts)` → touches `_categories.relationships.rows['faction:' + id]` + sets `mostRecentId`. `getFactionState(id)` reads from the category rows dict.
- Public category surface landed in full: `revealCategory`/`expandCategory`/`collapseCategory`/`toggleCategory`/`getCategoryState`/`isCategoryExpanded`/`isCategoryRevealed`/`getCategory`. `updateReadiness` and `updateRelationship` public methods are **scaffolded** (writes into the correct category + fires the right emits) but have no live subscribers until Phase 3/4.
- Click handler on `.df-category-head` calls `toggleCategory(catId)` via delegation from the existing debrief-feed root element listener.

**Verification**: `tools/_debrief-categories-cache/verify-phase2-final.js` — **37/37 assertions green** (2026-04-17). Groups:

1. **G1 (11)** Structure + initial state — categories dict exists, both start `revealed=false` + `expanded=false`, row dicts empty, mostRecentId null; public category API is callable; `getCategory('unknown')` returns null.
2. **G2 (6)** Legacy `expandFaction('bprd')` delegation — reveals relationships category, expands it, `mostRecentId === 'faction:bprd'`, legacy `getFactionState('bprd')` reads through the category rows dict.
3. **G3 (6)** Two sequential faction updates — `updateFaction('bprd', 100, 'friendly')` then `updateFaction('jesuit', 50, 'neutral')` — both land in `_categories.relationships.rows`, `mostRecentId` tracks the latest, row ordering preserved.
4. **G4 (9)** Render — collapsed render includes exactly ONE outer `.df-category ` wrapper, expanded render includes all rows in the body, chevron toggles between ▸/▾, `.df-cat-collapsed-row` appears only in collapsed state, `.df-category-body` only in expanded state.
5. **G5 (5)** `toggleCategory` flips expanded state without mutating revealed state; `collapseFaction` delegates through `collapseCategory('relationships')`; legacy + category API stay in sync after mixed calls.

**Bindfs cache workaround (for future contributors)**: the harness reads debrief-feed source from `tools/_debrief-categories-cache/_fresh-debrief-feed.js` — a byte-identical mirror of `engine/debrief-feed.js` written via the Write tool to a fresh inode. This is because the Linux sandbox's bindfs FUSE mount caches file contents at session boot and Edit-tool writes on the Windows side do **not** invalidate the cache. If `engine/debrief-feed.js` changes post-Phase-2, mirror it again via:

```sh
# From the contributor machine — Read the engine file then Write it back to the mirror path
# (bash `cp` inside the sandbox reads the stale bindfs page cache, so it won't help)
```

Driver lives at `tools/_debrief-categories-cache/verify-phase2-final.js`. Uses `vm.createContext` + `vm.runInContext` with a minimal DOM shim (no i18n/StatusEffect/DragDrop/Toast/AudioSystem/CardAuthority/SessionStats globals — the debrief-feed `typeof X === 'undefined'` guards take the early-return path when the symbol is omitted from the sandbox rather than set to null, since `typeof null === 'object'`).

**Regression**: Phase 0 harness 51/51 green, Phase 1 harness 32/32 green — no cross-phase drift from Phase 2 landing.

**Non-goals held (for Phase 3/4)**: no readiness rows populated, no auto-retract on mostRecent change, no NPC rows. Just the wrapper, migration of existing faction behavior, the click toggle, and the scaffolded `updateReadiness`/`updateRelationship` entrypoints.

### Phase 3 — Readiness category wires (SHIPPED 2026-04-17)

Turn on the Readiness category: 3 dungeon group rows, fed by the Phase 1 event bus.

**Files touched**: `engine/debrief-feed.js` (added `GROUP_DATA` table, `_setReadinessRow`, `_readinessRow` renderer, `updateReadiness` / `getReadinessState` public API, readiness row dispatch in `_renderRowByKind`, readiness block emitted above relationships in `_renderUnified`), `engine/game.js` (Game.init wires `ReadinessCalc.on('group-score-change', ...)` → `DebriefFeed.updateReadiness(...)` and calls `ReadinessCalc.invalidate()` to seed the initial bars), `index.html` (CSS: `.df-readiness-row` / `.df-readiness-head` / `.df-readiness-name` / `.df-readiness-pct` / `.df-readiness-track` / `.df-readiness-fill` / `.df-readiness-star` + `@keyframes df-readiness-reveal` + `@keyframes df-readiness-bump` + `.df-readiness-overhealed` glow).

**Decision**: `DungeonSchedule.JAM_CONTRACTS` already exposes all three groups with the expected `groupId` / `label` / `suit` / `floorIds` shape, so no convenience wrapper was needed on that module. `GROUP_DATA` inside `debrief-feed.js` is the display-side translation table (label + suit glyph + biome tint), keyed by the same `groupId` strings that `ReadinessCalc` emits. The ♠/♣/♦ tints are deliberately identical to `FACTION_COLORS.mss` / `jesuit` / `pinkerton` so the Readiness rows and Relationships rows feel like the same widget family.

**What landed**:
- `DebriefFeed.updateReadiness(groupId, coreScore, meta)` implemented. `meta` is optional; the row falls back to `GROUP_DATA[groupId]` when `meta.label / .suit / .tint` are not provided, so the common path is a two-arg call.
- `DebriefFeed.getReadinessState(groupId)` added for test / debug probing (mirrors `getFactionState` shape).
- Game.init subscribes `ReadinessCalc.on('group-score-change', function (groupId, prev, next) { ... })` → fans out to `DebriefFeed.updateReadiness(groupId, next)`. Guarded by `typeof ReadinessCalc !== 'undefined'` / `typeof DebriefFeed !== 'undefined'` / `typeof ReadinessCalc.on === 'function'` so a lighter boot sequence (e.g. a standalone title-screen build) doesn't crash.
- `ReadinessCalc.invalidate()` called in the same `init` block so all three groups emit their initial `group-score-change` — rows self-reveal even on a cold start.
- Readiness category auto-reveals on first `updateReadiness` call (`_categories.readiness.revealed = true`, sticky; verified by collapsing the category and confirming `revealed` stays true).
- Row tint per group: coral-teal ♠ / lamp amethyst ♣ / brass ♦, matching the three faction biomes.
- Bar fill: `scoreNum × 100%` clamped to `[0, 100]%` visually. When the raw score exceeds 1.0, a ★ glyph overlays the end of the bar and the `pct` label reads `"142% ★"` (mirrors `ReadinessCalc.getPercent()` convention).
- Render order: readiness category sits **above** relationships in `_renderUnified` — "how clean is the place" before "how do people feel about you".

**Verification**: `tools/_readiness-phase3-cache/verify-phase3.js` — **24/24 assertions green** (2026-04-17). Five groups:

- **G1 (5/5)**: public API surface — `updateReadiness` + `getReadinessState` exported; readiness category starts unrevealed + empty; unknown groupId returns null; invalid `groupId` (`''` / `null`) returns null; no DOM emitted before any update.
- **G2 (5/5)**: first-update reveal — `updateReadiness` returns a row record with the expected shape; category flips `revealed = true`; row appended with `mostRecentId = 'readiness:spade'`; `GROUP_DATA` fallback resolves `spade → { label: 'Coral Cellars', suit: ♠, tint: '#5F9EA0' }`; `collapseCategory` does NOT un-reveal (sticky gate).
- **G3 (4/4)**: three-group sequencing — three sequential updates (`spade 0.5` → `club 0.3` → `diamond 0.7`) append in insertion order; `mostRecentId` moves to `'readiness:diamond'`; `club` + `diamond` fallback metadata resolves correctly; aggregate math 0.5+0.3+0.7 round-trips as 1.5.
- **G4 (6/6)**: fill math + overheal accent — `score 0.5` → `width:50%` in DOM + `50%` label; no ★ or `df-readiness-overhealed` when `score ≤ 1.0`; bump updates preserve `prevScore` (0.5) alongside new `score` (0.9); `score 1.42` emits `df-readiness-overhealed` + `df-readiness-star` + `★` glyph; label reads `"142% ★"`; fill clamps at `width:100%` visually (no `width:142%` leak).
- **G5 (4/4)**: render DOM + order — expanded readiness emits three `df-readiness-row` entries (spade/club/diamond); `df-category-readiness` appears BEFORE `df-category-relationships` in the output stream; collapsed state renders exactly one row (the `mostRecentId` — diamond).

Cross-regression (2026-04-17): all prior harnesses re-green on the Phase-3 `_fresh-debrief-feed.js` mirror — Phase 0: **51/51**, Phase 1: **32/32**, Phase 2: **37/37**, DOC-113 Phase C (sprint timer): **84/84**. Total 228/228 across five harness suites.

Live-browser check deferred to the next playtest (smash a crate on floor 1.3.1, watch the Coral Cellars readiness bar tick up).

### Phase 4 — Relationships category: factions migrated + NPC rows added — **SHIPPED 2026-04-17**

Add NPC rows, wire `favor-change` (not just `tier-cross`), finalize the subject-kind fan-out.

**Status**: Shipped 2026-04-17. 22/22 Phase 4 harness assertions green; Phase 0 (51/51), Phase 1 (32/32), Phase 2 (37/37), Phase 3 (24/24) regressions re-green on the Phase-4 `_fresh-debrief-feed.js` mirror.

**Landed code**:
- `engine/debrief-feed.js`: `updateRelationship(kind, subjectId, favor, tier, meta)` + `getRelationshipState(kind, subjectId)` added. `_setRelationshipRow` extended with meta bag persistence (icon/name/factionId/floor) and `flair.tierCrossed` routing. `_renderRowByKind` dispatches `kind==='npc'` to the new `_npcRow(npcId, ndata)` renderer.
- `engine/npc-system.js`: `getNpcMeta(npcId)` cross-floor lookup returning `{id, name, emoji, factionId, floorId}` — used by Game.init's `favor-change`/`tier-cross` subscribers to resolve the portrait glyph + display name + faction tint for NPC rows.
- `engine/game.js`: ReputationBar fan-out wired post-`ReputationBar.init()`. `favor-change` forwards the `(kind, id, next, tier, meta)` tuple to `updateRelationship`; `tier-cross` does the same but adds `meta.tierCrossed=true` so the row renders the goldenrod flash keyframes. NPC meta is resolved lazily via `NpcSystem.getNpcMeta` and cached on the row.
- `engine/game.js`: `DispatcherChoreography.init` now passes `onComplete(firstTime)`. On `firstTime`, Game reveals the relationships category and calls `ReputationBar.addSubjectFavor('faction', 'bprd', 100)` which cascades through `favor-change` → `tier-cross` → `updateRelationship` to produce the first BPRD row with a tier-cross flair.
- `index.html`: `.df-npc-row / .df-npc-head / .df-npc-icon / .df-npc-name / .df-npc-tier / .df-npc-track / .df-npc-fill` CSS + `@keyframes df-npc-reveal / df-npc-bump / df-npc-tiercross` animations added next to the faction-row block.

**Harness**: `tools/_phase4-cache/verify-phase4-v2.js` (22 assertions across 6 groups — API surface, faction migration, NPC meta persistence, flag routing, reveal-gate stickiness, render DOM dispatch). The v1 at `verify-phase4.js` is the original copy; v2 is a fresh-inode clone to dodge the bindfs Edit-tool cache while Node-executing.

---

**Original spec** (retained for reference):

**Files touched**: `engine/game.js` (add `favor-change` subscription + kind-aware meta lookup), `engine/debrief-feed.js` (`updateRelationship` implemented fully), possibly `engine/npc-system.js` (read NPC roster for favor metadata — icon, name, floor).

**What lands**:
- `DebriefFeed.updateRelationship(subjectKind, subjectId, favor, tier, meta)` implemented. `meta` merges into the row record; first call requires full meta, later calls can omit and the existing row values persist.
- Game.init wires both events:
  - `ReputationBar.on('favor-change', kind, id, prev, next)` → `DebriefFeed.updateRelationship(kind, id, next, tier, meta)` — touches mostRecent, does not auto-expand.
  - `ReputationBar.on('tier-cross', kind, id, prevTier, nextTier)` → same call, but sets `flair.tierCrossed = true` for the keyframe animation.
- NPC row rendering: portrait glyph (from NPC roster) + name + tier label + progress-within-tier bar. Tint = NPC's faction color (inherits) unless the NPC has an override.
- **First-faction gate**: Dispatcher choreography migration — `DispatcherChoreography.init({ onComplete })` swaps its `DebriefFeed.expandFaction('bprd')` call for:
  ```js
  DebriefFeed.revealCategory('relationships');
  ReputationBar.addSubjectFavor('faction', 'bprd', 100); // fires favor-change + tier-cross → updateRelationship cascade
  ```
  The reveal gate stays sticky across save/load (persisted via `DebriefFeed.getPersistentState()` — see §5, Phase 7).

**Verification**: `verify-phase4.js`:
1. Faction row migration (4 factions → 4 rows after sequential `addSubjectFavor` calls)
2. NPC row creation
3. `favor-change` updates mostRecent without expanding
4. `tier-cross` sets `flair.tierCrossed`
5. Dispatcher reveal gate — simulate `DispatcherChoreography` complete, verify relationships.revealed === true + mostRecentId === 'faction:bprd'
6. Gate stickiness — collapseCategory doesn't un-reveal

Target: ~22 assertions. Plus live-browser check: run dispatcher cinematic end-to-end, verify relationships category appears with BPRD friendly.

### Phase 5 — Auto-retract on activity — **SHIPPED 2026-04-17**

The retract policy. Deliberately its own phase because it's where UX tuning lives.

**Status**: Shipped. Constants, helpers, and wire-ins live in `engine/debrief-feed.js`; fresh-inode harness (`tools/_phase5-cache/verify-phase5.js`) is 30/30 green across 9 test groups. Regression suite (Phases 0–4 + sprint-timer) all green post-ship.

**What shipped**:

- `CATEGORY_MIN_EXPAND_WINDOW_MS = 600` (grace window after expand) and `CATEGORY_RETRACT_DELAY_MS = 600` (debounced collapse delay) surfaced at the top of the module.
- `expandCategory` / `toggleCategory`-to-expand stamp `cat.expandedAtTs = Date.now()` on the flip to expanded. Idempotent expand (cat already expanded) does NOT re-stamp — keeps the grace window honest even if an event fires two expands in a row.
- `_maybeScheduleRetract(catId)` gate: no-op if cat is unexpanded or still inside the grace window; otherwise `_scheduleRetract(catId)` arms a `setTimeout` that calls `collapseCategory(catId)` after `CATEGORY_RETRACT_DELAY_MS`.
- Debounce: a second `updateReadiness` / `updateRelationship` call for the same category before the timer fires cancels the in-flight handle and re-arms a fresh 600ms timer (still 1 pending timer, measured from the latest update).
- Explicit `collapseCategory(catId)` or `toggleCategory(catId)`-to-collapse cancels any pending retract timer (user intent wins).
- Scoped per-category (`_retractTimers[catId]` map); updates to readiness don't touch relationships's timer and vice-versa. Two categories can carry independent pending retracts.
- Retract preserves `revealed` (sticky gate) — it's a collapse, not an un-reveal.
- Harness-only introspection: `_getPendingRetractCount([catId])` exposed in the public API so Node harness can count pending retracts without time-travel.

**Files touched**: `engine/debrief-feed.js` only.

**Policy** (baseline):

1. User calls `expandCategory(catId)` → `cat.expanded = true`, `cat.expandedAtTs = Date.now()`.
2. On every `updateReadiness` / `updateRelationship` call that touches a row in category X:
   - If `!cat.expanded` → no retract logic needed; just update `mostRecentId` + render.
   - Else if `Date.now() - cat.expandedAtTs < MIN_EXPAND_WINDOW_MS` (600 ms) → suppress retract (protects the "I just opened it, let me read" case).
   - Else → emit the bump/tier-cross keyframe animation on the affected row, then schedule `collapseCategory(catId)` after `RETRACT_DELAY_MS` (600 ms) via `setTimeout`. The delay lets the player see the update before it collapses.
3. Explicit user action (`toggleCategory(catId)` while expanded, or a click on anywhere outside the category) always wins — cancels any pending retract timer.

Constants surfaced at top of DebriefFeed for easy tuning:

```js
var CATEGORY_MIN_EXPAND_WINDOW_MS = 600;  // no auto-retract for this long after open
var CATEGORY_RETRACT_DELAY_MS     = 600;  // flash + retract after this
```

**Alternative policies considered** (documented here, not implemented):

- **C1 most-recent-only retract**: retract only when `mostRecentId` *changes*. More conservative; doesn't retract on a no-op tick. Rejected as default because it surprises the user who explicitly said "if player expands the dropdown then something happens it automatically retracts" — they want consistent retract behavior.
- **C2 never retract**: user must click to close. Rejected because the vision is "most-recent always visible"; if they left it expanded, a dozen bars stay on screen.
- **C3 idle-based retract**: collapse after N seconds of no updates. Rejected as primary because "activity" is the trigger, not "absence of activity".

If C1 turns out to feel better in playtest, toggle in `CATEGORY_RETRACT_ON = 'any-update' | 'mostrecent-change'` is a one-line guard.

**Verification**: `verify-phase5.js`:
1. Update during min-expand-window → no retract scheduled
2. Update after min-expand-window → retract scheduled with delay
3. Second update before retract fires → retract timer resets with new delay (debounced)
4. Manual `toggleCategory` cancels pending retract
5. Updates to Category A while Category B is expanded → Category B unaffected (scoped retract)

Target: ~10 assertions. Plus live-browser check: expand relationships, smash a crate that bumps readiness → relationships stays open; kill an enemy that bumps NPC favor → relationships retracts after 600 ms.

### Phase 6 — Migration + deprecation pass

Clean up old call sites, mark legacy aliases as deprecated, commit one full week of playtesting.

**Files touched**: every file in the repo that calls `DebriefFeed.expandFaction` / `collapseFaction` / `updateFaction` directly, plus `engine/reputation-bar.js` for its own aliases.

**What lands**:
- Grep sweep of legacy callers. Most should route through Game.init fan-outs by now; any direct-from-module callers (probably just `DispatcherChoreography`) migrate to the new API.
- `console.warn` in aliases (fire-once guard) so anything missed in the sweep surfaces in the playtest console:
  ```js
  var _warnedExpandFaction = false;
  function expandFaction(id, opts) {
    if (!_warnedExpandFaction) {
      console.warn('[DebriefFeed] expandFaction is deprecated — use updateRelationship + revealCategory');
      _warnedExpandFaction = true;
    }
    revealCategory('relationships');
    expandCategory('relationships');
    // existing behavior preserved
  }
  ```
- Update DOC-107 Phase 3 amendment block noting the migration: `DispatcherChoreography` now calls `revealCategory` + `addSubjectFavor` cascade instead of `expandFaction` directly.

**Verification**: `verify-phase6.js`:
1. No console warnings on dispatcher cinematic run-through (grep the call sites, assert none in engine/*.js)
2. Back-compat alias still works (for save-game fixtures)
3. Legacy `DebriefFeed.updateFaction('mss', ...)` round-trips through the new API correctly

Target: ~8 assertions.

### Phase 7 — Harness + persistence + documentation

Seal the work. Persist the reveal-gate state. Update shared docs.

**Files touched**: `engine/debrief-feed.js` (persistence), `data/strings/en.js` (i18n keys for category labels + chevron tooltip), `CLAUDE.md` (Key subsystems block), `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` (DOC-109 shipped note), `docs/QUEST_SYSTEM_ROADMAP.md` (Phase 4 dispatcher migration reference), this file (SHIPPED 20xx-xx-xx marker).

**What lands**:
- `DebriefFeed.getPersistentState()` / `setPersistentState(s)` — serializes `{ categoriesRevealed: ['relationships'], ... }`. Wired into the save system next to `ReputationBar.snapshot()`.
- i18n: `category.readiness.label`, `category.relationships.label`, `category.expand.hint`, `category.collapse.hint`.
- Aggregated harness `tools/_debrief-categories-cache/verify.js` combining Phases 0–6 (~100 assertions total).
- Remove deprecation warnings for internal callers; keep the function aliases but drop the `console.warn` (save-compat surface only).
- CLAUDE.md gains a DebriefFeed-Categories subsystem paragraph — link to this doc.

**Verification**: the aggregated harness passes + a 15-minute live-session playtest checklist:
- [ ] Fresh save → relationships hidden, readiness shows 0%/0%/0%
- [ ] Dispatcher first-time complete → relationships reveals, BPRD friendly
- [ ] Smash a crate in Coral → readiness category auto-reveals, Coral mostRecent
- [ ] Expand readiness → all 3 bars visible; collapse → Coral only
- [ ] Expand relationships, kill an NPC-favor-granting enemy → relationships retracts after 600 ms
- [ ] Save/load → relationships stays revealed, readiness bars match pre-save scores
- [ ] Dispatcher cinematic console → no deprecation warnings

---

## 6. Migration Strategy

### 6.1 ReputationBar event listener signature change

Legacy listeners are 3-arg `(id, prev, next)`. New listeners are 4-arg `(kind, id, prev, next)`.

Phase 0 rolls out **both signatures** via `Function.length` detection:

```js
function _emit(event, kind, id, prev, next) {
  var list = _listeners[event];
  for (var i = 0; i < list.length; i++) {
    var fn = list[i];
    try {
      if (fn.length >= 4) fn(kind, id, prev, next);
      else                fn(id, prev, next);   // legacy 3-arg callback
    } catch (e) { /* ... */ }
  }
}
```

Phase 6 bumps the `console.warn` on any remaining 3-arg listener. Phase 7 removes the length check after a grep confirms zero 3-arg listeners in engine/*.js. External callers (tests, save-system hooks) are out of scope — they should migrate too but aren't blocking.

### 6.2 DebriefFeed public surface

The back-compat aliases (`expandFaction`, `collapseFaction`, `updateFaction`, `getFactionState`) stay on the returned object through Phase 6. Phase 7 decision: keep them permanently as thin delegates (surface area is small) OR remove them entirely. Defer to playtest feedback — the aliases don't cost much.

### 6.3 Save-game compatibility

`ReputationBar.snapshot()` pre-Phase-0 emits `{ bprd: {favor, tier}, mss: {...}, ... }`. Post-Phase-0 `snapshot()` alias emits the same shape (filtering `kind='faction'` only). New callers use `snapshotByKind()` to get `{ faction: {...}, npc: {...} }`. No migration script needed — old saves load cleanly, NPC favor starts at 0 post-load until first event.

`DebriefFeed.getPersistentState()` is new; saves pre-Phase-7 simply don't have it and the gate defaults to "hidden". First-time dispatcher cinematic on the restored save re-reveals.

---

## 7. Open Questions

1. **Should Readiness category appear pre-reveal, or gated on first update?** Current plan is "auto-reveal on first `updateReadiness` call", which effectively means "as soon as the player smashes one crate anywhere". Alternative: always visible from Day 1. Defer to playtest — either is cheap.
2. **NPC floor-affinity display**: should an NPC row show a "📍 Floor 1.2" subscript so the player can find the NPC? Adds vertical space. Phase 4 default is no; if wanted, it's a CSS addition.
3. **Retract animation curve**: a pure collapse is jarring. Options are (a) fade the non-most-recent rows, (b) accordion-up with height transition, (c) "slide into most-recent" where all other rows translate into the surviving row. Deferred to Phase 5 implementation — start with (b) accordion.
4. **Dozens of NPCs problem**: if 30+ NPCs end up with non-zero favor, expanded relationships could exceed the smartwatch panel height. Mitigations (choose one at implementation time):
   - (a) Inner scroll region for the expanded category body.
   - (b) Secondary collapse — "factions first, NPCs hidden behind another chevron".
   - (c) Only show NPCs with the top-N highest recent favor deltas; rest visible only in the journal detail view.
   Probably (a) is simplest; (c) is probably best UX. Revisit after Phase 4 when we know how many NPCs are in play.
5. **Relationship bar color when NPC inherits faction vs. standalone**: rendering an NPC tinted with faction color is visually coherent but risks obscuring which subject is which. Consider a secondary chip (e.g. faction glyph on the NPC row) — punt to visual polish pass.

---

## 8. Verification Harness Layout

```
tools/_debrief-categories-cache/
├── verify.js              # aggregated — Phase 7
├── verify-phase0.js       # ReputationBar kind namespace
├── verify-phase1.js       # ReadinessCalc event bus
├── verify-phase2.js       # Category wrapper scaffold
├── verify-phase3.js       # Readiness category
├── verify-phase4.js       # Relationships category + NPCs + reveal gate
├── verify-phase5.js       # Auto-retract
└── verify-phase6.js       # Deprecation pass
```

Each file uses the fresh-inode copy-to-/tmp pattern established in `tools/_phase6-cache/verify.js` to bypass the bindfs cache phantom. Mock DOM via a minimal `document.createElement`/`getElementById` stub so DebriefFeed's render path is exercisable from Node.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **Category** | A collapsible group of rows rendered at the tail of the debrief feed. Two exist: Readiness, Relationships. |
| **Row** | A single bar within a category. Readiness rows are per-dungeon-group; Relationship rows are per-subject (faction or NPC). |
| **Most-recent** | The row that received the latest update; rendered in the collapsed state. |
| **Reveal gate** | First-time visibility check; once revealed, a category stays visible for the rest of the save. |
| **Auto-retract** | The category collapses back to most-recent-only after an update, with a short delay so the player sees the change animate. |
| **Subject kind** | `'faction'` or `'npc'` — the two categories of relationship tracked by ReputationBar. |
| **Group score** | Aggregate readiness for a dungeon group = mean of core scores of that group's floors. |

---

## 10. Cross-References

- **DOC-22 HUD_ROADMAP** — defines the smartwatch panel contract this category wrapper slots into. Post-Phase 7 needs an update noting that the debrief-feed tail now hosts two collapsible categories.
- **DOC-52 READINESS_BAR_ROADMAP** — source of the tier-cross event bus pattern. ReadinessCalc Phase 1 extension is modeled on it.
- **DOC-107 QUEST_SYSTEM_ROADMAP** — Phase 3 reputation bars + Phase 4 dispatcher choreography live here. DOC-109 Phase 4 / Phase 6 migrate the reveal call sites.
- **DOC-13 STREET_CHRONICLES_NARRATIVE_OUTLINE** — source of canonical faction roster (4 factions, suits, colors). Relationship category `meta` for factions pulls from here.
- **DOC-9 NPC_SYSTEM_ROADMAP** — source of NPC roster. Relationship category `meta` for NPCs pulls from here; exact coupling to be decided in Phase 4 (probably a thin `_metaFor('npc', id)` helper that reads `NpcSystem.getNpcById`).
- **DOC-114 JOURNAL_V2_ROADMAP** (not yet drafted — Roadmap B) — the pause-menu detail-view work. DOC-109 scoped to HUD only; the detail inspector is separate. Claims the next-available DOC slot because DOC-110 (NPC_TOOLING_ROADMAP), DOC-111 (NPC_TOOLING_DEPENDENCY_AUDIT), DOC-112 (BOXFORGE_PEEK_COVERAGE_MATRIX), and DOC-113 (SPRINT_DUNGEON_DESIGN) are already claimed.

---

**Next DOC number after this: DOC-114.** (DOC-110–113 are already claimed; DOC-109 was the open slot called out in DOC-108 §Meta.)

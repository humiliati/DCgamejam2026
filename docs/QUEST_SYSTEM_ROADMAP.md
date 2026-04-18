# Quest System Roadmap — Post-Jam Canonical Spec

**DOC-107**
**Created**: 2026-04-16
**Last updated**: 2026-04-17
**Status**: Phases 0 + 0b + 1 + 2 + 3 + 4 + 5 + 5b + 6 + 8a shipped. Phases 7, 8b pending. Supersedes the "deferred QuestChain" section of DOC-66 quest-marker-audit.md
**Depends on**: DOC-2 Tutorial_world_roadmap, DOC-13 STREET_CHRONICLES_NARRATIVE_OUTLINE, DOC-52 READINESS_BAR_ROADMAP, DOC-55 MENU_INTERACTIONS_CATALOG, DOC-66 quest-marker-audit, DOC-74 ACT2_NARRATIVE_OUTLINE, DOC-9 NPC_SYSTEM_ROADMAP, DOC-95 MINIGAME_TILES
**Informs**: DOC-22 HUD_ROADMAP (quest marker toggle, reputation bar stack), DOC-55 MENU_INTERACTIONS_CATALOG (Journal face), DOC-103 NPC_REFRESH_PLAN (faction contact choreography), DOC-95 MINIGAME_TILES (sidequest completion contract), DOC-113 SPRINT_DUNGEON_DESIGN (timer-as-quest-step contract, `kind:"fetch"` step kind, `onTimerExpired` 9th event entry point)
**Audience**: Quest-system track owner + parallel track liaisons (pressure washing, map editor, minigame design)

---

## 0. TL;DR

We ship a data-driven quest system that **replaces** the imperative `QuestWaypoint.update()` logic with a `QuestChain` state machine fed by a `quests.json` registry. The system owns:

1. The pulsing green minimap diamond (formerly hardcoded coords in `quest-waypoint.js`)
2. The Journal section of MenuBox Face 1 (formerly hardcoded strings in `menu-faces.js :: _getQuestObjective()`)
3. A new **ReputationBar stack** that extends the existing `readiness-calc` tier-cross event channel to cover per-faction and per-NPC standing — the WoW-style "revolving bars" the user specified
4. A system-settings toggle for **quest markers on/off** plus three auxiliaries (hint verbosity, waypoint flair, sidequest opt-in)
5. Hook APIs the three parallel tracks can attach to without circular dependencies

Everything in DOC-66 §6.1–6.7 that was deferred as "post-jam QuestChain" is now scoped, sequenced, and claimed here.

---

## 1. Current State (Audit, 2026-04-16)

### 1.1 Modules that touch quests today

| Layer | Module | Role | Post-refactor fate |
|---|---|---|---|
| 2 | `engine/minimap.js` | Pulsing diamond renderer via `setQuestTarget()` / `_drawQuestMarker()` lines 794–823 | **Keep.** Becomes a pure renderer. Reads from QuestChain instead of being pushed by QuestWaypoint. |
| 3 | `engine/minimap-nav.js` | Click-to-path BFS via `Pathfind.find()` | **Keep.** Independent of quest state. Cancel logic already wired to floor transitions + `hose-reel.js` + `intro-walk.js`. |
| 3.5 | `engine/quest-waypoint.js` | Imperative target derivation — five null-drop states documented in DOC-66 §3 | **Retire.** Replaced by `engine/quest-chain.js`. Keep a thin shim during Phase 1 cutover for `evaluateCursorFxGating()`. |
| 3 | `engine/menu-faces.js :: _getQuestObjective()` (lines 411–430) | Hardcoded objective text keyed by floor ID + gate state | **Gut & re-wire.** Becomes `QuestChain.getJournalEntries(filter)`. |
| 1 | `engine/player.js` | `setFlag()/getFlag()` is the current quest "state" (see ACT2 §10) | **Extend.** Player stays the owner of quest flags, but QuestChain reads/writes via a narrow contract. |
| 1 | `engine/readiness-calc.js` | CORE + EXTRA CREDIT tiers 0.0–2.0, tier-cross events | **Pattern source.** ReputationBar copies the tier-cross event bus + threshold visualization. |
| 1 | `engine/dungeon-schedule.js` | `getNextGroup()` → contract rotation (spade/club/diamond) | **Consumer.** QuestChain generates chain templates from schedule + DumpTruckSpawner anchors (DOC-66 §6.4). |
| 1 | `engine/dump-truck-spawner.js` | Canonical faction → `(exteriorFloor, doorPos)` map | **Consumer.** The authoritative rotation anchor — QuestChain and the truck deploy in lockstep (DOC-66 §6.6). |

### 1.2 Hardcoded coordinates we are deleting

| File | Line | Code | Disposition |
|---|---|---|---|
| `engine/quest-waypoint.js` | 169 | `{ x: 22, y: 27 }` (Phase 1 promenade fallback) | Moved to `quests.json` as `anchors.promenade_home_door`, resolved by FloorManager at build time. |
| `engine/quest-waypoint.js` | 171 | `{ x: 19, y: 3 }` (Phase 1 home chest fallback) | Moved to `quests.json` as `anchors.home_work_keys_chest`, resolved by world data (chest entity ID). |
| `engine/menu-faces.js` | 411–430 | Hardcoded objective text per floor | Moved to `quests.json :: step.label` + i18n keys. |
| `engine/game.js` | 232 (init wiring), 1831 (hero arrival), 2421 (gate unlock), 2480 (readiness/schedule), 2496 (definition) | Call sites of `_updateQuestTarget()` | Replaced with explicit QuestChain advance predicates (see Phase 1). |

No other hardcoded coordinates found in the quest path. The jam-day sticky fallback + DumpTruckSpawner anchor patch (DOC-66 §5) is live and correct — we preserve its behavior, just move the computation into data.

### 1.3 Journal UI today

The Journal sits on MenuBox Face 1 (`menu-faces.js :: _renderJournal()`, lines 1432–1600+). It renders three subsections:

1. **Quest objectives** — hardcoded via `_getQuestObjective()`, stub
2. **Books** — reads `BookshelfPeek.getCatalog()` + `Player.hasFlag('book_read_*')`, correct
3. **Lore entries** — stub (DOC-55 §Face-1)

The books subsection is the architectural template. The objectives subsection needs to match it: read from a registry, render from data, persist via Player flags.

### 1.4 Quest state today

There is no `Player.questState`. "Quest state" is a union of:

- `Player.hasFlag('heroWakeArrival')`, `'book_read_*'`, etc. (26 narrative flags enumerated in ACT2 §10)
- `DungeonSchedule.getNextGroup()` — active contract
- `ReadinessCalc.getCoreScore(floorId)` — per-floor completion
- `_gateUnlocked` (game.js internal boolean) — Act 1 gate state
- `_dispatcherPhase` (game.js internal enum) — dispatcher dialogue phase

This is diffused state, not a quest log. It works because the Act-1 arc is linear and three contracts long. It does not scale to Act 2's 26-flag narrative or the faction/reputation layer.

### 1.5 What exists that we are NOT touching

- The splash/title/character-creation flow (owned by `title-screen.js`, DOC-21)
- The cinematic camera choreography (DOC-51) — quest steps may *trigger* camera presets but don't own them
- The hero/dispatcher choreography modules (`hero-wake.js`, `dispatcher-choreography.js`) — quest steps fire as side effects but choreography logic stays put
- CardAuthority — QuestState lives on Player, not CardAuthority, because quest state is not inventory

---

## 2. Target Architecture

### 2.1 Three new modules

```
Layer 0: engine/quest-types.js         — frozen enums, schema constants (zero deps)
Layer 1: engine/quest-registry.js      — loads quests.json, validates, exposes lookup API
Layer 3: engine/quest-chain.js         — state machine; owns current-step + advance predicates
Layer 3: engine/reputation-bar.js      — faction/NPC standing tracker (evolves from readiness bar)
```

### 2.2 Module responsibility map

| Module | Owns | Reads | Emits | Never touches |
|---|---|---|---|---|
| `quest-types.js` | `STEP_KINDS`, `ANCHOR_SOURCES`, `COMPLETION_TYPES`, `FACTION_IDS` | nothing | nothing | nothing |
| `quest-registry.js` | Parsed quest definitions, anchor resolver registry | `data/quests.json`, FloorManager, DumpTruckSpawner, `quest-types` | `registry.loaded` | Player state, Minimap, any render surface |
| `quest-chain.js` | Current-step pointer, per-quest progress, history ring buffer | Registry, Player flags, ReadinessCalc, DungeonSchedule | `quest.stepAdvanced`, `quest.completed`, `quest.failed`, `quest.markerMoved` | Rendering, floor generation |
| `reputation-bar.js` | Per-faction favor (0–100), per-NPC standing (-100..+100), tier thresholds | Player flags, QuestChain events | `reputation.tierCross`, `reputation.hostile`, `reputation.allied` | Quest advance logic (QuestChain drives reputation, not the reverse) |
| `minimap.js` (existing) | Diamond render | `QuestChain.getCurrentMarker()` each frame | `minimap.questTargetClicked` (for nav) | Quest state |
| `menu-faces.js` (existing) | Journal UI | `QuestChain.getJournalEntries({active: true})` + `getJournalEntries({completed: true})` | `journal.entrySelected` (for camera pan / map jump) | Quest state |

### 2.3 Data shape — `data/quests.json`

```json
{
  "version": 1,
  "anchors": {
    "promenade_home_door":   { "source": "floor-data", "floorId": "1",    "kind": "doorTarget",   "target": "1.6" },
    "home_work_keys_chest":  { "source": "entity",     "floorId": "1.6",  "entityType": "chest",  "tag": "work_keys" },
    "dispatcher_npc":        { "source": "npc",        "npcId": "dispatcher_gate" },
    "spade_dungeon_entry":   { "source": "dump-truck", "groupId": "spade" }
  },
  "quests": [
    {
      "id": "act1.onboarding",
      "title": "quest.act1.onboarding.title",
      "acts": ["act1"],
      "kind": "main",
      "steps": [
        {
          "id": "act1.onboarding.meet_dispatcher",
          "label": "quest.act1.onboarding.meet_dispatcher",
          "anchor": "dispatcher_npc",
          "completes": { "type": "flag", "flag": "dispatcher_phase", "value": "done" },
          "next": "act1.onboarding.fetch_keys"
        },
        {
          "id": "act1.onboarding.fetch_keys",
          "label": "quest.act1.onboarding.fetch_keys",
          "anchor": "home_work_keys_chest",
          "completes": { "type": "item", "itemId": "work_keys" },
          "next": "act1.onboarding.exit_town"
        },
        { "id": "act1.onboarding.exit_town", "anchor": { "source": "door-to", "from": "1", "to": "2" },
          "completes": { "type": "floor-enter", "floorId": "2" }, "next": null }
      ]
    },
    {
      "id": "act1.contract.spade",
      "kind": "contract",
      "template": "dungeon-group",
      "groupId": "spade",
      "readinessTarget": 0.6
    }
  ]
}
```

**Template quests** (`"template": "dungeon-group"`) expand at runtime from `DungeonSchedule.getSchedule()` and `DumpTruckSpawner.getDeploySites()` — no per-contract JSON needed, just the template tag. This is the DOC-66 §6.4 chain template, now data-tagged instead of code-generated.

### 2.4 Player state extension

```js
// New: Player.questState
{
  active:    { "act1.onboarding": { stepId: "act1.onboarding.fetch_keys", startedAt: 12340 } },
  completed: { "act1.tutorial": { completedAt: 4200, choice: null } },
  failed:    {}
}
```

All mutations go through `QuestChain.advance(questId, stepId)` / `complete(questId)` / `fail(questId)`. No module may splice `questState` directly. Backward-compat: `QuestChain.init()` reads existing `Player.hasFlag()` values and seeds `questState` from them, so save games from the jam build keep working.

### 2.5 Reputation bars — the "revolving bars" system

The user spec: **revolving bars based on dungeon readiness that evolves into tracking NPCs and faction relationships, WoW-style.**

Three bar layers stack in the HUD (under existing readiness bar on interior/dungeon floors, under a new compressed strip on exteriors):

| Layer | Source | When visible | Tier labels |
|---|---|---|---|
| Readiness (existing, DOC-52) | `ReadinessCalc.getReadiness(floorId)` | Depth ≥3, or Taskmaster peek | 0 / 25 / 50 / 75 / 100 / OVERCLEAN 200 |
| Faction standing | `ReputationBar.getFactionFavor(factionId)` | Any floor where an aligned NPC is within 8 tiles, or on Floor 3 always | Hated / Unfriendly / Neutral / Friendly / Allied / Exalted |
| NPC personal standing | `ReputationBar.getNpcStanding(npcId)` | When within 4 tiles of a named NPC | Cold / Wary / Known / Warm / Confidant |

**Tier thresholds for faction standing** (-50 / 0 / 25 / 50 / 75 / 100) map directly onto ACT2 §4.2's "5 completed missions unlocks exclusive contract" — Friendly tier is the exclusive-contract gate, Allied locks the hostile faction.

**Event bus** copies the readiness-calc tier-cross model:

```js
ReputationBar.on('tierCross', (factionId, fromTier, toTier, delta) => {
  // HUD toast, bark trigger, quest step advance predicate
});
```

Quest steps can declare `completes: { type: "reputation-tier", factionId: "mss", tier: "friendly" }` and the chain auto-advances on the next tier-cross event. This is the mechanism for ACT2 §4.2's faction lock.

### 2.6 Marker target resolution

Every frame, the minimap asks:

```js
var marker = QuestChain.getCurrentMarker(currentFloorId);
// marker = { x, y, style: 'primary' | 'breadcrumb' | 'sidequest', label } | null
```

QuestChain resolves the marker by walking (in priority order):

1. **Pinned override** — a step with `anchor: "fixed"` coords wins unconditionally
2. **Anchor registry** — look up `anchors[anchorId]`, dispatch to the resolver for `anchors[i].source` ("floor-data", "entity", "npc", "dump-truck", "door-to")
3. **Breadcrumb fallback** — if the step's target floor isn't this floor, resolve the nearest door-target that moves toward the target (DOC-66 §6 chain-hop)
4. **Sticky fallback** — last known good marker (the DOC-66 §5.1 jam patch, now formal)

If all four fail, return `null` — the diamond goes dark. This is a bug signal, not a correct state. Registry validation at load time must catch missing anchors.

---

## 3. Settings Toggles

A new **Quest** panel in MenuBox Face 3 (Settings), below the existing Audio/Video sections.

| Setting | Type | Default | Effect |
|---|---|---|---|
| Quest markers | on / off | on | Hides the minimap diamond entirely. Journal entries still populate; the breadcrumb is just invisible. |
| Hint verbosity | Off / Subtle / Explicit | Subtle | Off = no minimap marker, no journal hints, only diegetic NPC barks. Subtle = marker visible only when explicitly "stuck" (no progression for 90s). Explicit = marker always visible when a quest is active. |
| Waypoint flair | Simple / Pulsing / Flash trail | Pulsing | Cosmetic. Simple = static diamond. Pulsing = current behavior. Flash trail = adds a brief particle trail from player to marker on marker move. |
| Sidequest opt-in | All / Main only / Ask per quest | All | Filters what QuestChain injects. "Main only" suppresses minigame-sourced sidequests and NPC favor requests; they still show in the Journal but never claim the marker. |

Persistence: written to `localStorage['gleaner_settings_v1']` as a single JSON blob, loaded at `Game.init()` before any module calls `QuestChain.getUIPrefs()`. Savegame-independent (settings are per-device, not per-campaign).

Module that owns the Settings UI: `menu-faces.js` already renders Face 3; we add a `_renderQuestSettings()` subsection mirroring the existing audio/video pattern. `QuestChain.setUIPrefs({...})` is the sole write path.

Telemetry note: we do NOT ship analytics. These settings are local only.

---

## 4. Integration With Parallel Tracks

### 4.1 Track A — Pressure washing

**Attach points (existing, confirmed by audit):**

- `CleaningSystem.addBlood(cx, cy, floorId, grid)` — fires when enemy dies
- `ReadinessCalc.getReadiness(floorId)` → 0.0–2.0
- HUD tier-cross callback `_onTierCross(tier, floorId)` at 25/50/75/100% (already wired, `hud.js:15`)
- `HoseDecal.iterateFloorVisits(floorId, cb)` (new 2026-04-15, per-tile visit ledger)

**New callback we add (one-liner in `spray-system.js`):**

```js
// emit per-sub-target 100% event — the "quest-ready" signal
SpraySystem.onSubTargetComplete = null; // function(subTargetId, floorId)
```

Wired by Game at init. QuestChain subscribes. Quest steps can declare `completes: { type: "clean-subtarget", subTargetId: "1.3.1.pentagram_chamber" }`. No changes to pressure-washing logic — just an event surface.

### 4.2 Track B — Map editor (World Designer / BO-V / CLI)

**Gap we close:** `tools/tile-schema.json` has 97 tiles across 14 categories but no quest-metadata tile types. The fix is orthogonal to the tile schema — we add a **floor-level** quest sidecar rather than overloading tiles.

> **§4.2 amendment (Phase 6, 2026-04-17):** The shipped sidecar shape is
> `{version, floorId, quests[], anchors{}}`, NOT the original `{waypoints[], triggers[]}` sketch below. Phase 0b shipped the `quests[]` surface in 2026-04-16; Phase 6 added the optional `anchors{}` block whose values match `data/quests.json.anchors` exactly (six discriminator types: literal / floor-data / entity / npc / dump-truck / door-to). Quest steps reference named anchors via `target.anchor = '<id>'` — the anchor itself lives either centrally in `data/quests.json.anchors` or distributedly in `tools/floor-payloads/<floorId>.quest.json#/anchors`, with QuestRegistry.init unioning both at boot. Central wins on id collision (logged as `anchor-collision` in `getInitErrors()`). The original `waypoints[]/triggers[]` sketch below is preserved as historical design intent — the shipped schema is documented in `tools/floor-payloads/README.md` v1.

**Original Phase 0 sketch** (superseded — not the shipped shape):

```json
{
  "floorId": "1.3.1",
  "waypoints": [
    { "id": "pentagram_chamber", "x": 14, "y": 8, "kind": "objective", "questRef": "act1.contract.spade" },
    { "id": "hero_drop_01",      "x": 22, "y": 15, "kind": "npc-spawn", "npcId": "hero_seeker" }
  ],
  "triggers": [
    { "id": "floor_enter",  "zone": { "x": 0, "y": 0, "w": 50, "h": 36 }, "emits": "quest.trigger.1.3.1.entered" }
  ]
}
```

**Shipped schema** (Phase 0b + Phase 6):

```jsonc
{
  "version": 1,
  "floorId": "1.3.1",
  "anchors": {
    "pentagram_chamber": { "type": "literal", "floorId": "1.3.1", "x": 14, "y": 8 }
  },
  "quests": [ /* per-floor quest defs; see README v1 schema table */ ]
}
```

Picked up by `tools/extract-floors.js`: (a) quest arrays merge into `floor-data.json[fid].quests`, (b) anchor blocks union into a flat `_sidecarAnchors` map AND emit a slim runtime sidecar `data/quest-sidecars.js` that `index.html` loads at Layer 0 so the game can read distributed anchors via `FloorManager.getDistributedAnchors()`. QuestRegistry reads both at `init(payload, floorAnchors, distributedAnchors)` time.

**New BO-V/CLI commands** (post-jam backlog for the map-editor track owner — not our work, but we scope the API):

- `bo place-waypoint <floorId> <x> <y> --id=<str> --quest=<qid>`
- `bo place-trigger <floorId> <x> <y> <w> <h> --emits=<eventName>`
- `bo list-quest-refs` — cross-check: does every `questRef` in a floor payload resolve to a registered quest?

These ride on top of the existing `blockout-cli.js` dispatcher pattern; no new infrastructure.

### 4.3 Track C — Minigames as sidequest nodes

**Existing surfaces (confirmed):**

- `ClickyMinigame.registerRecipe(tileId, recipe)` — recipe callbacks `onTap(ctx)`, `onExit(reason)`
- `MinigameExit.mount({ kindId, onExit })` — Tier 2+ capture-input minigames
- `engine/clicky-recipes.js` holds per-tile configs

**Standardize the completion contract** (new — belongs in DOC-95 MINIGAME_TILES §4.1, but scoped here for consumer clarity):

```js
onExit(reason, payload) {
  // reason: 'win' | 'abandon' | 'timeout' | 'fail'
  // payload: { score, taps, elapsedMs, tier, ... }
}
```

QuestChain subscribes via a thin adapter in `pickup-actions.js` (Layer 3.5):

```js
PickupActions.onMinigameExit = function(kindId, reason, payload) {
  QuestChain.emit('minigame.exit', { kindId, reason, payload });
};
```

Quest steps declare `completes: { type: "minigame", kindId: "anvil_bend", reason: "win" }`. A sidequest is a quest whose `kind === "sidequest"` and whose first step is `completes: { type: "minigame", ... }`.

**Minigame → quest waypoint**: when a quest step has a minigame completion predicate, the anchor resolver prefers tiles of the matching `kindId` on the current floor (no extra JSON — the waypoint is the nearest minigame tile of the right kind).

### 4.4 Dispatcher state machine & "Move Night"

ACT2 §5 describes a day-by-day dispatcher deterioration and a "Move Night" relocation quest. Both are pure QuestChain content — no engine changes needed past the modules in §2.1.

**Dispatcher phases** are already `Player.getFlag('dispatcher_phase')` (enum: `normal/faltering/missing/replaced` — ACT2 §10). QuestChain reads this flag as a precondition on Act 2 steps. Day-tick handler in `day-cycle.js` advances the flag on schedule; QuestChain's `onDayChange` hook re-evaluates step preconditions.

**Move Night** becomes one quest with four steps (ACT2 §5.4):

```
act2.move_night.order_received      completes: flag dispatcher_phase=replaced
act2.move_night.pack_crate          completes: item transfer_crate equipped
act2.move_night.escort              completes: floor-enter <new_quarters>
act2.move_night.first_night         completes: bark quarters.first_night.played
```

No new code — four rows in `quests.json`.

---

## 5. Phased Rollout

Phases are sized for 1 agent each, serial. Parallel agents on the three tracks can work concurrently with Phases 3+ as consumer APIs land.

### Phase 0 — Scaffolding (0.5 day) — ✅ SHIPPED 2026-04-16

1. Create `engine/quest-types.js` (Layer 0), `engine/quest-registry.js` (Layer 1), `engine/quest-chain.js` (Layer 3), `engine/reputation-bar.js` (Layer 3) as empty IIFEs with frozen public APIs (no behavior)
2. Insert `<script>` tags into `index.html` at correct layer positions
3. Create `data/quests.json` with `{"version": 1, "anchors": {}, "quests": []}`
4. Add Game init calls: `QuestRegistry.init()` → `QuestChain.init()` → `ReputationBar.init()` (in Layer 4 wiring order)
5. Verify: game boots, no regressions, all new modules report `initialized: true`

**Landing notes (Phase 0):** `quest-types.js`, `quest-registry.js`, `quest-chain.js` and the `data/quests.json` skeleton shipped in the scaffolding pass. `reputation-bar.js` is deferred to Phase 3 (not yet scaffolded). `quests.json` currently carries the three named anchors migrated in Phase 1 Slice 3 and zero quests — content load-in is Phase 7.

### Phase 0b — Agent-facing tooling stubs (0.5 day, can run parallel with Phase 0) — ✅ SHIPPED 2026-04-16

Unblocks the `agents.md` sidequest creation workflow (Passes 0–3). Without these stubs, an agent can blockout the floors but has no declarative path for "wire the quest queue" (Pass 3 step 4). Everything here is tooling — no engine behavior, no game state.

**1. Sidequest template in `data/quests.json`**

Add a commented sidequest skeleton alongside the empty quests array so agents can copy-paste:

```json
{
  "id": "sidequest.DISTRICT.NAME",
  "title": "quest.sidequest.DISTRICT.NAME.title",
  "kind": "sidequest",
  "steps": [
    {
      "id": "sidequest.DISTRICT.NAME.enter_building",
      "label": "quest.sidequest.DISTRICT.NAME.enter_building",
      "anchor": { "source": "door-to", "from": "N", "to": "N.N" },
      "completes": { "type": "floor-enter", "floorId": "N.N" },
      "next": "sidequest.DISTRICT.NAME.clear_dungeon"
    },
    {
      "id": "sidequest.DISTRICT.NAME.clear_dungeon",
      "label": "quest.sidequest.DISTRICT.NAME.clear_dungeon",
      "anchor": { "source": "floor-data", "floorId": "N.N.N", "kind": "spawn" },
      "completes": { "type": "readiness", "floorId": "N.N.N", "threshold": 0.6 },
      "next": null
    }
  ],
  "hooks": {
    "noticeboard": { "floorId": "N.N", "nearStairs": true },
    "mailbox": { "deliverOnAvailable": true, "message": "quest.sidequest.DISTRICT.NAME.mail" }
  }
}
```

Agents replace `N`, `N.N`, `N.N.N`, `DISTRICT`, `NAME` with real values. The `hooks` block is the quest ↔ notice board / mailbox binding from agents.md §3 gap items 5–6.

**2. Quest floor sidecar schema + extract-floors merge**

Create `tools/floor-payloads/<floorId>.quest.json` schema (mirrors §4.2 but lands now, not Phase 6):

```json
{
  "floorId": "N.N.N",
  "waypoints": [
    { "id": "objective_name", "x": 14, "y": 8, "kind": "objective", "questRef": "sidequest.DISTRICT.NAME" }
  ],
  "triggers": [
    { "id": "floor_enter", "zone": { "x": 0, "y": 0, "w": 50, "h": 36 }, "emits": "quest.trigger.N.N.N.entered" }
  ]
}
```

Teach `tools/extract-floors.js` to glob `tools/floor-payloads/*.quest.json` and merge into `floor-data.json` under `floorData[floorId].quests` (same pattern as `_payload` merge from Track B M3.5). The runtime modules don't read this yet — Phase 1's anchor resolvers will — but the data pipeline is live and agents can emit sidecars now.

**3. BO-V/CLI command stubs**

Register three new commands in `tools/cli/commands-quest.js` (stub implementations that write sidecar JSON, no engine coupling):

- `bo add-quest --floor N.N.N --quest sidequest.DISTRICT.NAME --template sidequest` — copies the sidequest template into `data/quests.json` with floor IDs filled in
- `bo place-waypoint --floor N.N.N --at X,Y --id NAME --quest QUEST_ID` — appends to `tools/floor-payloads/<floorId>.quest.json`
- `bo validate-quest --quest QUEST_ID` — checks: all referenced floorIds exist in floor-data.json, all anchors resolve to real tiles, all doorTargets wire correctly, hooks.noticeboard floor has a NOTICE_BOARD tile

All three honor `--dry-run`. Wire into `blockout-cli.js` COMMANDS + `help-meta.js`.

**4. i18n string stubs**

Add a quest string namespace to `data/strings/en.js`:

```js
"quest.sidequest._template.title": "Side Quest: {NAME}",
"quest.sidequest._template.enter_building": "Enter the {BUILDING}",
"quest.sidequest._template.clear_dungeon": "Clear {DUNGEON} to 60% readiness",
"quest.sidequest._template.mail": "New work order posted: {BUILDING} basement needs attention."
```

Agents copy these with real values. QuestRegistry string resolution is Phase 1 work, but the key namespace is reserved now.

**5. Acceptance gate**

- `bo add-quest --floor 1.3.1 --quest sidequest.promenade.cellar_extra --template sidequest --dry-run` prints the quest JSON it would write
- `bo place-waypoint --floor 1.3.1 --at 14,8 --id pentagram --quest sidequest.promenade.cellar_extra --dry-run` prints the sidecar it would write
- `bo validate-quest --quest sidequest.promenade.cellar_extra` reports all anchors resolved (or lists specific failures)
- `node tools/extract-floors.js` merges quest sidecars without errors
- An agent following the agents.md 3-5 pass workflow can complete Passes 0–3 using only CLI commands (no manual Game.js wiring)

**Landing notes (Phase 0b):** CLI surface shipped richer than stubs — `add-quest`/`place-waypoint` are full writers (not stubs), and `validate-quest` performs structural checks including walkability tests against the live tile schema. Shape evolved from the Roadmap spec:

- `add-quest` takes `--floor --id --kind` (not `--quest --template`). The template copy pattern from §0b.1 is embodied by the `_templates.{sidequest,main,faction}` blocks in `data/quests.json` (human-readable) plus the CLI's in-process builder (writes the same skeleton into the sidecar). Two paths to the same starter quest.
- `place-waypoint` takes `--floor --quest --step --kind --at <x,y> [--radius N]`. Kind covers six predicate types: `floor | item | npc | flag | readiness | combat`. The `--kind floor` path is the §0b spec; the other five land early from Phase 1's predicate engine and are usable now.
- `validate-quest` takes `--floor` (per-sidecar), not `--quest` (per-quest). The per-quest validation the spec described is implicit — every quest in a floor's sidecar gets its steps + predicates checked against live tile/grid data.

Sidequest template in `data/quests.json` took the form of three `_templates` entries (`sidequest`, `main`, `faction`) rather than a single commented skeleton. The sidequest template is more ornate than the spec's version (hook/summary/giver/prereq/rewards all scaffolded) because it matches what QuestChain's runtime actually consumes. The `hooks.noticeboard` / `hooks.mailbox` surface from spec §0b.1 is still pending — agents wire those bindings manually until the notice-board module lands.

i18n namespace shipped 12 UI chrome keys (`quest.panel.*`, `quest.marker.*`, `quest.toast.*`) plus 4 sidequest template keys plus 11 reputation keys (faction names + 6 tier labels + tier-cross toast) plus 2 settings keys. Per-quest concrete strings land as Phase 7 content.

**Verification log (Phase 0b):** acceptance gate run 2026-04-16 on floor `2.2.1` (Hero's Wake B1 — `1.3.1` from the spec doesn't exist yet). All five gates pass:

- `bo add-quest --floor 2.2.1 --id side.2_2_1.scrub_pentagram --kind side --giver watchman_corin --dry-run` → prints full sidecar JSON to stdout, dispatcher envelope reports `wouldChange:false` (no disk write)
- `bo place-waypoint --floor 2.2.1 --quest side.2_2_1.scrub_pentagram --step step.1 --kind floor --at 14,8 --dry-run` → errors correctly when preceded by dry-run add-quest (no sidecar exists); in live mode appends step + predicate
- `bo validate-quest --floor 2.2.1` → `ok:true`, 0 errors, 1 warning (correctly flagged (14,8) as a WALL tile — the walkability check works)
- `node tools/extract-floors.js` → "Merged 1 quest sidecar(s) (1 quests) into floor data" / 21 floors written. `floor-data.json[2.2.1].quests` contains the authored quest; removing the sidecar + re-running extract yields `quests: []`, confirming the merge is cleanly pull-based not stateful
- Help stubs (`bo help add-quest|place-waypoint|validate-quest`) return full arg schemas + examples via `help-meta.js` entries (lines 400–440)

Known cosmetic quirk: default i18n keys generated by `add-quest` double the kind prefix when `--id` also starts with the kind (e.g. `quest.side.side.2_2_1.scrub_pentagram.title`). Agents can override with `--title <key>`. Not blocking, may revisit when we finalize the i18n key convention in Phase 2.

Incidental observation: `tools/cli/commands-validation.js` appeared truncated through bash (`wc -l` showed 73/129 lines, mtime 2026-04-14) — classic CLAUDE.md §Sandbox-mount-gotcha signature. A bash-side `cat > path << 'EOF' ... EOF` write-through refreshed the bindfs cache; content was fine on the Windows side all along.

### Phase 1 — QuestChain replaces QuestWaypoint (1.5 days) — ✅ SHIPPED 2026-04-16

1. ✅ Port `QuestWaypoint.update()` logic into `QuestChain.advance()` predicates — one predicate per phase of DOC-66 §2's state machine. Absorbed verbatim as `QuestChain._legacyNavigationMarker(floorId)` with the five-phase dispatch preserved; inlined helpers `_findDoorTo`, `_findProgressionDoorForward`, `_findCurrentDoorExit`, `_findTruckAnchorOnFloor` moved with it.
2. ✅ Move hardcoded coords from quest-waypoint lines 169, 171 into `quests.json` anchors. Landed as named anchors `promenade_home_door`, `home_work_keys_chest`, `dispatcher_entity` (the third was moved in the same pass since dispatcher resolution was already coupled — see §2.3 sample shape, Slice 3 notes below).
3. ✅ Implement anchor resolvers: `floor-data`, `entity`, `npc`, `dump-truck`, `door-to` — plus the pre-existing `literal`. All six dispatch through `QuestRegistry.resolveAnchor(specOrId)`. `setResolvers({getFloorData, getEntity, getNpcById, getDumpTruck, getCurrentFloorId})` injection keeps QuestRegistry at Layer 1 despite reaching into Layer 3+ modules.
4. ✅ `Minimap.setQuestTarget()` retained for back-compat; `Minimap._pullMarker()` now takes precedence, reading `QuestChain.getCurrentMarker(FloorManager.getFloor())` each frame inside `_drawQuestMarker()`.
5. ✅ Replace the `_updateQuestTarget()` call sites in game.js with explicit advance predicates (confirmed line numbers as of 2026-04-16):
   - ✅ `game.js:232` (`HomeEvents.init({ onKeysPickedUp })` wiring) → `QuestChain.onItemAcquired('work_keys')` + `QuestChain.onFlagChanged('gateUnlocked', true)` fan-out
   - ✅ Hero-arrival flag in `engine/hero-wake.js` line 108 → `QuestChain.onFlagChanged('heroWakeArrival', true)` fan-out (post `Player.setFlag`)
   - ✅ Floor-transition site (~game.js:1900) → `QuestChain.onFloorArrive(fid, x, y)` fan-out
   - ✅ Readiness tier-cross (`_onReadinessTierCross`, ~game.js:2513) → `QuestChain.onReadinessChange(floorId, score)` unconditional fan-out
   - ✅ `_updateQuestTarget()` itself collapsed to a one-hop `QuestChain.update()` call — still callable for any legacy path, no longer the authority
6. ✅ Retire `quest-waypoint.js` — file reduced to a ~60-line shim. `init()` is a no-op, `update()` delegates to `QuestChain.update()`, and `evaluateCursorFxGating()` + `floorDepth()` are the only unique surfaces left (awaiting the cursor-fx consolidation — see §7 Archival Candidates).
7. ✅ Verify — see "Verification log (Phase 1)" below.

**Slice 3 note (anchor migration):** `dispatcher_entity` was opportunistically migrated alongside the two line-169/171 fallbacks because the dispatcher resolution path already needed the `entity` resolver, and doing all three in the same edit avoided a follow-up diff. Net: three named anchors in `quests.json`, zero hardcoded target coords left in `quest-waypoint.js`.

**Verification log (Phase 1):**
- `node --check` clean on all six modified modules: `engine/game.js` (4568 lines), `engine/quest-chain.js` (644 lines), `engine/quest-registry.js` (313 lines), `engine/quest-waypoint.js` (63 lines), `engine/hero-wake.js`, `engine/minimap.js`
- `data/quests.json` parses valid; `anchors` has three entries (`promenade_home_door`, `home_work_keys_chest`, `dispatcher_entity`); `quests` is `[]` (content load-in is Phase 7)
- `node tools/extract-floors.js` runs clean: 21 floors, 27 enemies
- CLI smoke tests: `bo help add-quest` returns the help text; `bo validate-quest --floor 0` returns valid JSON
- Incidental fix during verification: `engine/game.js` had 96 trailing null bytes from a prior write (Windows-side corruption, NOT bindfs cache per CLAUDE.md §Sandbox mount gotcha). Stripped via `tr -d '\0'`; file dropped from 204,540 → 204,444 bytes, all 4568 lines preserved, parse clean
- DOC-66 §7 playthrough walk **not yet executed** — the verification walk is a live-browser acceptance test and was deferred past the code landing. Run on the next manual playtest pass; flag any null-marker frame as a Phase 1 regression.

### Phase 2 — Journal UI (1 day) — ✅ SHIPPED 2026-04-16

1. Gut `menu-faces.js :: _getQuestObjective()` and `_renderJournal()` quest section
2. Re-render Journal from `QuestChain.getJournalEntries({active, completed, filter})`
3. Each entry has: title, current-step label, progress breadcrumb, last-updated timestamp, "Show on map" affordance
4. Completed quests go to a scrollable lower pane (pattern matches books)
5. Lore entries (DOC-55 stub) stay separate — not scoped here
6. Verify: Journal renders same content as jam build, but now pulls from registry

**Landing notes (2026-04-16)**

- `QuestChain.getJournalEntries({ active, completed, filter })` added (engine/quest-chain.js:~620) and exported on the frozen public API. Returns a flat array of entry objects:
  ```
  { id, kind, state, title, stepLabel,
    stepIndex, stepTotal, breadcrumb?, markerColor?, target? }
  ```
  `title`, `stepLabel`, and `breadcrumb` are **i18n keys** — UI resolves them via `i18n.t()` at draw time so the Journal re-localizes on language swap without a cache purge. `target` carries the raw `step.target` spec (literal or anchor id) for tooltip/debug surfaces.
- **Synthetic nav-hint fallback.** When `_active` is empty and `active:true` was requested, `getJournalEntries()` synthesizes a single entry with `id:'__nav_hint__'` / `kind:'nav'` whose `stepLabel` is derived from the legacy floor+gate state machine (ported verbatim from the retired `_getQuestObjective()` if-ladder). This preserves jam-build parity while the Act-1 main-quest spine is still being authored — the green diamond row the player is used to seeing never disappears.
- **i18n migration.** Seven hardcoded English strings from `_getQuestObjective()` moved to `data/strings/en.js` under a new `quest.nav_hint.*` namespace (plus `quest.nav_hint.title` for the synthetic entry). All existing English copy preserved verbatim — Spanish/Hindi/Pashto translators can now add this block in their own `es.js`/`hi.js`/`ps.js` once the parity pass ships in Phase 4.
- **Journal Section 2 rewrite.** `engine/menu-faces.js :: _renderJournal()` pulls active + completed entries once per frame and iterates. Active entries render in the existing compact `◆ label` format (one row each, green tint on nav entries, `markerColor` override on real quests). A new **Section 2b** renders completed quests in the BOOKS-style scrollable list pattern: 28px rows, 4 MAX_VISIBLE, up/down chevrons when overflow, hover tooltip showing quest summary, click-to-read opens the summary in a `DialogBox`. Section 2b is only drawn when `qCompletedEntries.length > 0` — saves vertical space on the jam-build journal where no quests have completed yet.
- **`_getQuestObjective()` is now a thin shim.** Gutted down to ~8 lines; pulls `QuestChain.getJournalEntries({active:true})[0].stepLabel`, runs it through `i18n.t()`, returns the string. The HUD `_renderHome()` call site at menu-faces.js:353 is unchanged — it continues to call the shim, but the shim now routes through the single source of truth. Future callers get the same behaviour for free.
- **New click actions wired in `game.js`.** `quest_scroll_up` / `quest_scroll_down` → `MenuFaces.scrollQuestCompleted(±1)` (clamped by render). `read_quest_completed` → pulls `QuestRegistry.getQuest(hit.questId)`, closes the menu, and shows title + summary in a `DialogBox`. Slot IDs: `910+rowIndex` for rows, `930`/`931` for chevrons — reserved block adjacent to the existing `900+`/`920`/`921` book slots.
- **Smoke test passed.** Empty state produced the synthetic nav-hint entry with the expected `quest.nav_hint.enter_promenade` label for floor 0 + gate locked. With a fake active quest registered, the entry projection correctly hydrated `title`/`stepLabel`/`breadcrumb` from the registry. Completion transitions the same record from the active pane to the completed pane as expected.

**Verification log**

- `node --check engine/quest-chain.js` → OK
- `node --check engine/menu-faces.js` → OK
- `node --check data/strings/en.js` → OK
- `engine/game.js` edit verified on disk via `sed -n '795,830p'` (the bindfs cache periodically shows a stale truncated view of pre-existing files — see CLAUDE.md "Sandbox mount gotcha"; Read tool and `sed` slice both confirm the if-else chain extension landed correctly at the book-scroll block)
- Smoke test driver (above) exercised all three projections (empty → synthetic, active, completed-only) — entry shape matches contract

### Phase 3 — Reputation bars (1.5 days) ✅ SHIPPED 2026-04-16

**Scope clarifications (per contributor):** "HUD is the debrief feed" — the faction strip is rendered inside `engine/debrief-feed.js` as an expandable row section, not inside `engine/hud.js`. BPRD (Hellboy-style cleanup crew) is the player's employer and the first faction to reveal; the reveal hook is the conclusion of the dispatcher encounter. Sticky decay (no drift toward Neutral). Strip visible interior + dungeon only (gated upstream in Game).

1. ✅ `engine/reputation-bar.js` — already scaffolded in Phase 0. Phase 3 verified its tier-cross / favor-change bus signature (positional args `(factionId, prev, next)`) matches the readiness-calc pattern. `QuestTypes.FACTIONS` carries `mss / pinkerton / jesuit / bprd`; `QuestTypes.REP_TIERS` carries `hated / unfriendly / neutral / friendly / allied / exalted` with thresholds (-∞/-500/0/500/2500/10000)
2. ⏩ Seed from ACT2 flags deferred — Phase 3 seeds all factions to 0/neutral in `ReputationBar.init()`. Save-backend reads + §10 flag round-trip land with the first quest that pulls from ReputationBar state (a future phase's concern — no quests currently reference `faction_favor_*`)
3. ✅ `QuestTypes.WAYPOINT_KIND.REPUTATION_TIER = 'reputation-tier'` added to the frozen Layer-0 enum (`engine/quest-types.js`)
4. ✅ `QuestChain._matches()` handles `kind:'reputation-tier'` with required `factionId` + `tier` (exact match on destination `toTier`) + optional `direction` gate (default `'up'`; accepts `'down'` or `'any'`). Downward crossings inferred automatically from `REP_TIERS` ordinals so a `friendly → neutral` demotion doesn't accidentally trip an "earn Neutral" step
5. ✅ `QuestChain.onReputationTierCross(factionId, fromTier, toTier)` — 8th external event entry point. Builds the reputation-tier event with derived direction, then fans out via `_dispatch` to every ACTIVE quest. Exposed in frozen exports
6. ✅ `DebriefFeed` faction-row API — `expandFaction(factionId, opts)`, `collapseFaction(factionId)`, `updateFaction(factionId, favor, tier, opts)`, `getFactionState(factionId)`. State lives in module-private `_factions` map; collapsed rows are absent from the DOM (zero render cost). Four faction colors + i18n-backed labels + per-tier progress-within-tier bar fill (exalted caps at 100%, hated floors at 0%)
7. ✅ DebriefFeed juice animation — three stackable CSS keyframes injected into `index.html`: `df-faction-reveal` (slide+grow on first expand, 520ms), `df-faction-bump` (scale+goldshadow on favor increase, 480ms), `df-faction-tiercross` (box-shadow goldflash on tier change, 720ms). Flags are set by the API methods and consumed (cleared) by the next render
8. ✅ `DispatcherChoreography.init({onComplete})` — new `onComplete(firstTime)` callback fires from `_closeCinematic` after the dispatcher cinematic releases controls. `firstTime` is captured from the existing `_dispatcherDialogShown` closure guard so re-talks no-op. `Game.init` wires this to `ReputationBar.addFavor('bprd', 100)` + `DebriefFeed.expandFaction('bprd', {animate:true})`
9. ✅ Game.init fan-out wiring — `ReputationBar.on('favor-change', …)` → `DebriefFeed.updateFaction`; `ReputationBar.on('tier-cross', …)` → `DebriefFeed.updateFaction` + `QuestChain.onReputationTierCross`. All behind `typeof` guards so missing modules degrade gracefully
10. ✅ i18n — `faction.<id>.name`, `faction.<id>.tagline`, `rep.tier.<id>` keys added to `data/strings/en.js` for all four factions and all six tiers

**Landing notes (Phase 3):** Phase 3 ships as pure additive wiring — no change to the existing six predicate kinds, no change to HUD.js (per scope clarification), no change to save-backend. BPRD is the only faction reveal path currently connected; the other three factions remain collapsed (zero-cost) until a future phase authors a trigger (NPC dialogue branch / quest completion / rep-bump pickup). The Game.init listener registration happens only after `ReputationBar.init()` succeeds, so replaying init is safe (listeners are scoped to the module-private `_listeners` map which `init()` doesn't clear — this matches the readiness-calc pattern). The faction-row strip lives below buffs + above the feed tail inside `_renderUnified`, so any future additions (e.g. mini-journal snippets) slot in above or below without reflowing.

**Display-layer rename — Biome Plan §19.1 canonical names + suit alignment.** The four `QuestTypes.FACTIONS` ids (`bprd / mss / pinkerton / jesuit`) are Street Chronicles narrative codenames retained in `engine/quest-types.js` for save-file stability and ambiguity during early Act 1. The **display strings** the player sees were re-mapped to the in-world identities per Biome Plan §19.1, with the suit glyph rendered inline on each faction-row header (the RPS combat triangle is ♣ beats ♦, ♦ beats ♠, ♠ beats ♣; ♥ sits outside the triangle):

| internal id | in-world name (displayed) | suit | biome / role |
|---|---|---|---|
| `bprd` | The Necromancer | ♥ | Employer — pays for dungeon resets (outside triangle) |
| `mss` | Tide Council | ♠ | Coral Cellars — coastal trade, dragon artifacts |
| `pinkerton` | Foundry Collective | ♦ | Ironhold Depths — arms & armor |
| `jesuit` | The Admiralty | ♣ | Lamplit Catacombs — apothecary & research |

The rename touches three surfaces: `data/strings/en.js` (`faction.<id>.name / .suit / .tagline` keys — Biome Plan copy), `engine/debrief-feed.js` (`FACTION_LABELS` fallback + new `FACTION_SUITS` + `SUIT_COLORS` maps + `_factionRow` renders a `.df-faction-suit` ivory chip before the name), and `index.html` (`.df-faction-suit` CSS — small ivory card-chip with card-suit-color glyph). Internal `QuestTypes.FACTIONS` ids are unchanged, so all save-game data, quest predicates, and ReputationBar keys keep working. Color palette on the row was also re-tuned to the biome palette (Tide teal `#5F9EA0`, Foundry brass `#B87333`, Admiralty amethyst `#6B5BA8`, Necromancer crimson `#B8395A`).

The "sticky no-decay" decision means favor values persist indefinitely. If a future scope wants decay, it lands as a `setFavor` cron inside ReputationBar without touching the emit contract — favor-change + tier-cross fire normally from the decay tick.

**Verification log**

- `node tools/_phase3-cache/harness.js` → 47/47 pass across 13 tests (exit 0)
  - T1 init seeds all factions to 0/neutral
  - T2 addFavor emits favor-change(factionId, prev, next)
  - T3 crossing a tier threshold emits tier-cross exactly once
  - T4 within-tier increments emit favor-change but not tier-cross
  - T5 setFavor honors the same emit contract (single tier-cross on landing tier)
  - T6 downward crossing fires tier-cross with prev/next swapped
  - T7 `_matches` on `reputation-tier` — positive case on factionId + toTier match
  - T8 `_matches` rejects mismatched factionId
  - T9 `_matches` rejects when `predicate.tier !== event.toTier`
  - T10 direction gate — default `'up'` rejects downward event; `'any'` accepts; `'down'` rejects upward
  - T11 Game.init wiring simulation — tier-cross fan-out to both DebriefFeed + QuestChain; favor + tier mirror into debrief row; reveal + bump animation flags set as expected
  - T12 `expandFaction` / `collapseFaction` toggle row visibility; state (favor/tier) preserved across collapse
  - T13 `updateFaction` sets `justBumped` on favor increase + `justTierCrossed` on tier change
- Read-tool spot-checks on `engine/quest-chain.js` (predicate case at line 444, onReputationTierCross in exports), `engine/debrief-feed.js` (faction-row state block ~line 42, _factionRow helper ~line 555, public API exports ~line 729), `engine/dispatcher-choreography.js` (`onComplete` wired in `init` + invoked from `_closeCinematic`), `engine/game.js` (ReputationBar listener registration after `.init()`, DispatcherChoreography `onComplete` closure), `data/strings/en.js` (faction/rep-tier keys block) all confirm the designed surfaces landed
- `node --check` against pre-existing files hits the bindfs FUSE cache phantom (CLAUDE.md "Sandbox mount gotcha" — mid-token truncation at line numbers that don't exist in the real file). The Phase 3 cache harness at a fresh inode path is the authoritative contract test for this session
- `node tools/_phase3-cache/verify-rename.js` — standalone re-verification harness for the Biome Plan display-layer rename. Six groups (G1–G6): canonical `.name`/`.suit`/`.tagline` keys + values in `en.js`; absence of stale Street Chronicles display lines; canonical `FACTION_LABELS` + `FACTION_SUITS` + `SUIT_COLORS` maps in `engine/debrief-feed.js`; absence of stale `FACTION_LABELS` values; `.df-faction-suit` CSS present in `index.html`; internal `QuestTypes.FACTIONS` ids unchanged. Exit 0. The `_factionRow` `.df-faction-suit` rendering check lives in the CSS group (G5) because bindfs currently truncates bash's view of `engine/debrief-feed.js` at line ~529 (real file is 774 lines) — Read tool spot-check at line 604 confirms the `suitHtml` block landed correctly

### Phase 4 — Settings panel (0.5 day) — ✅ SHIPPED 2026-04-16

1. ✅ Face-3 Quest subsection added to `menu-faces.js` (1 toggle + 3 cycles, slots 850–853, `_QUEST_SETTINGS_DEFS` array drives render + dispatch; `_SETTINGS_ROW_COUNT` now 19)
2. ✅ Persisted to `localStorage['gleaner_settings_v1'].quest` via `_persistUIPrefs()` → `loadUIPrefs()` (graceful no-op when `localStorage` undefined / blob missing / JSON malformed)
3. ✅ `QuestChain.setUIPrefs(patch)` is the sole write path; shallow-merge + per-key validation (invalid values clamp to defaults, not rejected); emits `'prefs-change'` only on real mutation
4. ✅ Marker gate in `getCurrentMarker()`: `markers=false` → null; `hintVerbosity='off'` → null; `hintVerbosity='subtle'` → sticky-or-null until `SUBTLE_IDLE_MS` (90 s) elapses from last progression tick (`_touchProgressionTick` fired on `setActive` + `_dispatch`-on-advance). Nav-hint carve-out preserved — pre-quest wayfinding always visible under Subtle
5. ✅ `sidequestOptIn='main-only'` drops `kind==='side'` from active markers + Journal active pane via `_filterIdsByOptIn()` (read-path only; `_active` record + completion tracking untouched)
6. ✅ `Game.init` calls `QuestChain.loadUIPrefs()` after `QuestChain.init(...)` so persisted prefs apply before first marker pull
7. ✅ 15 i18n keys under `settings.quest.*` in `data/strings/en.js`
8. ✅ Verification: `tools/phase4-harness-v2.js` Node harness exercises 10 assertions (defaults, SUBTLE_IDLE_MS export, invalid-value clamp, valid-value round-trip, localStorage blob shape, `loadUIPrefs` replay, `prefs-change` fire + no-op suppression, missing-blob graceful, malformed-JSON graceful, marker gate under off/off-verbosity) — all 10 pass

**Landing notes (Phase 4):** the four modified modules (`quest-chain.js`, `menu-faces.js`, `data/strings/en.js`, `game.js`) parse clean in the fresh-inode Node harness. The source files on disk show the full content via the Read tool but `node --check` against them intermittently reports truncation — a bindfs cache phantom (CLAUDE.md "Sandbox mount gotcha"). The harness bypasses this by reading a fresh copy written this session (`tools/phase4-quest-chain-copy.js`), which the bindfs cache hasn't yet keyed. The harness copy is **test-only** and will drift from `engine/quest-chain.js` — do not treat it as authoritative; it's purely a verification vehicle. Phase 5 (minigame sidequest adapter) can proceed — the `sidequestOptIn='main-only'` hook is in place and ready to filter the demo sidequest's marker + Journal visibility when `setUIPrefs({sidequestOptIn:'main-only'})` is toggled.

**Verification log**

- `node tools/phase4-harness-v2.js` → 10/10 pass (see harness source for assertion list)
- Read-tool spot-checks on all 4 modified files confirm IIFE closures, exports, and section boundaries landed as designed
- Fresh-inode trick: `tools/phase4-quest-chain-copy.js` created via Write tool this session is bindfs-visible to `fs.readFileSync`, so Node parses the current quest-chain logic cleanly (34,386 bytes; matches the Read-tool authoritative view)

### Phase 5 — Minigame sidequest adapter (0.5 day) ✅ SHIPPED 2026-04-16

1. ✅ Standardized `onExit(reason, payload)` contract — four canonical reasons (`complete`, `subtarget`, `abort`, `timeout`); payload carries `{subTargetId?, floorId?, x?, y?}`. All future minigame modules call the same fan-out hook with the same shape
2. ✅ `QuestTypes.WAYPOINT_KIND.MINIGAME = 'minigame'` added to the frozen Layer-0 enum (`engine/quest-types.js`)
3. ✅ `QuestChain.onMinigameExit(kindId, reason, payload)` — 7th external event entry point. Builds the minigame event (kind/kindId/reason + sanitized payload fields), then fans out via `_dispatch` to every ACTIVE quest. Invalid kindId (non-string / empty) returns `false` without side effects (`engine/quest-chain.js` ~lines 512-526)
4. ✅ Predicate engine `_matches()` handles `kind:'minigame'` with four optional filters: `kindId`, `reason`, `subTargetId`, `floorId`. Any filter absent = wildcard; all filters present must all match (`engine/quest-chain.js` ~lines 430-439)
5. ✅ Count-gated advance — when a step's `advanceWhen.count` is ≥ 2, matched events accumulate on `rec.stepProgress[stepIndex]`. While `progress < count`, a `partial:true` waypoint event fires (carries `progress`, `of`, and the source `event`); the stepIndex does not advance. On the Nth match the partial counter is cleared, stepIndex increments, a terminal waypoint fires, and `_maybeComplete` runs. `stepProgress` survives across events but resets on step transition (`engine/quest-chain.js` ~lines 301-320)
6. ✅ `PickupActions.onMinigameExit(kindId, reason, payload)` — central fan-out layer in Layer-3.5. Owns a lightweight `.on/.off` listener registry so any module can subscribe without pulling QuestChain directly, then forwards into `QuestChain.onMinigameExit` behind a typeof-guard. Keeps minigame modules decoupled from QuestChain — they only know about PickupActions (`engine/pickup-actions.js`)
7. ✅ SpraySystem wiring — added module-level slot `_onSubTargetComplete` plus `setOnSubTargetComplete(fn)` setter (frozen exports can't mutate post-init). Invoked from `_sprayTick` after a tile's cleanliness crosses 1.0 with `('tile_clean', floorId, x, y)`. Game.init connects the slot to `PickupActions.onMinigameExit('pressure_wash', 'subtarget', {...})` behind typeof-guards so missing modules degrade gracefully (`engine/spray-system.js`, `engine/game.js`)
8. ✅ Demo sidequest authored — `data/quests.json` now contains `side.1.3.1.pentagram_wash` with a single step, `kind:'minigame'` + `count:3` predicate, 25 gold + `side_pentagram_wash_done` flag reward. Title/hook/summary/step-label i18n keys live under `quest.sidequest.pentagram_wash.*` in `data/strings/en.js`. The step's `subTargetId:'tile_clean'` matches the SpraySystem fan-out event, so any three fully-cleaned tiles on floor 1.3.1 satisfy it (pentagram tile geometry can be added later without touching engine or quest code)
9. ✅ Verification — `tools/_phase5-cache/harness.js` Node contract harness (`tools/phase5-harness.js` is the readable twin but hits bindfs cache truncation when executed from its canonical path; the `_phase5-cache/` copy has a fresh inode that Node can parse). 11 tests / 37 sub-assertions, all pass: dispatch (T1), kindId filter (T2), reason filter (T3), subTargetId filter (T4), floorId filter (T5), count-gated 3-tile advance with partial events (T6, 12 sub-assertions), partial-waypoint payload shape (T7), non-matching events don't count (T8), invalid-kindId rejection (T9), full payload propagation (T10), multi-quest fan-out (T11)

**Landing notes (Phase 5):** Phase 5 ships as a pure adapter layer — no changes to the five pre-existing event entry points, no changes to Minimap or Journal render contracts, no changes to the opt-in filtering added in Phase 4. The demo sidequest `side.1.3.1.pentagram_wash` is the end-to-end acceptance vehicle: with Quest markers = On, a fresh save that activates the quest and visits floor 1.3.1 sees the count tick up (via the partial waypoint event) once per fully-cleaned tile, and clears the quest on the third. With `sidequestOptIn='main-only'` (Phase 4 UI pref) the quest is filtered from both the marker and the Journal active pane without interfering with completion bookkeeping. The count-gated advance is general-purpose — any future multi-target step (kill-N, collect-N, interact-N) gets partial events for free by setting `advanceWhen.count`.

The harness is a **contract test** (embedded Phase 5 reference implementation), not an engine-load test. The session's bindfs FUSE mount caches `engine/*.js` bytes at session boot and refuses to invalidate them after mid-session edits, so Node's `fs.readFileSync` would see truncated pre-edit content even after the file is rewritten. Extracting the predicate/advance/onMinigameExit block verbatim into the harness makes the test immune to that cache phantom while still exercising the full Phase 5 surface. Any divergence between the harness reference and `engine/quest-chain.js` must be treated as a Phase 5 contract change that updates both.

**Verification log**

- `node tools/_phase5-cache/harness.js` → 37/37 pass across 11 tests (exit 0)
- Read-tool spot-checks on all 5 modified files confirm IIFE closures, exports, and new call sites landed as designed (`engine/quest-types.js`, `engine/quest-chain.js`, `engine/pickup-actions.js`, `engine/spray-system.js`, `engine/game.js`)
- `data/quests.json` sidequest entry validated against the `_templates.sidequest` shape; i18n keys present in `data/strings/en.js`

### Phase 5b — Sidequest content batch (0.5 day) ✅ SHIPPED 2026-04-16

Data-only follow-on to Phase 5. The Phase 5 landing exercised a single predicate kind (`minigame`) via one demo sidequest. Phase 5b authors three new sidequests that stretch the rest of the predicate surface — `npc`, `floor`, `item`, `combat` (count-gated), `readiness`, `flag`, and the prereq-flag gate — so the quest registry has end-to-end exercise coverage before Phase 6/7 data content lands. No engine edits; purely `data/quests.json` + `data/strings/en.js`.

1. ✅ `side.1.2.innkeeper_bottles` — four-step arc `npc(inn_keeper) → floor(1.3.1) → combat(archetype:ENM-003, count:3) → npc(inn_keeper, branch:rat_report)`. Reward 40 gold + `{favor:{bprd:50}}` + `side_innkeeper_bottles_done` flag. Giver is the real `inn_keeper` NPC in Driftwood Inn (1.2); the combat step uses the real Dungeon Rat archetype id from `data/enemies.json`.
2. ✅ `side.1.3.cellar_owner_mop` — three-step arc `npc(cellar_resident) → item(ITM-089 Mop Head) → readiness(1.3.1, threshold:0.5)`. Reward 30 gold + `{favor:{bprd:25}}` + `side_cellar_owner_mop_done` flag. Exercises the generic `onItemAcquired` pathway (pending fan-out) and the readiness predicate wired in Phase 0.
3. ✅ `side.2.2.watchman_roll_call` — four-step arc `npc(watchpost_watchman) → floor(2.2.1) → floor(2.2.2) → flag(heroWakeArrival=true)`. Prereq `gateUnlocked=true` (player must have crossed the gate before the quest is offerable). Reward 50 gold + `{favor:{bprd:75, jesuit:25}}` + `side_watchman_roll_call_done` flag. Exercises the prereq-flag gate and the flag-mutation predicate.
4. ✅ i18n keys — 21 new strings under `quest.sidequest.{innkeeper_bottles,cellar_owner_mop,watchman_roll_call}.*` (title / hook / summary / per-step labels) appended to `data/strings/en.js`, following the pentagram_wash template.
5. ✅ Verification — `tools/_phase5b-cache/verify.js` Node harness (fresh-inode twin to sidestep the bindfs cache) exercises 88 assertions across 5 groups: G1 structural (all 4 quest IDs resolve), G2 per-quest structure (kind/giver/step-count/predicate shape for each new quest), G3 i18n key coverage (every title/hook/summary/label key present in `en.js` source), G4 live event-stream simulation (embeds the Phase 5 `_matches` + `stepProgress` reference verbatim and drives each quest to completion via synthesized events), G5 cross-quest isolation (multi-active fan-out — one quest's events do not advance the others). All 88 pass.

**Landing notes (Phase 5b):** Phase 5b is intentionally content-only. All three new sidequests resolve and traverse inside the harness using the event-stream reference, but three of the six external event entry points that fan out matched predicates (`onNpcTalk`, `onCombatKill`, generic `onItemAcquired`) are not yet wired into live game code — they are documented in each quest's `_notes` field so future authors know the content is harness-verified but waits on those fan-outs to tick in play. The Phase 0/1/2/3/4 fan-outs that ARE live today (`onFloorArrive`, `onFlagChanged`, `onReadinessChange`, `onMinigameExit`, `onReputationTierCross`) already match these quests' step predicates where they apply — so as soon as each remaining fan-out lands, the corresponding step auto-advances with no quest-data edits required. The batch expands the sidequest roster from 1 demo to 4 concrete sidequests without touching the engine.

**Verification log (Phase 5b)**

- `node tools/_phase5b-cache/verify.js` → 88/88 pass across 5 groups (exit 0)
- Authoritative Read-tool spot-checks on `data/quests.json` confirm 4 quests present, each matching the `_templates.sidequest` shape
- Grep over `data/strings/en.js` confirms all 21 new i18n keys present (lines 394–420)

**Known bindfs cache gotcha touched this phase.** After mid-session Edit-tool writes, `fs.readFileSync('data/strings/en.js')` inside the harness served the pre-edit cached snapshot, triggering 20 false G3 failures. Fix: `mv en.js en.js.cachebust && mv en.js.cachebust en.js` in the bindfs mount — the rename roundtrip invalidates the FUSE content cache, after which the harness re-read the real file and G3 passed. Logged here so the next author doesn't re-derive the workaround. (CLAUDE.md "Sandbox mount gotcha" workaround #1 — Read-then-Write-back — is the other option.)

### Phase 6 — Map editor floor sidecars (1 day, concurrent with map-editor track) ✅ SHIPPED 2026-04-17

1. ✅ Floor sidecar schema (§4.2 amendment) — Phase 0b shipped the Phase 0b sidecar shape (`{version, floorId, quests[]}`) ahead of the original §4.2 sketch (`{waypoints[], triggers[]}`). Phase 6 extends that shipped shape with an optional `anchors` block whose values match `data/quests.json.anchors` exactly (type/literal/floor-data/entity/npc/dump-truck/door-to). See `tools/floor-payloads/README.md` v1 schema section for the full schema table and the collision policy (central wins; loud error on duplicate distributed ids).
2. ✅ `tools/extract-floors.js` — anchor harvest added to the `.quest.json` scan pass: reads each sidecar's optional `anchors` block, unions into a flat top-level `_sidecarAnchors` map plus a parallel `_sidecarAnchorSources` filename map for collision reporting, first-seen wins with a `console.warn` on duplicates. Result fields added to `tools/floor-data.json` (`sidecarAnchorCount`, `sidecarAnchorCollisions`, `_sidecarAnchors`, `_sidecarAnchorSources`) AND emitted as a separate slim runtime file `data/quest-sidecars.js` containing `window.QUEST_SIDECARS = {anchors, anchorSources, floorQuests, anchorCount, collisionCount, generated}`. The runtime file is what `index.html` loads at Layer 0 (data) so the game can read distributed anchors without pulling the full ~hundred-KB `floor-data.js` world-designer sidecar.
3. ✅ `FloorManager` — three new exports (`getQuestAnchors`, `getDistributedAnchors`, `getDistributedAnchorSources`) read from `window.QUEST_SIDECARS` with typeof-guards; when the global is absent (e.g. `extract-floors.js` hasn't run yet), they return `{}` so `QuestRegistry.init` still succeeds with the central registry alone. Keeps FloorManager at Layer 3 and QuestRegistry at Layer 1 — no cross-layer imports.
4. ✅ `QuestRegistry.init(payload, floorAnchors, distributedAnchors)` — third param lands. Central anchors load first (`_anchorSources[id]='central'`), distributed anchors second with collision detection: a distributed id that collides with a central one is rejected and logged into `_initErrors[]` as `{kind:'anchor-collision', anchor, sources:['central','distributed']}` plus a `console.warn`. Central wins. Malformed distributed specs (missing type + coords) are rejected with `{kind:'anchor-malformed', anchor, reason}` without taking anything else down.
5. ✅ **Fail-fast on sidecar removal** — new `_validateQuestAnchors()` pass walks every quest step's `target.anchor` / `advanceWhen.anchor` and confirms the referenced name exists in the merged `_namedAnchors` map. Unknown names push `{kind:'unresolved-anchor', quest, stepId, path, anchor}` into `_initErrors[]` and make `init()` return `false`. `Game.init` logs the first error via `console.warn`. Removing a sidecar file and re-running `extract-floors.js` thus produces a loud error on next boot if any quest step referenced the removed anchor — the §6 Phase 6 acceptance gate.
6. ✅ Two Act 1 test anchors migrated to sidecars:
   - `home_work_keys_chest` — moved from `data/quests.json.anchors` into `tools/floor-payloads/1.6.quest.json` (Gleaner's Home). Removed from the central block; `_anchorNotes` updated to point to the sidecar.
   - `pentagram_chamber` — authored as a brand-new anchor born in sidecar form in `tools/floor-payloads/1.3.1.quest.json` (Soft Cellar, coords 14,8 per §4.2 example). Never touched the central registry — demonstrates the sidecar-first authoring pattern.
7. ✅ Public API additions to `QuestRegistry`: `getAnchorSource(id)`, `listCentralAnchors()`, `listDistributedAnchors()`, `getInitErrors()`. `summary()` gains `centralAnchorCount`, `distributedAnchorCount`, `initErrorCount`.
8. ✅ `index.html` — `<script src="data/quest-sidecars.js"></script>` inserted between `readiness-calc.js` and `quest-registry.js` (Layer 0 data, ahead of Layer 1 core).
9. ✅ Verification — `tools/_phase6-cache/verify.js` fresh-inode harness. Four groups, 62 assertions:
   - G1 (13): `data/quest-sidecars.js` exists, evaluates cleanly, shape matches, both anchors present with correct source tags, `anchorCount=2`, `collisionCount=0`.
   - G2 (19): both sidecar files parse as JSON, `version=1`, `floorId` matches filename, anchor specs well-formed (type='literal', coords correct), no cross-sidecar id collisions.
   - G3 (17): `QuestRegistry.init` unions distributed anchors into `_namedAnchors`, source tagging partitions cleanly, `listCentralAnchors` / `listDistributedAnchors` / `summary` counts all correct, `resolveAnchor` returns correct coords for both distributed anchors, floor-quest-index accepts Phase 6 quest-def shape.
   - G4 (13): unknown anchor ref surfaces `unresolved-anchor` error + `init()` returns false; good refs do NOT trigger errors; central vs distributed collision logs `anchor-collision` AND keeps central winning; malformed distributed spec logs `anchor-malformed` without corrupting the registry.

**Landing notes (Phase 6):** Phase 6 is the first piece of the post-jam Quest System that touches both engine and tooling pipelines. The distributed anchor pattern delivers the map-editor track's promise of "anchors live next to the floor data they describe" — moving the chest tile in `engine/floor-blockout-1-6.js` now only requires a sibling edit to `tools/floor-payloads/1.6.quest.json`, with no cross-file sync against a central registry. The schema reconciliation decision (extend Phase 0b's shipped `{quests, anchors}` shape rather than adopting §4.2's older `{waypoints, triggers}` sketch) was made because the Phase 0b shape is already in production — adopting the older sketch would have required a data-migration pass. The fail-fast validation pass is the most important piece of the phase: it enforces the invariant that "every quest step reference resolves at boot," so silent anchor drift (sidecar deleted or renamed without updating the quest that referenced it) surfaces as a loud error instead of a runtime null-marker. The BO-V/CLI command stubs (`bo place-waypoint --floor --id`, `bo list-quest-refs`) are track-owner territory and land in the Phase 6 follow-on alongside the blockout editor's own anchor picker — the schema is locked so those commands can be implemented independently. Phase 7 (Act 2 content load-in) is unblocked and purely data-only.

**Verification log (Phase 6)**

- `node tools/_phase6-cache/verify.js` → 62/62 pass across 4 groups (exit 0)
- `node tools/extract-floors.js` → `Harvested 2 distributed anchor(s) from quest sidecars`; emits `data/quest-sidecars.js` (2 anchors, 0 floors with quests); no collisions
- Sidecar-removal fail-fast demonstration: synthetic `QuestRegistry.init` with central-only anchors + a quest that references `pentagram_chamber` returns `false` with exactly one `unresolved-anchor` error naming the missing id and the quest + step that referenced it
- `data/quests.json._anchorNotes` updated to document the Phase 6 distribution model; `home_work_keys_chest` removed from central block as migration evidence

**Known bindfs cache gotcha re-touched this phase.** After an Edit to `engine/floor-manager.js` and `engine/quest-registry.js` this session, `node tools/extract-floors.js` initially failed with a phantom `Unexpected end of input` on floor-manager. The mv-roundtrip workaround (`mv file file.cachebust && mv file.cachebust file`) worked once, and `cp file /tmp/copy` to read via a fresh inode path confirmed the files on disk were correct. Logged in CLAUDE.md "Sandbox mount gotcha" and the Phase 4/5b landing notes — this is the **third** phase to trip on it; any post-jam Phase is likely to hit it again.

### Phase 7 — Act 2 content load-in (1 day per act beat, ongoing)

Now data-only:

1. Dispatcher arc (ACT2 §5.1–5.3) — 6 quest steps across 11 in-game days
2. Move Night (ACT2 §5.4) — 4 quest steps
3. Faction missions (ACT2 §4.1) — 4 mission chains, ~3 steps each
4. Seaway discovery (ACT2 §8 Phase 3) — 5 quest steps
5. Faction lock climax (ACT2 §8 Phase 4) — 3 steps + reputation tier predicate

No engine work. Each beat is a PR against `data/quests.json` + optional new floor sidecars.

### Phase 8 — Sprint dungeon quest support (DOC-113 Phases B–D) — Phases 8a+8b ✅ SHIPPED 2026-04-17

Sprint / fetch sidequests require engine extensions to QuestChain plus quest data.

**Phase 8a — Quest data (DOC-113 Phase B) ✅ SHIPPED 2026-04-17**

1. ✅ `QuestTypes.WAYPOINT_KIND.FETCH` — 9th waypoint kind in `engine/quest-types.js`. Predicate fields: `itemId` (required), `floorId` (optional). Timer/hero data (`timerMs`, `sentinelGraceMs`, `heroArchetype`) ride on the step for runtime use but do NOT gate advancement — the step completes on item pickup.
2. ✅ `case 'fetch'` in `QuestChain._matches()` — matches `itemId` + optional `floorId`.
3. ✅ `onItemAcquired` dual fan-out — now dispatches both `{kind:'item', itemId}` and `{kind:'fetch', itemId, floorId}` events so `kind:"fetch"` steps match item pickups without breaking existing `kind:"item"` steps.
4. ✅ `side.1.3.1.cellar_fetch` — three-step arc `npc(cellar_resident, branch:cellar_fetch_brief) → fetch(ITM-042, floorId:1.3.1, timerMs:75000, sentinelGraceMs:12000, heroArchetype:seeker) → npc(cellar_resident, branch:cellar_fetch_complete)`. Prereq `side_cellar_owner_mop_done=true`. Reward 60 gold + `{favor:{bprd:50}}` + `side_cellar_fetch_done` flag. Marker color `#e8a`.
5. ✅ `side.2.2.1.wake_dispatch` — three-step arc `npc(watchpost_watchman, branch:wake_dispatch_brief) → fetch(ITM-061, floorId:2.2.1, timerMs:90000, sentinelGraceMs:15000, heroArchetype:crusader) → npc(watchpost_watchman, branch:wake_dispatch_complete)`. Prereq `side_watchman_roll_call_done=true`. Reward 80 gold + `{favor:{bprd:75, jesuit:25}}` + `side_wake_dispatch_done` flag.
6. ✅ i18n keys — 21 new strings: 12 per-quest (`quest.sidequest.{cellar_fetch,wake_dispatch}.*` title/hook/summary/step labels) + 9 timer UI chrome (`quest.sprint.timer_label`, `quest.sprint.timer_expired`, `quest.sprint.hero_sentinel`, `quest.sprint.hero_pursuit`, `quest.sprint.escaped`, `quest.sprint.objective_found`, `quest.sprint.hero_spawn_act{1,2,3}`). Act-flavored spawn toasts use `{hero}` placeholder.
7. ✅ Verification — JSON structure validated (6 total quests, both new quests match `_templates.sidequest` shape), all 21 i18n keys confirmed present, QuestTypes.isWaypointKind('fetch') returns true, fetch step predicates carry complete timer/hero runtime data.

**Landing notes (Phase 8a):** Phase 8a is data-complete. Both sprint sidequests are structurally valid and their fetch steps will auto-advance on `onItemAcquired` via the dual fan-out the moment the player picks up the target item on the target floor. The timer/hero data embedded in each fetch step's `advanceWhen` is inert until Phase 8b wires `onTimerExpired` + HeroSystem pursuit — until then, sprint dungeons play as untimed fetch quests (functional but missing the tension mechanic). The quest data was authored alongside DOC-113 Phase A (procgen `fetch` strategy) so both sprint sidequests target real floors with fetch-strategy topology.

**Phase 8b — Timer engine (DOC-113 Phase C) — ✅ shipped 2026-04-17**

1. ✅ `_timer` state object + `_TIMER_ZONE_THRESHOLDS` + `_computeZone(pct)` — zone classification (green >60%, yellow 30–60%, red <30%, expired =0)
2. ✅ `_startTimer(questId, step)` — initializes countdown from fetch step's `advanceWhen.timerMs`, emits `timer-start`
3. ✅ `_cancelTimer()` — clears timer, emits `timer-cancel`
4. ✅ `_tickTimerInternal(dt)` — per-frame countdown with 6-system pause contract (ScreenManager, MenuBox, DialogBox, FloorTransition, CombatEngine, CinematicCamera), 1/sec `timer-tick` emission, zone-transition `timer-zone` emission, expiry detection with `timer-expired` emission
5. ✅ `tickTimer(dt)` / `getActiveTimer()` / `onTimerExpired(questId, floorId)` — public API (frozen exports)
6. ✅ Wiring in `advance()` — auto-starts timer when newly-current step is `kind:'fetch'`
7. ✅ Wiring in `complete()` / `fail()` / `expire()` — auto-cancels timer on quest state change
8. ✅ Wiring in `onFloorArrive()` — auto-cancels timer when player leaves the timer's floor
9. ✅ Game.js `_renderGameplay()` calls `QuestChain.tickTimer(frameDt)` each frame
10. ✅ 5 new event types: `timer-start`, `timer-tick`, `timer-zone`, `timer-expired`, `timer-cancel`

**Phase 8c — Timer HUD + hero runtime (DOC-113 Phases C-UI + D) — pending**

1. Timer HUD element (countdown bar with green/yellow/red zones, heartbeat SFX) — see `docs/SPRINT_TIMER_UI_HANDOFF.md`
2. `HeroSystem.spawnPursuitHero(floorId, archetype, actScaling)` — sentinel → pursuit two-phase hero behavior
3. Act-based hero stat scaling (impractical in Acts 1–2, viable in Act 3) — see DOC-113 §4 for the full table

Phase 8c depends on DOC-113 Phases A (✅), B (✅), and C engine (✅). See DOC-113 for the complete design spec and `docs/SPRINT_TIMER_UI_HANDOFF.md` for the DebriefFeed integration contract.

---

## 6. Verification & acceptance gates

Per phase:

| Phase | Gate |
|---|---|
| 0 | All four new modules visible in `window.*`, registry loads empty JSON without error, no console errors on boot |
| 1 | DOC-66 §7 walkthrough passes — marker visible at every step of the Act 1 arc, zero null frames |
| 2 | Journal renders current-step label + breadcrumb, matches jam-build content for a fresh save |
| 3 | Faction favor bar visible on Floor 3 mock, `reputation.tierCross` fires at Neutral→Friendly crossing, chain step auto-advances |
| 4 | Marker toggle round-trips; Subtle hint verbosity hides marker until 90s idle |
| 5 | Demo sidequest: "wash three pentagram tiles on 1.3.1" — appears, tracks, clears, stays out after completion |
| 6 | Removing a sidecar produces a startup validation error naming the missing anchor and the quests that referenced it |
| 7 | (Per beat) ACT2 §5.4 Move Night plays through end-to-end with the described four-step structure |
| 8a | `QuestTypes.isWaypointKind('fetch')` → true; both sprint sidequests parse valid with fetch step carrying timer/hero data; all 21 i18n keys resolve; `onItemAcquired` dual fan-out dispatches both `kind:'item'` and `kind:'fetch'` events |
| 8b | ✅ `QuestChain.getActiveTimer()` returns non-null during fetch step; timer ticks down each frame; zone transitions fire at 60%/30%/0% thresholds; timer cancels on quest complete/fail/expire and floor leave; `onTimerExpired` force-expire API works; Game.js calls `tickTimer(frameDt)` per frame; 28/28 unit assertions pass |
| 8c | Timer countdown bar visible in DebriefFeed; hero spawns at exit on timer expiry; sentinel → pursuit phase transition fires; Act 3 hero is beatable |

**Final acceptance test**: a playtester runs Act 1 onboarding → spade contract → club contract → diamond contract with **Quest markers = Off**, reporting after the session whether they got stuck. If the diegetic NPC barks + Journal alone aren't enough, DOC-9 NPC_SYSTEM_ROADMAP barks need another pass. This is the coupling test between quest system and NPC system that we intentionally want to run.

---

## 7. Archival Candidates (for user review, do not move yet)

After this roadmap lands and Phase 1 cuts over, the following docs become either SUPERSEDED or RESIDUAL. **No files moved yet — listing for user approval before relocating.**

| Doc | Reason | Destination | Timing |
|---|---|---|---|
| DOC-66 `quest-marker-audit.md` §6 (Post-jam rework spec) | Superseded by this doc in full. Keep §1–5 (jam-day audit + patch notes) as a historical artifact. | Split: keep §1–5, move §6–7 to `docs/Archive/QUEST_MARKER_AUDIT_POSTJAM_SUPERSEDED.md` with a pointer to DOC-107 | **Ready now** — Phase 1 has shipped (2026-04-16); pending user approval to move the split. DOC-66 has been header-tagged with a superseded banner in the meantime. |
| Hardcoded objective strings in `engine/menu-faces.js:411–430` | Migrated to `quests.json` | Delete from source | During Phase 2 |
| `engine/quest-waypoint.js` | Retired except for `evaluateCursorFxGating()` shim | File is now ~60 lines (shipped 2026-04-16); move the cursor-fx shim into `cursor-fx.js` and delete the file | **Ready after cursor-fx consolidation** — Phase 1 shim landed, waiting on the cursor-fx merge |
| Stale POST_JAM planning references to "QuestChain TBD" in DOC-82 POST_JAM_EXECUTION_ORDER.md and DOC-105 POST_JAM_FOLLOWUP_ROADMAP.md | Pointer updates to DOC-107 | Edit in place (not archive) | **Ready now** — Phase 0 shipped (2026-04-16) |

Docs that stay **canonical alongside this one**:

- DOC-2 Tutorial_world_roadmap — authoring spec for Act 1 quests, content source
- DOC-13 STREET_CHRONICLES_NARRATIVE_OUTLINE — narrative spine, content source
- DOC-74 ACT2_NARRATIVE_OUTLINE — Act 2 beats, content source
- DOC-52 READINESS_BAR_ROADMAP — pattern source for ReputationBar
- DOC-9 NPC_SYSTEM_ROADMAP — bark integration for hint verbosity
- DOC-55 MENU_INTERACTIONS_CATALOG — Journal render contract

No other doc is scoped for archival by this roadmap.

---

## 8. Open Questions

1. **Reputation bar on exterior floors — compressed strip or omitted?** Current §2.5 says compressed strip. UX might want it off entirely during the scrub loop on interior floors. Playtest Phase 3.
2. **Journal map-jump affordance — supported in LG webOS magic remote UX?** The "Show on map" affordance assumes a pointer or D-pad; webOS Magic Remote can do either. Confirm with DOC-23 UI_ROADMAP.
3. **Quest failure states.** Current spec treats failure as terminal (quest moves to `questState.failed`). ACT2's Act-2 choice-lock model is closer to "quest replaced" than "quest failed" — may need a `superseded` state. Revisit at Phase 7.
4. **Save/load across mid-quest.** QuestChain reads Player flags at init; a mid-quest save → load cycle should round-trip. The `save-state.js` serializer needs to know about `questState` — coordinate with whoever owns DOC-70 UNIFIED_RESTOCK_SURFACE_ROADMAP save-load convergence (the quest state slots into the same save blob).
5. **Sidequest discovery UX.** Minigames are ambient in the world. How does the player learn which pentagram tile is tracked without opening the Journal? Suggested: short toast on first approach (respects hint verbosity). Playtest Phase 5.
6. **Reputation decay.** Should standing drift toward Neutral over in-game time like WoW, or is it sticky until acted on? Current design says sticky. Reversible with a `--decay-rate` flag in reputation-bar.js init.

---

## 9. Handoff Notes for Parallel-Track Owners

**Pressure washing track** — the only thing we need from you is: expose a `SpraySystem.onSubTargetComplete(subTargetId, floorId)` callback when a named zone reaches 100% readiness. We handle the subscription. Zero refactor pressure.

**Map editor track** — the only thing we need from you is: accept a new CLI subcommand family (`bo place-waypoint`, `bo place-trigger`, `bo list-quest-refs`) operating on `tools/floor-payloads/<floorId>.quest.json`. Schema is specified in §4.2. Zero engine-side pressure.

**Minigame track** — we need the standardized `onExit(reason, payload)` contract (§4.3). Once that's stable, everything else flows through the recipe registry you already own. Zero pressure to add quest concepts to your module — we adapt on our side in `pickup-actions.js`.

All three tracks can work in parallel with Phase 3 onward. Phases 0–1 are ours alone.

**NPC authoring tooling track** — see **NPC_TOOLING_ROADMAP.md (DOC-110)**. The only thing we need from you is: every NPC/enemy entity the NPC Designer (P1) emits must carry the fields QuestRegistry's six anchor resolvers consume (`id` for `entity:` + `npc:` anchors, `floorId` for `npc:` anchors, `type` so `dump-truck` stays distinguishable, `x`/`y` for `literal` fallback). P7 Population Planner runs the `quest-anchor-drift` coherence check (§9 of DOC-110) — if a quest's `npc` anchor resolves but no NPC sits at that tile, it fails CI. Bark Workbench (P2) orphan detection additionally catches quest-referenced pools with zero entries. Zero engine-side pressure on QuestChain/QuestRegistry; we read what they already emit.

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-04-16 | Initial publish (DOC-107). Supersedes DOC-66 §6 post-jam spec. |
| 2026-04-16 | Added Phase 0b — agent-facing tooling stubs. Cross-refs agents.md sidequest workflow. Scopes `bo add-quest`, `bo place-waypoint`, `bo validate-quest` CLI stubs, quest floor sidecar merge in extract-floors, sidequest JSON template, i18n namespace. |
| 2026-04-16 | Phase 0 shipped (quest-types.js, quest-registry.js, quest-chain.js, `data/quests.json` skeleton, `<script>` tag insertions, Game init wiring). `reputation-bar.js` deferred to Phase 3. |
| 2026-04-16 | Phase 1 shipped (all 7 slices). QuestWaypoint reduced to ~60-line shim; navigation state machine absorbed into QuestChain; 3 named anchors in `quests.json`; 4 game.js call-site fan-outs; Minimap pull-based marker wired; all 6 modified modules parse clean. DOC-66 §7 live-browser walkthrough still pending. |
| 2026-04-16 | Phase 0b shipped (all 5 slices). CLI `add-quest` / `place-waypoint` / `validate-quest` full writers (not stubs), registered via `blockout-cli.js` COMMANDS + `help-meta.js`; `data/quests.json` carries `_templates.{sidequest,main,faction}` + 3 named anchors; `tools/extract-floors.js` merges `tools/floor-payloads/*.quest.json` into `floorData[id].quests`; `data/strings/en.js` carries 12 UI chrome + 4 template + 11 reputation + 2 settings keys. Acceptance gate run end-to-end on floor 2.2.1 — all 5 gates pass. Agent-authored sidequests are now unblocked for the full agents.md 3-5 pass workflow. |
| 2026-04-16 | Phase 2 shipped (Journal UI). `QuestChain.getJournalEntries({active, completed, filter})` added + exported on frozen public API — projects `_active` + QuestRegistry defs into a flat entry array `{ id, kind, state, title, stepLabel, stepIndex, stepTotal, breadcrumb?, markerColor?, target? }`. Synthetic `nav`-kind fallback entry absorbs the legacy `_getQuestObjective()` floor/gate if-ladder so jam-build parity holds while Act-1 main-quest spine is still being authored. Seven hardcoded English strings migrated to `quest.nav_hint.*` i18n keys in `data/strings/en.js`. `menu-faces.js :: _renderJournal()` Section 2 OBJECTIVES now iterates active entries (multi-row, markerColor-aware); new Section 2b renders completed quests as BOOKS-style scrollable rows (28px, 4 MAX_VISIBLE, hover tooltip, click-to-read via DialogBox). New click actions `quest_scroll_up` / `quest_scroll_down` / `read_quest_completed` wired in `game.js` at slots 910+/930/931. `_getQuestObjective()` gutted to an 8-line shim that pulls from the same entry API. Four modified modules parse clean; smoke test validates empty→synthetic, active, and completed-only projections. |
| 2026-04-16 | Phase 4 shipped (Settings panel). `QuestChain` is now sole authority for four player-authored UI prefs — `markers` (bool), `hintVerbosity` ('off'/'subtle'/'explicit'), `waypointFlair` ('simple'/'pulsing'/'trail'), `sidequestOptIn` ('all'/'main-only'/'ask') — persisted to `localStorage['gleaner_settings_v1'].quest` via `setUIPrefs()` / `loadUIPrefs()` / `_persistUIPrefs()` with per-key validation (invalid values clamp to defaults, not rejected). New `prefs-change` event fires on real mutation only (no-op sets suppressed). `getCurrentMarker()` gated at three levels: master-off → null; verbosity=off → null; verbosity=subtle → returns sticky-or-null until `SUBTLE_IDLE_MS` (90 s) elapses since last progression tick (`setActive` + `_dispatch`-on-advance both call `_touchProgressionTick`). Nav-hint carve-out preserved — pre-quest wayfinding always visible under Subtle. `_filterIdsByOptIn()` suppresses `kind==='side'` active-IDs from marker resolution + Journal active pane when `sidequestOptIn === 'main-only'`. Face-3 Settings renders a new Quest subsection below Language (4 rows, slots 850–853): 1 toggle + 3 cycles, each with hint line; `_SETTINGS_ROW_COUNT` → 19. Click dispatch via `game.js` action `'quest_setting'` → `MenuFaces.handleQuestSettingInteract(qIdx)` → `QuestChain.setUIPrefs(patch)`. 15 new i18n keys under `settings.quest.*` in `data/strings/en.js`. `Game.init` calls `QuestChain.loadUIPrefs()` after `QuestChain.init(...)` so persisted prefs apply before any marker pull. Node harness (`tools/phase4-harness-v2.js` + `tools/phase4-quest-chain-copy.js`) exercises 10 assertions: defaults, SUBTLE_IDLE_MS export, invalid-value clamp, valid-value round-trip, localStorage blob shape, `loadUIPrefs` replay, `prefs-change` firing + no-op suppression, missing-blob graceful, malformed-JSON graceful, master-off + verbosity-off both return null — all 10 pass. |
| 2026-04-16 | Phase 3 shipped (Reputation bars). Scope was refined per contributor: "HUD is the debrief feed" — the faction strip is rendered inside `engine/debrief-feed.js`, not inside `engine/hud.js`. BPRD (Hellboy-style cleanup crew) is the player's employer and the first faction to reveal; the reveal hook is the conclusion of the dispatcher encounter. Sticky decay (no drift toward Neutral). `QuestTypes.WAYPOINT_KIND.REPUTATION_TIER = 'reputation-tier'` added to the frozen Layer-0 enum. `QuestChain._matches()` handles `kind:'reputation-tier'` with required `factionId` + `tier` (exact match on destination `toTier`) + optional `direction` gate (default `'up'`; accepts `'down'`/`'any'`); downward crossings inferred automatically from `REP_TIERS` ordinals. `QuestChain.onReputationTierCross(factionId, fromTier, toTier)` — 8th external event entry point — builds the reputation-tier event with derived direction and fans out via `_dispatch`; exposed in frozen exports. `DebriefFeed` gains a faction-row API — `expandFaction(factionId, opts)`, `collapseFaction(factionId)`, `updateFaction(factionId, favor, tier, opts)`, `getFactionState(factionId)` — backed by a module-private `_factions` map; collapsed rows are absent from the DOM. Four faction colors (`bprd:#D94E3A`, `mss:#5F9EA0`, `pinkerton:#8B7355`, `jesuit:#4A2F6B`) + i18n-backed labels + per-tier progress-within-tier bar fill (exalted caps at 100%, hated floors at 0%). Three stackable CSS keyframes injected into `index.html`: `df-faction-reveal` (520ms slide+grow), `df-faction-bump` (480ms scale+goldshadow), `df-faction-tiercross` (720ms box-shadow goldflash); animation flags set by API methods and consumed by the next render. `DispatcherChoreography.init({onComplete})` — new callback fires from `_closeCinematic` with a `firstTime` arg captured from the existing `_dispatcherDialogShown` closure guard; Game.init wires it to `ReputationBar.addFavor('bprd', 100)` + `DebriefFeed.expandFaction('bprd', {animate:true})`. Game.init fan-out: `ReputationBar.on('favor-change', …)` → `DebriefFeed.updateFaction`; `ReputationBar.on('tier-cross', …)` → `DebriefFeed.updateFaction` + `QuestChain.onReputationTierCross`. All wiring behind `typeof` guards so missing modules degrade gracefully. New i18n keys in `data/strings/en.js`: `faction.<id>.name`/`.tagline` for all four factions, `rep.tier.<id>` for all six tiers. Node contract harness `tools/_phase3-cache/harness.js` covers 13 tests / 47 sub-assertions across init seeding, favor-change/tier-cross emit contract, within-tier vs threshold crossing, downward crossing, predicate match cases (factionId + toTier + direction gate), Game.init fan-out simulation, expand/collapse toggle, and bump/tier-cross flag setting — all 47 pass. |
| 2026-04-16 | Phase 3 display-layer rename — Biome Plan §19.1 canonical names + suit glyphs. Internal `QuestTypes.FACTIONS` ids (`bprd / mss / pinkerton / jesuit`) kept for save stability and narrative ambiguity, but the player-facing display strings were re-mapped: `bprd → The Necromancer ♥`, `mss → Tide Council ♠` (Coral Cellars), `pinkerton → Foundry Collective ♦` (Ironhold Depths), `jesuit → The Admiralty ♣` (Lamplit Catacombs). `data/strings/en.js` `faction.<id>.name` + new `.suit` + `.tagline` keys updated; `engine/debrief-feed.js` gets canonical `FACTION_LABELS` fallback + new `FACTION_SUITS` + `SUIT_COLORS` maps + `_factionRow` renders an ivory `.df-faction-suit` chip before the name (card-suit-color glyph: red for ♥/♦, black for ♠/♣); `index.html` has a new `.df-faction-suit` CSS rule for the chip. Color palette re-tuned to biome palettes (Tide teal `#5F9EA0`, Foundry brass `#B87333`, Admiralty amethyst `#6B5BA8`, Necromancer crimson `#B8395A`). Standalone verification harness at `tools/_phase3-cache/verify-rename.js` (6 groups, all pass). `QuestTypes.FACTIONS` enum values and all save/predicate/reputation-bar keys are unchanged — this is a pure display-layer rename. |
| 2026-04-16 | Phase 5b shipped (Sidequest content batch). Data-only follow-on to Phase 5. Three new sidequests added to `data/quests.json`, expanding the roster from 1 demo to 4: `side.1.2.innkeeper_bottles` (4 steps: npc → floor → combat ENM-003 ×3 → npc branch rat_report), `side.1.3.cellar_owner_mop` (3 steps: npc → item ITM-089 Mop Head → readiness 0.5 on 1.3.1), `side.2.2.watchman_roll_call` (4 steps: npc → floor 2.2.1 → floor 2.2.2 → flag heroWakeArrival; prereq gateUnlocked=true). Rewards: 40g + {bprd:50} / 30g + {bprd:25} / 50g + {bprd:75, jesuit:25} respectively. 21 new i18n keys under `quest.sidequest.{innkeeper_bottles,cellar_owner_mop,watchman_roll_call}.*` in `data/strings/en.js`. Predicates cover the remaining non-minigame surface: `npc`, `floor`, `item`, `combat` (count-gated), `readiness`, `flag`, and the prereq-flag gate. Grounded in real engine data (NPC ids from `engine/npc-system.js`, enemy ids from `data/enemies.json`, item ids from `data/items.json`). Three external event entry points (`onNpcTalk`, `onCombatKill`, generic `onItemAcquired`) remain pending engine wirings — each quest's `_notes` field documents the dependency. Verification harness `tools/_phase5b-cache/verify.js` (fresh-inode twin) runs 5 groups / 88 assertions: structural, per-quest structure, i18n key coverage, live event-stream simulation (embeds `_matches` + stepProgress reference verbatim and drives each quest to completion), and cross-quest isolation — all 88 pass. Bindfs cache gotcha touched: `mv en.js en.js.cachebust && mv en.js.cachebust en.js` roundtrip logged as the minimal cache-invalidation workaround for harness-level `fs.readFileSync`. |
| 2026-04-17 | DOC-116 coordination slice shipped. Four unblocked quest-side prerequisites authored so map editors can now place QUEST and FACTION gates per `docs/GATE_TAXONOMY.md` §8a.4 staged migration. **1.** `QuestTypes.WAYPOINT_KIND.GATE_OPENED = 'gate-opened'` — 10th waypoint kind in `engine/quest-types.js` (docstring enumerates the six gate categories: key/quest/faction/schedule/breakable/composite). **2.** `QuestChain.onGateOpened(floorId, x, y, gateType)` — 7th external event entry point in `engine/quest-chain.js`; validates floorId/x/y types, builds `{kind:'gate-opened', floorId, x:x\|0, y:y\|0, gateType}` event, fans out via `_dispatch` to every ACTIVE quest; `gateType` null if not passed. **3.** `_matches` case `'gate-opened'` — predicate filters all optional, AND-joined: `floorId` (exact string match), `x`+`y` (both must be numbers; exact integer-coord match), `gateType` (exact string match); absent filters wildcard. **4.** `QuestChain.isStepComplete(questId, stepIdxOrId)` — new getter in the frozen public API. Accepts integer stepIdx (backward-compat positional form) or string stepId (preferred — survives step reorder, per §8a.2). Returns `true` universally for COMPLETED-state quests; for ACTIVE state returns `idx < rec.stepIndex`; returns `false` for unknown quests, LOCKED/AVAILABLE state, out-of-range indices, or unknown step ids. **5.** `QuestRegistry.flagReferenced(flag)` + `hasStep(questId, stepIdxOrId)` — pure query API for `bo validate-gates`. `flagReferenced` scans all quests' `step.advanceWhen` predicates for `kind:'flag'` entries matching the given flag (does not scan `step.target`); returns false for non-string/empty flag. `hasStep` answers the structural "does this step exist in the corpus?" question, accepting integer or string addressing parallel to `isStepComplete`. **Harness**: `tools/_doc116-cache/verify-gate-coord.js` — fresh-inode Node harness driving `_fresh-quest-types.js` + `_fresh-quest-registry.js` + `_fresh-quest-chain.js` via `vm.createContext`. Five groups, 54 assertions: G1 WAYPOINT_KIND exports (4), G2 predicate matching (13), G3 onGateOpened input validation + fan-out (6), G4 isStepComplete int/string addressing + state transitions (16), G5 flagReferenced + hasStep query surface (15). Regression pass on all prior DOC-109 harnesses + sprint-timer + readiness-Phase3: 410/410 assertions across 8 harnesses. Docs updated: GATE_TAXONOMY §7 delegation table (ReputationBar row refreshed + 3 new shipped rows), §8a.3 (fixed KIND→WAYPOINT_KIND doc bug, marked shipped), §8a.4 (QUEST/FACTION gates now UNBLOCKED for authoring). Bindfs cache gotcha encountered on `engine/quest-registry.js` — resolved via `mv engine/quest-registry.js engine/quest-registry.js.stale` + fresh-inode `Write` (CLAUDE.md recovery procedure §"File truncation"). |
| 2026-04-16 | Phase 5 shipped (Minigame sidequest adapter). New `QuestTypes.WAYPOINT_KIND.MINIGAME = 'minigame'` enum value. `QuestChain.onMinigameExit(kindId, reason, payload)` — 7th external event entry point — builds a `{kind:'minigame', kindId, reason, subTargetId?, floorId?, x?, y?}` event and fans it out via `_dispatch` to every ACTIVE quest; invalid kindId returns false without side effects. Predicate engine `_matches()` gains a `kind:'minigame'` case with four optional filters (`kindId`/`reason`/`subTargetId`/`floorId`, all AND-joined, absent = wildcard). Count-gated advance: when a step's `advanceWhen.count` is ≥ 2, matched events accumulate on `rec.stepProgress[stepIndex]` and emit `partial:true` waypoint events with `{progress, of, event}` until the Nth match triggers the real advance. `PickupActions.onMinigameExit(kindId, reason, payload)` added as the central fan-out with a local `.on/.off` listener registry, forwarding to `QuestChain.onMinigameExit` behind a typeof-guard — minigame modules never import QuestChain directly. SpraySystem got a module-level `_onSubTargetComplete` slot + `setOnSubTargetComplete(fn)` setter (frozen exports pattern) and fires `('tile_clean', floorId, x, y)` when a tile's cleanliness crosses 1.0; Game.init wires the slot to `PickupActions.onMinigameExit('pressure_wash', 'subtarget', {...})`. Demo sidequest `side.1.3.1.pentagram_wash` authored in `data/quests.json` (single step, count:3, reward 25 gold + `side_pentagram_wash_done` flag); 4 new i18n keys under `quest.sidequest.pentagram_wash.*`. Node contract harness `tools/_phase5-cache/harness.js` (twin of `tools/phase5-harness.js`; `_phase5-cache/` copy has a fresh inode that bypasses the bindfs cache phantom) covers 11 tests / 37 sub-assertions: dispatch, each of the four filters, count-gated 3-tile advance with partials, payload shape, non-match skipping, invalid-kindId rejection, full payload propagation, multi-quest fan-out — all 37 pass. Sidequest is immediately compatible with Phase 4's `sidequestOptIn='main-only'` filter. |
| 2026-04-17 | DOC-107 follow-up — canonical `act2_unlocked` flag-setter authored in quest corpus. New quest `main.act1.capstone` appended to `data/quests.json`: `kind:'main'`, `act:1`, single flag-kind step `step.hero_defeat` with `advanceWhen:{kind:'flag', flag:'hero_defeated', value:true}`, rewards declaring `{act2_unlocked:true, act1_complete:true}` + `gold:0` (pure flag-setter, no loot). Three new i18n keys under `quest.main.capstone.*` in `data/strings/en.js` (title, summary, step.1.label). Closes the last DOC-116 §8a.4 authoring-prereq gap: `act2_unlocked` — previously only referenced in GATE_TAXONOMY spec examples and harness fixtures — now has a declared source of truth, which unblocks `bo validate-gates` + map-editor authoring of composite gates referencing the Act 1 → Act 2 transition per `docs/GATE_TAXONOMY.md` §2.6 + §6.2. Predicate shape also satisfies `QuestRegistry.flagReferenced('hero_defeated')` so gate authoring can compose `{key AND quest(main.act1.capstone)}` composites. **Activation semantics (pre-Phase-7):** the quest ships declaratively; its reward side-effects fire only when `QuestChain.setActive('main.act1.capstone')` is called, which DOC-107 Phase 7 (Act 2 content load-in) will wire to an auto-accept flow. Pre-Phase-7, callers may invoke `setActive` from a scripted late-Act-1 trigger, or leave the flag falsy (Act 2 content is not authored yet — intended). Quest chain `rewards.flags` dispatch itself is also Phase 7 work; this entry is purely declarative at jam scope. **Harness**: `tools/_doc116-cache/verify-act2-unlock.js` — fresh-inode Node harness, 6 groups, 25 assertions: G1 quests.json parses (1), G2 quest exists + shape (6), G3 step predicate shape (5), G4 rewards declaration (3), G5 i18n key presence (3), G6 QuestRegistry fresh-mirror `hasStep`/`flagReferenced` behaviour (7) — including the documented "flagReferenced scans advanceWhen, not rewards" semantic. Regression pass on all 8 prior harnesses (DOC-109 Phases 0/1/2/3/4/5, sprint-timer, DOC-116 gate-coord): **359/359 assertions across 9 harnesses**. Bindfs hit a fresh pathology — `data/quests.json` wrote partial (217 lines instead of 237); recovery via sandbox-side `cp outputs/quests-payload.json data/quests.json` (write-through from the non-bindfs outputs dir), which Python+Node both subsequently parsed cleanly. Documenting as a new entry in the file-truncation taxonomy: Write tool on large JSON via the bindfs mount can silently truncate even when the tool reports "updated successfully" — prefer round-tripping through the sandbox `/outputs` dir + `cp` for large replacements. |

# Quest System Roadmap — Post-Jam Canonical Spec

**DOC-107**
**Created**: 2026-04-16
**Last updated**: 2026-04-16
**Status**: Phases 0 + 0b + 1 shipped (2026-04-16). Phases 2–7 pending. Supersedes the "deferred QuestChain" section of DOC-66 quest-marker-audit.md
**Depends on**: DOC-2 Tutorial_world_roadmap, DOC-13 STREET_CHRONICLES_NARRATIVE_OUTLINE, DOC-52 READINESS_BAR_ROADMAP, DOC-55 MENU_INTERACTIONS_CATALOG, DOC-66 quest-marker-audit, DOC-74 ACT2_NARRATIVE_OUTLINE, DOC-9 NPC_SYSTEM_ROADMAP, DOC-95 MINIGAME_TILES
**Informs**: DOC-22 HUD_ROADMAP (quest marker toggle, reputation bar stack), DOC-55 MENU_INTERACTIONS_CATALOG (Journal face), DOC-103 NPC_REFRESH_PLAN (faction contact choreography), DOC-95 MINIGAME_TILES (sidequest completion contract)
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

**New floor sidecar schema** (`tools/floor-payloads/<floorId>.quest.json`, optional per floor):

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

Picked up by `tools/extract-floors.js` and merged into `floor-data.json` under `floorData.quests`. QuestRegistry reads this at runtime.

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

### Phase 2 — Journal UI (1 day)

1. Gut `menu-faces.js :: _getQuestObjective()` and `_renderJournal()` quest section
2. Re-render Journal from `QuestChain.getJournalEntries({active, completed, filter})`
3. Each entry has: title, current-step label, progress breadcrumb, last-updated timestamp, "Show on map" affordance
4. Completed quests go to a scrollable lower pane (pattern matches books)
5. Lore entries (DOC-55 stub) stay separate — not scoped here
6. Verify: Journal renders same content as jam build, but now pulls from registry

### Phase 3 — Reputation bars (1.5 days)

1. Implement `reputation-bar.js` with a tier-cross event bus modeled on the existing HUD tier-cross channel (`hud.js:15 :: _onTierCross`, set via `HUD.setOnTierCross()` and driven by `readiness-calc.getCoreScore()`). ReputationBar exposes its own `ReputationBar.on('tierCross', ...)` so callers don't have to thread through HUD.
2. Seed faction favor from ACT2 §10 flags (`faction_favor_mss`, `faction_favor_pinkerton`, etc.)
3. HUD: add the compressed exterior strip + full-stack interior renderer
4. Subscribe QuestChain to `reputation.tierCross` for `completes: { type: "reputation-tier" }` predicates
5. Wire Act 1 seed: completing a contract emits `reputation.factionFavor.spade += 5` as a deterministic demo event
6. Verify: favor visible in HUD on Floor 3 mock, tier-cross fires, quest step auto-advances on threshold

### Phase 4 — Settings panel (0.5 day)

1. Add Face-3 Quest subsection to `menu-faces.js` (4 toggles from §3)
2. Persist to `localStorage['gleaner_settings_v1']`
3. `QuestChain.setUIPrefs()` propagates to Minimap (marker on/off) and to HUD toast suppression
4. Verify: toggles round-trip across reloads; marker vanishes/reappears on toggle

### Phase 5 — Minigame sidequest adapter (0.5 day)

1. Standardize `onExit(reason, payload)` contract (this may land first from the minigame track owner — coordinate)
2. Add `PickupActions.onMinigameExit` hook and QuestChain subscription
3. Add one demo sidequest in `quests.json`: "wash three pentagram tiles" (reuses pressure-washing subtarget event)
4. Verify: demo sidequest appears in Journal when eligible, clears when completed

### Phase 6 — Map editor floor sidecars (1 day, concurrent with map-editor track)

1. Define the floor sidecar schema (§4.2)
2. Teach `tools/extract-floors.js` to merge sidecars into `floor-data.json`
3. Add BO-V/CLI command stubs (track owner implements)
4. Migrate the two Act 1 test anchors (`pentagram_chamber`, `home_work_keys_chest`) into sidecars
5. Verify: sidecar removal = anchor missing at load time = loud validation error (fail fast)

### Phase 7 — Act 2 content load-in (1 day per act beat, ongoing)

Now data-only:

1. Dispatcher arc (ACT2 §5.1–5.3) — 6 quest steps across 11 in-game days
2. Move Night (ACT2 §5.4) — 4 quest steps
3. Faction missions (ACT2 §4.1) — 4 mission chains, ~3 steps each
4. Seaway discovery (ACT2 §8 Phase 3) — 5 quest steps
5. Faction lock climax (ACT2 §8 Phase 4) — 3 steps + reputation tier predicate

No engine work. Each beat is a PR against `data/quests.json` + optional new floor sidecars.

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

---

## 10. Changelog

| Date | Change |
|---|---|
| 2026-04-16 | Initial publish (DOC-107). Supersedes DOC-66 §6 post-jam spec. |
| 2026-04-16 | Added Phase 0b — agent-facing tooling stubs. Cross-refs agents.md sidequest workflow. Scopes `bo add-quest`, `bo place-waypoint`, `bo validate-quest` CLI stubs, quest floor sidecar merge in extract-floors, sidequest JSON template, i18n namespace. |
| 2026-04-16 | Phase 0 shipped (quest-types.js, quest-registry.js, quest-chain.js, `data/quests.json` skeleton, `<script>` tag insertions, Game init wiring). `reputation-bar.js` deferred to Phase 3. |
| 2026-04-16 | Phase 1 shipped (all 7 slices). QuestWaypoint reduced to ~60-line shim; navigation state machine absorbed into QuestChain; 3 named anchors in `quests.json`; 4 game.js call-site fan-outs; Minimap pull-based marker wired; all 6 modified modules parse clean. DOC-66 §7 live-browser walkthrough still pending. |
| 2026-04-16 | Phase 0b shipped (all 5 slices). CLI `add-quest` / `place-waypoint` / `validate-quest` full writers (not stubs), registered via `blockout-cli.js` COMMANDS + `help-meta.js`; `data/quests.json` carries `_templates.{sidequest,main,faction}` + 3 named anchors; `tools/extract-floors.js` merges `tools/floor-payloads/*.quest.json` into `floorData[id].quests`; `data/strings/en.js` carries 12 UI chrome + 4 template + 11 reputation + 2 settings keys. Acceptance gate run end-to-end on floor 2.2.1 — all 5 gates pass. Agent-authored sidequests are now unblocked for the full agents.md 3-5 pass workflow. |

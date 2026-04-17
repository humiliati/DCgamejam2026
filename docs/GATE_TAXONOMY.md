# DOC-116 — Gate Taxonomy & Resolution Pipeline

> Defines the universal lock/unlock system for Dungeon Gleaner.
> Every interactive passage — doors, boss doors, breakable barriers,
> elevators, NPC checkpoints — uses the same gating contract.
>
> Written 2026-04-17. Feeds into DOC-105 blockout refresh, DOC-107 quest system,
> and all floor authoring tooling.

---

## 1. Design Principles

1. **Doors everywhere, all interactive.** No decorative doors. Every door the
   player can see, the player can walk up to and interact with. If it's locked,
   it tells you *why* and *what would change that.*

2. **Gates are tile-agnostic.** The gate lives in the `gates` map keyed by
   `"x,y"` position, not on a specific tile type. LOCKED_DOOR is the default
   visual for gated passages, but BOSS_DOOR, BREAKABLE, or any opaque tile
   with a `doorTarget` can carry a gate.

3. **No partial overrides.** A gate is either fully inherited or fully replaced.
   No merging fields across tiers. Debugging a door's behavior should never
   require reading three data sources.

4. **Rejection is pedagogy.** Every gate carries a `rejectHint` i18n key. The
   locked-door interaction teaches the player what to pursue. A world where
   70% of doors start locked should feel like a world full of *promise*, not
   a world full of "no."

5. **Two evaluation categories.** Stateful gates unlock permanently.
   Stateless gates re-evaluate every interaction. Never mix them implicitly.

---

## 2. The Six Gate Types

### 2.1 KEY — Physical item consumption

The player carries a specific item (or any item of type `key`). On use,
the item is consumed (configurable) and the door opens permanently.

```js
{
  type: "key",
  keyId: "rent_receipt_book",   // specific item ID, or null for "any key"
  keyName: "Rent Receipt Book", // display name for dialogs
  consume: true,                // false = key persists (master keyring)
  rejectHint: "door.locked_need_receipt"
}
```

**Category:** Stateful (permanent unlock via `Player.setFlag`).
**Tutorial hook:** Supervisor directs new player to fetch keys.
**Player fantasy:** "I found a key — now which door does it open?"

### 2.2 QUEST — Flag or step completion

Door opens when a quest flag is set or a quest step completes. No item
consumed. The Act 2 narrative gate between floor 3 and floor 4.

```js
{
  type: "quest",
  flag: "dispatcher_cleared_cellar",  // Player.hasFlag() check
  // OR quest-step form (preferred):
  questId: "act1_dispatcher_briefing",
  stepId: "clear_cellar",             // QuestChain.isStepComplete(questId, stepId) — string, not positional
  // stepIdx: 3,                      // DEPRECATED — positional int; both work but stepId survives step reordering
  rejectHint: "door.locked_need_clearance"
}
```

**Category:** Stateful.
**Preferred form:** `flag` for simple narrative gates, `questId + stepId`
(string) for quest-driven progression. `stepIdx` (positional int) is
supported for backward compat but **all new tooling should emit `stepId`**
because quest authors insert steps and positional indices break.

### 2.3 FACTION — Reputation threshold

Door opens when faction standing reaches a required tier. The Pinkerton
office, the Jesuit archive, the BPRD vault.

```js
{
  type: "faction",
  factionId: "pinkerton",     // from QuestTypes.FACTIONS
  minTier: "neutral",         // hated < unfriendly < neutral < friendly < allied < exalted (6-tier, matches QuestTypes.REP_TIERS)
  rejectHint: "door.locked_pinkerton_seal"
}
```

**Category:** Stateful (once reputation crosses the threshold, door stays open
even if reputation later drops — prevents softlocks).

### 2.4 SCHEDULE — Time-based access window

Door opens and closes on the day/night cycle. The only gate that can re-lock.
Shops that close at night, dungeon entrances with visiting hours.

```js
{
  type: "schedule",
  openHour: 8,       // 0–23, inclusive
  closeHour: 20,     // 0–23, exclusive
  days: null,        // null = every day, or array: ["mon","wed","fri"]
  rejectHint: "door.closed_hours"
}
```

**Category:** Stateless (re-evaluated every interaction, never sets permanent flag).
**Note:** Schedule gates should show current hours in the rejection dialog:
"Open 8am–8pm. It's currently 11pm."

### 2.5 BREAKABLE — Tool/suit interaction

Door doesn't use a key — the player hits it with the right card suit or
tool to bash through. Boards, rusted grates, crumbling walls.

```js
{
  type: "breakable",
  suit: "clubs",     // required card suit, or null for "any attack"
  hits: 2,           // interactions required (1 = one hit)
  rejectHint: "door.boarded_need_blade"
}
```

**Category:** Stateful (permanent once broken through).
**Visual:** Door appearance degrades with each hit (fresh → cracked → open).
Tracked via `Player.getFlag("gate_hits:<floorId>:<x,y>")`.

### 2.6 COMPOSITE — AND/OR combinations

Layered requirements for high-value passages. Flat condition array with
a single boolean operator.

```js
{
  type: "composite",
  op: "and",          // "and" | "or"
  conditions: [
    { type: "key", keyId: "vivec_pass", keyName: "Vivec Pass", consume: true },
    { type: "quest", flag: "act2_unlocked" }
  ],
  rejectHint: "door.locked_vivec_gate"
}
```

**Category:** Inherits from children. If any child is stateless (schedule),
the composite re-evaluates. If all children are stateful, the composite is
stateful.

**Rules:**
- No nesting. `conditions` entries cannot themselves be `composite`.
- If a designer needs `(A AND B) OR C`, they use two door tiles.
- Tile override of a composite completely replaces it — no merging
  with inherited conditions.

---

## 3. Resolution Pipeline

For any interactable tile, the engine resolves its gate in this order:

```
1. Tile Gate    — explicit per-tile override in floor data gates map
2. Edge Gate    — connection-level gate on the floor graph edge
3. Floor Gate   — optional whole-floor fallback (rare)
4. No Gate      — tile is ungated, interact normally
```

**First match wins. No merging between tiers.**

### 3.1 Tier 1 — Tile Gate (explicit override)

Lives in the floor's `gates` map. Keyed by `"x,y"` position.

```js
// In floor data (floor-blockout-*.js or floor-data.json)
gates: {
  "51,25": {
    override: true,       // REQUIRED — signals intentional override
    type: "key",
    keyId: "side_room_key",
    keyName: "Side Room Key",
    consume: true,
    rejectHint: "door.locked_side_room"
  }
}
```

`override: true` is mandatory. This prevents accidental tile gates from
masking edge inheritance. If `override` is absent or false, the entry is
ignored and resolution continues to Tier 2.

**Use cases:** Special doors inside a dungeon (locked side room, boss chamber
with different requirements than the entrance).

### 3.2 Tier 2 — Edge Gate (primary authoring surface)

Lives on the connection between two floors in the world graph. This is
where most designer intent lives — "the door from Promenade to Coral Bazaar
requires the shop key."

```js
// In world graph / floor-data connections
doorTargets: {
  "1.1": {
    target: "1",
    gate: {
      type: "key",
      keyId: "bazaar_key",
      keyName: "Bazaar Key",
      consume: true,
      rejectHint: "door.locked_bazaar"
    }
  }
}
```

Applies to **all boundary LOCKED_DOOR tiles** that connect these two floors,
unless a tile has an explicit `override: true` entry.

**Primary authoring tool:** World Designer graph (edge inspector).

### 3.3 Tier 3 — Floor Gate (rare fallback)

Lives on the floor metadata. Applies to **all LOCKED_DOOR tiles** on the
floor that don't match Tier 1 or Tier 2.

```js
// In floor metadata
floorGate: {
  type: "faction",
  factionId: "jesuit",
  minTier: "friendly",
  rejectHint: "door.locked_jesuit_sanctum"
}
```

**Use case:** An entire floor is conceptually locked — the Jesuit Archive
where every door requires standing. Rare. Most floors won't have this.

### 3.4 Tier 4 — No Gate

Tile interacts normally. DOOR transitions, BOSS_DOOR transitions, etc.

---

## 4. Evaluation Model

### 4.1 Evaluate function (pseudocode)

```js
function evaluateGate(gate, floorId, x, y) {
  // Check permanent unlock flag first
  var flagKey = "gate_open:" + floorId + ":" + x + "," + y;
  if (gate.type !== "schedule" && Player.hasFlag(flagKey)) {
    return { success: true, reason: "previously_unlocked" };
  }

  switch (gate.type) {
    case "key":
      var item = findKey(gate.keyId);
      return item
        ? { success: true, item: item }
        : { success: false, failedCondition: gate };

    case "quest":
      var met = gate.flag
        ? Player.hasFlag(gate.flag)
        : QuestChain.isStepComplete(gate.questId, gate.stepId || gate.stepIdx);
      return { success: met, failedCondition: met ? null : gate };

    case "faction":
      var tier = ReputationBar.getTier(gate.factionId);
      var met = tierIndex(tier) >= tierIndex(gate.minTier);
      return { success: met, failedCondition: met ? null : gate };

    case "schedule":
      var hour = TimeManager.getCurrentHour();
      var inWindow = hour >= gate.openHour && hour < gate.closeHour;
      if (gate.days) inWindow = inWindow && gate.days.includes(TimeManager.getDayName());
      return { success: inWindow, failedCondition: inWindow ? null : gate };

    case "breakable":
      var hitsKey = "gate_hits:" + floorId + ":" + x + "," + y;
      var hits = Player.getFlag(hitsKey) || 0;
      return hits >= gate.hits
        ? { success: true }
        : { success: false, failedCondition: gate, currentHits: hits };

    case "composite":
      return evaluateComposite(gate, floorId, x, y);
  }
}
```

### 4.2 On successful unlock (stateful gates)

```js
function onGateUnlock(gate, floorId, x, y, result) {
  if (gate.type === "schedule") return; // stateless — no flag

  // Set permanent flag
  Player.setFlag("gate_open:" + floorId + ":" + x + "," + y, true);

  // Type-specific side effects
  if (gate.type === "key" && gate.consume && result.item) {
    Player.consumeItem(result.item.id);
  }
  if (gate.type === "breakable") {
    // Clear hit counter
    Player.clearFlag("gate_hits:" + floorId + ":" + x + "," + y);
  }

  // Convert tile to passage (LOCKED_DOOR → DOOR, etc.)
  convertGatedTile(floorId, x, y);

  // Fire quest event
  QuestChain.onFlagChanged("gate_open:" + floorId + ":" + x + "," + y, true);
}
```

### 4.3 Debug trace

Every evaluation returns a `failedCondition` object. This enables:
- Better rejection hints at runtime ("You need the Bazaar Key" vs generic "locked")
- Designer debug overlay in BV showing why each door is locked
- Console logging for engine debugging

---

## 5. Tooling Surface

### 5.1 World Designer — Edge Gate Editor

**Primary authoring surface.** When clicking a connection edge between
two floor nodes:

- Gate type dropdown (key / quest / faction / schedule / breakable / composite / none)
- Conditional fields based on type selection
- `rejectHint` field with i18n key auto-suggest
- Visual: icon badge on the edge (🔑 key, ⏰ schedule, 🛡️ faction,
  📜 quest, 💥 breakable, 🔗 composite)

**Data output:** Written to `doorTargets[targetFloorId].gate` in the
floor's payload/sidecar.

### 5.2 Blockout Visualizer — Tile Gate Inspector

In the Meta panel, when a LOCKED_DOOR (or any gated tile) is selected:

**Inherited gate display (read-only):**
- Shows the resolved gate from Tier 2 (edge) or Tier 3 (floor)
- Ghosted/dimmed styling — clearly "this comes from elsewhere"
- Link to jump to the World Designer edge that defines it

**Override toggle:**
- Checkbox: "Override inherited gate"
- When checked, full gate editor appears (same fields as World Designer)
- `override: true` automatically set in the `gates` map entry

**Visual on the canvas:**
- Inherited gate: small ghosted icon on the tile
- Override gate: solid icon with colored border
- No gate: standard tile appearance

### 5.3 Blockout CLI — Agent Commands

```
bo set-gate <floorId> <x,y> <type> [options]
  --keyId <id>         KEY: required item ID
  --keyName <name>     KEY: display name
  --consume            KEY: consume on use (default true)
  --no-consume         KEY: keep item after use
  --flag <flag>        QUEST: Player flag to check
  --questId <id>       QUEST: quest ID
  --stepIdx <n>        QUEST: step index
  --factionId <id>     FACTION: faction ID
  --minTier <tier>     FACTION: minimum reputation tier
  --openHour <n>       SCHEDULE: opening hour (0-23)
  --closeHour <n>      SCHEDULE: closing hour (0-23)
  --days <list>        SCHEDULE: comma-separated day names
  --suit <suit>        BREAKABLE: required card suit
  --hits <n>           BREAKABLE: hits required
  --rejectHint <key>   ALL: i18n rejection hint key (required)
  --override           Mark as tile-level override

bo clear-gate <floorId> <x,y>
  Remove tile-level gate (reverts to inheritance)

bo set-edge-gate <floorId> <targetFloorId> <type> [options]
  Set gate on the connection between two floors

bo show-gates <floorId>
  List all gates on a floor (tile, edge, floor-level)
  Shows resolution result for each LOCKED_DOOR tile

bo validate-gates <floorId>
  Check: every LOCKED_DOOR has a resolvable gate,
  every gate has a rejectHint, key IDs exist in items data,
  quest flags/IDs exist in quest data, faction IDs are valid
```

---

## 6. Migration Path

### 6.1 Rename `lockedDoors` → `gates`

The existing `lockedDoors` map on floor data becomes `gates`. The engine's
`_tryUnlockLockedDoor` function in `floor-transition.js` becomes a thin
dispatcher that calls `evaluateGate()`.

Backward compatibility: if `lockedDoors` exists and `gates` does not,
auto-migrate at load time:

```js
if (floorData.lockedDoors && !floorData.gates) {
  floorData.gates = {};
  for (var pos in floorData.lockedDoors) {
    var old = floorData.lockedDoors[pos];
    floorData.gates[pos] = {
      override: true,
      type: "key",
      keyId: old.keyId,
      keyName: old.keyName,
      consume: true,
      rejectHint: "door.locked_no_key"
    };
  }
}
```

### 6.2 Existing floor-blockout-3.js (Floor 3 → Floor 4 arch)

Currently uses `lockedDoors` with KEY type. Migrates to:

```js
gates: {
  "51,25": {
    override: true,
    type: "key",
    keyId: "rent_receipt_book",
    keyName: "Rent Receipt Book",
    consume: true,
    rejectHint: "door.locked_need_receipt"
  },
  "51,26": {
    override: true,
    type: "key",
    keyId: "rent_receipt_book",
    keyName: "Rent Receipt Book",
    consume: true,
    rejectHint: "door.locked_need_receipt"
  }
}
```

The Act 2 narrative gate (floor 3 → floor 4) will later be changed to:

```js
// Edge gate on floor 3's connection to floor 4
gate: {
  type: "composite",
  op: "and",
  conditions: [
    { type: "key", keyId: "rent_receipt_book", keyName: "Rent Receipt Book", consume: true },
    { type: "quest", flag: "act2_unlocked" }
  ],
  rejectHint: "door.locked_vivec_arch"
}
```

---

## 7. Delegation Boundaries

This spec is **tools-facing and data-facing.** The following work is
delegated to engine/UI agents:

| Work Item | Owner | Inputs from this spec |
|-----------|-------|-----------------------|
| `evaluateGate()` function | Engine agent | §4.1 pseudocode |
| `onGateUnlock()` side effects | Engine agent | §4.2 pseudocode |
| Gate resolution pipeline | Engine agent | §3 resolution order |
| `lockedDoors` → `gates` migration | Engine agent | §6.1 migration code |
| Rejection dialog per gate type | UI agent | §2.x `rejectHint` + type-specific strings |
| Breakable hit degradation visuals | UI agent | §2.5 hit tracking |
| Schedule time display in rejection | UI agent | §2.4 note |
| World Designer edge gate editor | Tools agent (this session) | §5.1 |
| BV meta panel gate inspector | Tools agent (this session) | §5.2 |
| CLI gate commands | Tools agent (this session) | §5.3 |
| Gate validation in `bo validate` | Tools agent (this session) | §5.3 |
| `ReputationBar` module | Engine agent | §2.3 (deferred to DOC-107 Phase 3) |
| `TimeManager` module | Engine agent | §2.4 (new module, gated on day/night cycle) |

---

## 8. Open Questions

1. **Key discovery UX.** Should the rejection dialog hint at where the key
   is? ("The shopkeeper might have one.") Or is that too hand-holdy for a
   scavenger game?

2. **Schedule + KEY combo.** Can a door be "locked at night AND requires key
   during the day"? That's a composite with a schedule child. The evaluation
   model supports it, but is it good design?

3. **BREAKABLE visual states.** How many degradation steps? 2 (intact → broken)?
   3 (intact → cracked → broken)? More = more art, but reads better.

4. **Faction gate re-lock.** Currently §2.3 says faction gates stay open even
   if reputation drops (prevent softlocks). Should there be an opt-in
   `reLockOnDrop: true` for faction gates that should re-lock? Adds complexity.

5. **Gate events.** ~~Should `QuestChain.onGateOpened(floorId, x, y, gateType)`
   be a new event type for quest predicates?~~ **RESOLVED** — yes, reserved
   as `gate-opened` (see §8a below).

---

## 8a. Quest System Coordination (2026-04-17)

Decisions and reservations agreed between the tooling session and quest
system engineering:

### 8a.1 Faction scale: 6 tiers (DECIDED)

**6-tier scale**, matching `QuestTypes.REP_TIERS` as shipped:

```
hated → unfriendly → neutral → friendly → allied → exalted
```

The 8-tier scale (`hostile`, `honored`, `revered`) that appeared in the
first draft of this doc was aspirational and never shipped to the engine.
All tooling (CLI, BV, World Designer) has been aligned to 6 tiers.

If the game later needs finer granularity, the 6-tier structure expands
cleanly (insert tiers between existing thresholds, bump `min` values)
without breaking existing gates — gates reference tier *ids*, not ordinals.

### 8a.2 stepId (string) over stepIdx (int)

Quest-type gates should emit `stepId` (string identifier) as the default
reference form, not `stepIdx` (positional integer). Both work once
`QuestChain.isStepComplete()` ships, but `stepId` survives quest step
insertion/reordering.

All three tooling surfaces have been updated:
- CLI `--stepId <id>` is the primary flag; `--stepIdx <n>` accepted
  for backward compat
- BV meta panel quest fields default to `stepId`
- World Designer edge inspector emits `stepId`

### 8a.3 Reserved event shape: `gate-opened`

The following predicate shape is reserved for quest step predicates:

```js
{ kind: "gate-opened", gateType?: string, floorId?: string, count?: number }
```

Semantics: fires via `QuestChain.onGateOpened(floorId, x, y, gateType)`
after any gate passes evaluation and `onGateUnlock()` completes. If
`gateType` is specified, only gates of that type match. If `floorId` is
specified, only gates on that floor match. `count` enables "open N locked
doors" quest steps.

The `gate-opened` kind should be added to `QuestTypes.KIND` when the quest
engineer ships `onGateOpened`. Gate tooling validation (`bo validate-gates`)
will check for this kind in quest predicates once available.

### 8a.4 Migration sequencing

The `lockedDoors → gates` migration (§6.1) is **staged**:

1. **KEY-only gates: safe to migrate now.** The existing `_tryUnlockLockedDoor`
   in `floor-transition.js` can be refactored to read from `gates` instead
   of `lockedDoors` for `type: "key"` entries. These are self-contained —
   no quest or reputation dependency.

2. **QUEST/FACTION gates: blocked on quest system.** Do not ship quest-type
   or faction-type gates on any floor until:
   - `QuestChain.isStepComplete(questId, stepId)` is landed
   - `QuestChain.onGateOpened()` event dispatch is landed
   - `ReputationBar.getTier(factionId)` is accessible from `evaluateGate()`

3. **SCHEDULE gates: blocked on TimeManager.** No schedule gates until the
   day/night cycle module exists.

4. **BREAKABLE gates: partially safe.** The hit counter via `Player.setFlag`
   / `Player.getFlag` is self-contained. The suit-check depends on
   `CombatEngine` card suit resolution but doesn't need quest system.

Tooling validation (`bo validate-gates`) will warn if a floor uses
quest/faction/schedule gate types before the engine modules exist.

---

## 9. Cross-References

| Doc | Relationship |
|-----|-------------|
| DOC-105 BLOCKOUT_REFRESH_PLAN | Gate tooling is a Wave 1 unlocker |
| DOC-107 QUEST_SYSTEM_ROADMAP | Quest gates + faction gates depend on Phase 3 reputation |
| DOC-113 SPRINT_DUNGEON_DESIGN | Sprint dungeons use KEY gates on entrance |
| DOC-115 TILE_TEXTURE_HANDOFF | LOCKED_DOOR visual states for breakable degradation |
| DOC-112 BOXFORGE_PEEK_COVERAGE_MATRIX §3.7 | Gate peek variants — locked/unlock/rejection animations per gate type |
| PEEK_SYSTEM_ROADMAP §6.2 | LockedDoorPeek drives the rejection UX |
| STREET_CHRONICLES_NARRATIVE_OUTLINE | Act structure defines which QUEST gates exist |

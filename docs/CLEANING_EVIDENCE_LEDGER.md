# Cleaning Evidence Ledger — DOC-118

> Spec for the per-campaign counter that tracks Gleaner's cleanup
> decisions and unlocks faction quest branches when thresholds cross.
> The ledger is the bridge between the mundane cleanup loop and the
> conspiracy-layer narrative: the game watches what you scrub, and
> factions eventually come knocking.
> Drafted 2026-04-17. Consumes DOC-115 tiles, DOC-119 hazards,
> DOC-117 decor.

---

## Design anchor

DC Jam 2026 theme 4 is "Cleaning Up the Hero's Mess." The literal
mechanic — point washer, spray mess, watch it disappear — doesn't
have consequences today. Every cleanup is morally neutral. The
conspiracy layer calls for the opposite: **every cleanup is a
political act**. A smashed nest is evidence destroyed. A scrubbed
territorial-mark is a creature's claim erased. A hosed-down fungal
patch is a research specimen lost.

The ledger tracks these acts silently. Once Gleaner accumulates
enough actions in one direction, the factions who care (MSS,
Pinkerton, Jesuit, BPRD) notice. Noticing takes concrete form: an
NPC approaches on the next overworld visit, offering a branch into
the main quest or a new sidequest. Or — for the opposition faction
— an ambush on the next dungeon descent.

The player never sees a meter. They find out who they've been
working for when someone finally knocks.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Shipped |
| 🟡 | Specced |
| ⬜ | Open design |

---

## 1. Event sources

The ledger ingests events from three existing systems:

| Source | Event | Example |
|--------|-------|---------|
| Pressure washer hit (any cleanup-eligible tile or decor) | `cleanup.tile_washed(tileId, floorId, pos)` | TERRITORIAL_MARK washed → +1 erasure |
| HazardSystem (DOC-119) | `cleanup.tile_destroyed(tileId, floorId, pos)` | ENERGY_CONDUIT dead → +1 infrastructure loss |
| Adjacent-decor hit (DOC-117) | `cleanup.decor_washed(spriteId, pos)` | feather cleaned → +0.1 weight |

All three sources pipe through a single dispatcher:
`EvidenceLedger.log(eventType, payload)`.

---

## 2. Weighting table

Not all cleanups are equal. Per-tile weights govern how much each
event moves each faction counter. Positive = approval, negative =
hostility.

| Event | Readiness Δ | MSS | Pinkerton | Jesuit | BPRD |
|-------|-------------|-----|-----------|--------|------|
| BLOOD / CORPSE washed | +2 | +2 | 0 | 0 | −1 |
| TERRITORIAL_MARK washed | +2 | +1 | 0 | **−4** | −2 |
| ROOST shadow washed | +2 | +1 | 0 | **−5** | −3 |
| NEST destroyed | +3 | +2 | 0 | **−8** | **−5** |
| DEN flooded | +1 | 0 | 0 | **−10** | **−5** |
| FUNGAL_PATCH killed | +4 | +3 | 0 | −3 | **−10** |
| CONDUIT dead (DOC-119) | **−2** | −3 | 0 | **+2** | **−8** |
| CONDUIT cascade 3+ (DOC-119) | **−5** | −8 | 0 | **+5** | **−15** |
| Decor wet (any, DOC-117) | +0.1 | +0.1 | 0 | 0 | 0 |

Bold cells are the "this faction *really* cares" signals. The
Readiness column feeds the existing dispatcher-payout calc; the four
faction columns feed the ledger totals.

Decor events weigh 0.1 so they accumulate meaningfully over a full
playthrough (hundreds of decor sprites scrubbed) without drowning out
the tile-level signals.

---

## 3. Ledger state

Per-campaign persistent state (not per-floor, not per-run):

```js
EvidenceLedger.state = {
  totals: {
    mss:       0,   // cumulative signed delta
    pinkerton: 0,
    jesuit:    0,
    bprd:      0
  },
  counts: {
    // raw event counts by tileId — used for "destroyed N nests" flavor
    50: 0,   // NEST
    51: 0,   // DEN
    52: 0,   // FUNGAL_PATCH
    53: 0,   // ENERGY_CONDUIT
    // …
  },
  history: [
    // last 50 events for replay + journal display
    { t: 1713312000, event: 'cleanup.tile_destroyed', tileId: 53, floorId: '2.2.1', pos: {x:7,y:3} }
    // …
  ],
  thresholds_fired: {
    // keyed by threshold ID, prevents double-firing
    mss_efficiency_10: true
  }
};
```

Persistence: localStorage via the existing `Game.saveGame()` hook.
`history` capped at 50 entries (FIFO); `totals` and `counts` unbounded.
Size estimate: ~4–6 KB per save. Well within the 5 MB localStorage
budget.

---

## 4. Threshold configuration

Each threshold is a triple: `{ faction, value, action }`. When a
faction total crosses the value in the appropriate direction, the
action fires exactly once per campaign (tracked by `thresholds_fired`).

### 4a. MSS thresholds — positive = approval

| Threshold | Action | Delivery |
|-----------|--------|----------|
| `mss ≥ 10` | Dispatcher praise dialogue + 50 gold bonus | Next overworld visit |
| `mss ≥ 25` | Sidequest *Efficiency Contract*: clear 5 marked hazard tiles in 30 min for 300 gold + readiness token | Dispatcher briefing |
| `mss ≥ 50` | Main-quest branch handoff: *The Deeper List* — unlocks floors 3.x+ narrative | Dispatcher office cutscene |

### 4b. Pinkerton thresholds — positive = notice

Pinkerton doesn't actively lose rep. Thresholds gate on absolute
volume of destruction-class events, not on net direction.

| Threshold | Action | Delivery |
|-----------|--------|----------|
| `pinkerton ≥ 15` | Sidequest *The Erasure*: scrub a specific named location | Back alley in Lantern Row |
| `pinkerton ≥ 40` | Main-quest branch: *Payroll* — reveal who's paying for the sanitization | Investigation scene |

### 4c. Jesuit thresholds — negative = hostility, positive = recruitment

| Threshold | Action | Delivery |
|-----------|--------|----------|
| `jesuit ≤ −15` | Sidequest *Reparations*: opportunity to refuse an MSS contract and make amends | Cloaked NPC in Cellar Entrance |
| `jesuit ≤ −40` | Ambush — Jesuit enforcers spawn on the next dungeon descent | Automatic, no warning |
| `jesuit ≥ +10` | Main-quest branch: *The Order's Invitation* — Gleaner is recruited | Confession-booth scene |

Jesuit is the only faction where a *positive* threshold exists via the
CONDUIT-cascade path (DOC-119 §3). That asymmetry creates the
conspiracy's "retrofuturism distrust" flavor and gives players an
alternate faction lane if they commit to the destroy-infrastructure
playstyle.

### 4d. BPRD thresholds — negative = research loss

| Threshold | Action | Delivery |
|-----------|--------|----------|
| `bprd ≤ −20` | Sidequest *Preservation*: pay to spare specific ecology tiles for research | Researcher at Dispatcher's Office |
| `bprd ≤ −50` | Main-quest branch: *Field Ban* — Gleaner is barred from BPRD-protected floors until reparations | Formal notice scene |

---

## 5. Notification gating

When a threshold fires, the action is *queued*, not immediate:

1. Event logged to `thresholds_fired`.
2. Queue entry: `{ threshold: 'jesuit_minus_15', deliveryType, readyAt }`.
3. On next FloorManager load matching `deliveryType`, drain the queue
   and trigger the NPC/cutscene/ambush.

Delivery types:

- `overworld` — fires on next depth-1 load.
- `dungeon` — fires on next depth ≥ 3 load (used for Jesuit ambush).
- `shop` — fires on next interior (depth-2) load matching a shop floor.

An event that crosses multiple thresholds in one action fires them in
sequence, throttled by the destination floor's dialogue queue so the
player isn't ambushed by four cutscenes at once.

---

## 6. UI

### Phase 0 — no UI
Thresholds fire invisibly. Players experience them as narrative
surprises. This is the default and the shipping target for Jam.

### Phase 1 — Cleanup Journal (🟡)
Pause-menu page. Not a meter — a *log*. Shows the last ~20 events in
prose:

> *Cleaned blood pool at Hero's Wake B1.*
> *Destroyed nest at Hero's Wake B2.*
> *Flooded den at Hero's Wake B2.* ⚠

The ⚠ marks events that moved a faction threshold by ≥ 5. Players
start noticing the pattern: "all my warnings cluster in the same
biome — someone's going to get angry."

No numbers. No bars. Prose journal only. The *absence* of numeric
feedback is a design requirement, not a cut corner.

---

## 7. Module architecture

New Layer 1 module: `engine/evidence-ledger.js`.

Dependencies: `QuestTypes` (for FACTIONS enum). No other engine deps
— the ledger is a pure state store with an event sink.

Public API:

```
EvidenceLedger.log(eventType, payload)     // ingest
EvidenceLedger.getTotals()                 // { mss, pinkerton, jesuit, bprd }
EvidenceLedger.getCount(tileId)            // raw per-tile count
EvidenceLedger.getHistory()                // last 50 events
EvidenceLedger.getPendingActions()         // queue snapshot
EvidenceLedger.drainActions(deliveryType)  // called by FloorManager
EvidenceLedger.save()  / .load()           // localStorage hooks
```

Wiring:

- **Pressure washer** — existing `HazardSystem.onWasherHit()` →
  emits `cleanup.tile_washed` → `EvidenceLedger.log()`.
- **DOC-119 conduit state machine** — on entering DEAD →
  `cleanup.tile_destroyed`. On cascade ≥ 3 →
  extra `cleanup.cascade_destroyed` with `count` payload so the
  weighting table can read the count.
- **DOC-117 decor cleanup** — on any decor wash →
  `cleanup.decor_washed` with the sprite ID.

QuestChain integration — new predicate type so quest JSON can gate on
ledger state:

```json
{ "kind": "evidence_threshold", "faction": "jesuit", "op": "<=", "value": -15 }
```

The predicate evaluates against `EvidenceLedger.getTotals()[faction]`.
Registered in `QuestChain._matches()` alongside the existing 6
predicate types.

---

## 8. Faction NPC spawn catalog

Each threshold action needs an NPC ID, sprite, dialogue tree, and a
spawn-floor target. IDs suffixed with the threshold they unlock.

| Threshold | NPC ID | Spawn floor | Notes |
|-----------|--------|-------------|-------|
| `mss_efficiency_10` | `npc_dispatcher_praise` | `2.1` | Reuses existing dispatcher sprite + new dialogue tree |
| `mss_efficiency_25` | `npc_dispatcher_contract` | `2.1` | Same |
| `mss_main_branch` | `npc_dispatcher_deepcut` | `2.1` | New cutscene asset |
| `pinkerton_contact_15` | `npc_pinkerton_alley_1` | `2` (Lantern Row back alley) | New NPC sprite |
| `pinkerton_payroll` | `npc_pinkerton_investigator` | `2` | New NPC sprite |
| `jesuit_reparations` | `npc_jesuit_cloaked_1` | `1.3` (Cellar Entrance) | New NPC sprite, cloaked |
| `jesuit_ambush` | `npc_jesuit_enforcer` ×3 | next dungeon entry | New enemy variant |
| `jesuit_invitation` | `npc_jesuit_confessor` | `1.3` | New NPC sprite |
| `bprd_preservation` | `npc_bprd_researcher` | `2.1` | New NPC sprite |
| `bprd_field_ban` | `npc_bprd_officer` | `2.1` | New NPC sprite + banner UI |

Dialogue text lives in `data/strings/en.js` under
`dialogue.faction_contact.*`.

---

## 9. Priority order

1. **Ledger module + log dispatcher** — zero UI, zero side effects.
   Just start collecting data. Run a full playthrough to validate
   the weights in §2.
2. **Weighting tuning pass** — from real playthrough numbers, adjust
   §2 so the first threshold hits at ~60–90 min of play. This is the
   single most important tuning pass in the whole system.
3. **MSS efficiency threshold + dispatcher bonus** — easiest wire.
   Positive feedback loop keeps early-game players interested.
4. **Jesuit opposition threshold + cloaked NPC** — highest narrative
   impact. The moment a player realizes they've been watched is the
   conspiracy layer's hook.
5. **Cleanup Journal UI (Phase 1)** — players notice patterns on
   their own. Elevates the system from invisible to ambient.
6. **Main-quest branch handoffs** — heaviest content lift; each is
   a new dialogue tree + scene. Ship post-Jam unless a single branch
   can be MVP'd for the Jam build.
7. **Ambush threshold (Jesuit −40)** — requires enemy-spawn logic
   keyed off ledger state. Wire through existing EnemyAI spawner.

---

## 10. Open questions

- **Does the ledger reset between runs?** Design instinct: *no* — the
  ledger is per-*campaign*, so deaths and run resets preserve state.
  Encourages committing to a faction identity over multiple runs. But
  this means players who want to "reset their reputation" need an
  explicit new-game option. ⬜
- **Should NPC approaches interrupt gameplay or wait for idle?** MVP:
  interrupt on next floor-load (natural break point). Post-Jam we
  could softer-schedule onto idle moments.
- **Do same-floor cleanups compound?** e.g., washing 5 blood pools on
  one floor — does each fire an event, or do we dedupe by floor? MVP:
  each fires. Revisit if tuning feels too fast.
- **Should Pinkerton ever lose rep?** Currently no — their hostility
  vector is volume-based, not net-direction. Consider a "refused
  contract" event that drops Pinkerton rep but costs nothing else.

---

## 11. Reference material

- Faction enum: `engine/quest-types.js` `FACTIONS`
- Existing event dispatch: `engine/quest-chain.js` `_matches(predicate, evt)`
- Readiness stat storage: `engine/session-stats.js`
- Local-storage save hook: `engine/game.js` `saveGame()`
- Dialogue tree system: `engine/dialog-box.js`
- NPC spawn registry: `engine/floor-manager.js`
- Conspiracy framing: `docs/STREET_CHRONICLES_NARRATIVE_OUTLINE.md`
- Upstream event producers:
  - DOC-115 §3 (biome palette assignments — used for locality weighting in phase 2)
  - DOC-119 §3 (conduit faction table — this doc's source of CONDUIT/cascade rows)
  - DOC-117 §6 (reactive decor events — `cleanup.decor_washed` source)

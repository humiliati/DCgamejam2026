# Chest Restock & Work Order System

**Created**: 2026-04-06
**Status**: Design — not yet implemented
**Depends on**: UNIFIED_RESTOCK_SURFACE_ROADMAP (complete), DEPTH3_CLEANING_LOOP_BALANCE, SHOP_REFRESH_ECONOMY, engine/crate-system.js, engine/restock-bridge.js, engine/peek-slots.js
**Scope**: Promote chests from withdraw-only loot containers to the primary target of work orders and side quests across all floor depths.

---

## 0. Motivation

Crates, torches, and corpses are all restockable via the Unified Restock Surface (RS-1–RS-5). Chests are the odd one out — the player can loot them but never stocks them. This leaves a narrative gap in the gleaner fantasy: who puts the sword in the treasure chest for the hero to find?

The gleaner does. Chest restocking is the connective tissue between the cleaning loop (janitorial labor) and the dungeon's purpose (hero adventure). Work orders formalize this: a faction or NPC contracts the gleaner to place specific items in specific chests, turning the deposit action into a quest objective.

---

## 1. What Already Exists

CrateSystem and PeekSlots already have partial chest-deposit infrastructure, built during the SC-B lifecycle work but never activated above depth-2:

| Component | Current State | Gap |
|-----------|--------------|-----|
| `CrateSystem.createChest()` | Sets `demandRefill: depth >= 3`. D3+ chests already expect deposit. | D1/D2 chests are `demandRefill: false` — work orders need to override this per-chest. |
| Chest lifecycle phases | `loot → empty → restocked`. Phase transitions enforced by `setPhase()`. | Only `loot → empty` fires automatically (on last withdraw). `empty → restocked` has no trigger — sealing isn't wired for chests. |
| `PeekSlots.tryOpen()` | Routes `empty + demandRefill` chests to RestockBridge. | RestockBridge.detectMode() explicitly skips chests (line 53: "Chests are withdraw-only"). |
| RestockSurface | Supports modes: crate, torch, corpse. | No 'chest' mode. Backdrop variant mapping doesn't include chest. |
| RestockWheel | Renders generic slots. Doesn't care about container type. | Slots accept any supply. No mechanism for "this slot requires a specific item." |

**Key insight**: the routing is 80% wired. The main blocker is `detectMode()` skipping chests and the absence of slot-specific item requirements.

---

## 2. Floor Hierarchy & Chest Roles

Chests serve different purposes at each floor depth. Work orders respect this hierarchy:

### Depth 1 — floorsN (Overworld / Town)

Surface-level chests near shops and faction HQs. These are **quest item drops** and **variable rehydration** targets:

- **Quest items**: "Deliver this sealed letter to the Tide Council chest." The player picks up a quest item elsewhere and deposits it in a specific chest as a delivery objective.
- **Rehydration**: Surface chests that heroes looted yesterday get restocked with fresh supplies each morning. The gleaner's job is to fill them before the hero party heads out. Items are generic (potions, torches, rations) — not quest-specific.
- **Work order source**: Faction quest boards live at depth 1. The player picks up work orders here before descending.

### Depth 2 — floorsN.N (Interiors / Shops)

Interior chests in shops, guild halls, and faction buildings. Similar to depth 1 but with faction-specific inventory:

- **Faction supply chests**: Each faction stocks different items. Tide wants water and fish. Foundry wants gears and oil. The gleaner fills these from the faction's supply stock.
- **Rehydration**: Same daily refill cycle as depth 1, but items drawn from faction-specific pools.
- **Transition chests**: Near stairwells leading to depth 3. These are the "loadout chests" — the gleaner pre-stages supplies the hero will grab on the way down. Work orders specify what goes here based on the hero party's class composition.

### Depth 3 — floorsN.N.N (Dungeons)

Deep dungeon chests near bonfires and boss rooms. These are the **primary work order targets** — the high-value, high-risk restocking jobs:

- **Bonfire chests**: Positioned near rest points. The gleaner stocks healing items, torches, and emergency supplies. Heroes who die and respawn at the bonfire need these.
- **Boss room chests**: Pre-staged loot rewards. Work orders specify the exact items (a specific weapon, armor piece, or card) that must be placed. This is where "put this sword in this chest at 2.2.1" lives.
- **Contracted amounts**: Work orders specify a target fill count. A 5-slot bonfire chest might require 3/5 filled minimum to satisfy the contract, with bonus pay for full completion.
- **Already partially supported**: `demandRefill: true` is already set for depth >= 3 chests. The `empty → restocked` phase transition exists but has no trigger.

---

## 3. Work Order System — Narrative Evolution

Work orders are NOT a static task board. They are the game's quest system, and they evolve across the narrative arc. The player learns chest restocking as a janitorial skill (wax on) and later discovers that same verb is the tool for faction espionage, sabotage, and investigation (wax off).

### 3.1 Phase 1 — Dispatch Orders (Act 1)

The Dispatcher issues work orders. They are faction-agnostic maintenance contracts. The player is labor, not an operative.

**Tone**: Mundane. Clipboard energy. "Stock the bonfire chest in B1. Fill the supply crate by the stairs. Rehydrate the cellar."

**Source**: Dispatcher's Office (Floor 2.1). The Dispatcher has a daily clipboard with 2–3 orders. The player picks them up before heading into dungeons.

**Structure**: Simple. One chest, generic supplies, fixed reward.

```javascript
{
  id: 'WO-dispatch-007',
  phase: 'dispatch',           // dispatch | faction | independent
  faction: null,               // faction-agnostic
  type: 'restock',             // 'restock' | 'rehydrate'
  target: { floorId: '2.2.1', x: 14, y: 7 },
  slots: [
    { frameTag: 'potion', required: false },  // suggested, not enforced
    { frameTag: null, required: false },
    { frameTag: null, required: false }
  ],
  minFilled: 2,
  reward: { gold: 25 },
  expires: 3,
  issuer: 'Dispatcher',
  description: 'Stock the bonfire chest in Deepwatch B1.'
}
```

**What the player learns**: How to fill chests through the RestockSurface. Which supplies go where. The rhythm of pick-up-order → buy-supplies → descend → deposit → seal → get-paid. Pure muscle memory.

**How many before graduation**: 3–5 dispatch orders. Enough to internalize the loop. The Dispatcher's clipboard shrinks naturally as Act 1 winds down — the player doesn't notice because the Act 1 climax is consuming their attention.

### 3.2 Phase 2 — Faction Orders (Early Act 2)

Floor 3 opens. Four faction buildings, each with a mission board. The first few faction orders LOOK like dispatch orders — "stock this chest" — but the target chests are in contested dungeons and the items are faction-specific.

**Tone**: Professional. The faction contact gives context the Dispatcher never did. "The heroes we're sending into B1 tomorrow are ours. Stock their chest with MSS-stamped provisions. Not generic. Ours."

**Source**: Faction quest boards on Floor 3. Each faction offers 2–3 orders daily. The player can accept from any faction freely (before the lock).

**Structure**: Faction-flavored. Slot requirements tighten. Delivery orders appear.

```javascript
{
  id: 'WO-mss-014',
  phase: 'faction',
  faction: 'mss',
  type: 'delivery',
  target: { floorId: '2.2.1', x: 14, y: 7 },
  slots: [
    { frameTag: 'weapon', requiredItemId: 'ITM-DRAGONBONE-BLADE', required: true },
    { frameTag: 'potion', required: true },
    { frameTag: null, required: false }
  ],
  minFilled: 2,
  reward: { gold: 45, rep: 10, factionId: 'mss' },
  bonusReward: { gold: 20 },
  expires: 2,
  issuer: 'Lt. Mei',
  description: 'Plant the dragonbone blade in the B1 bonfire chest before Crow\'s team sweeps.'
}
```

**What changes**: The player starts noticing that WHICH items they put WHERE has consequences. MSS wants dragon relics preserved. Pinkertons want them catalogued. Jesuits want them destroyed. BPRD wants them filed. Same chest, same mechanic, different faction objective. The verb is identical — the meaning is political.

**Faction favor**: Each completed faction order increments `faction_favor_[id]`. After ~5 orders for one faction, the lock triggers (ACT2_NARRATIVE_OUTLINE §4.2).

### 3.3 Phase 3 — Independent Operations (Mid–Late Act 2)

The Dispatcher is gone. The replacement dispatcher's orders are subtly rigged (ACT2_NARRATIVE_OUTLINE §5.2). The player who has been paying attention stops trusting the board.

Now the player drives. Two quest flavors emerge organically from the faction system:

**"Get to the bottom of this for X faction"** — Aligned with the player's chosen faction. The faction contact sends the player to investigate, retrieve, or secure something. Chest deposit is one action in a multi-step mission. Example: "Investigate the Seaway contraband locker. Retrieve BPRD evidence container #47. Deliver it to the dead-drop chest on Floor 3.2."

**"Get to the bottom of Y in spite of Z faction"** — Working against the hostile faction. The player discovers hostile faction operations and disrupts them. Chest deposit becomes sabotage or counter-intelligence. Example: "The Pinkertons cached stolen manifests in a chest on Floor 2.2.2. Swap the real manifests for decoys before their courier arrives."

**Source**: Multiple. Faction contact dialogue (chosen faction only). Environmental discovery (finding a hostile faction chest while on a dungeon run). The original Dispatcher in the Seaway (if found, becomes an independent quest-giver with no faction allegiance).

**Structure**: Multi-objective. The work order has steps, not just a target chest.

```javascript
{
  id: 'WO-ind-003',
  phase: 'independent',
  faction: 'mss',               // aligned faction (or null for dispatcher quests)
  againstFaction: 'pinkerton',  // hostile faction this works against (or null)
  type: 'operation',            // new type: multi-step
  steps: [
    { action: 'investigate', floorId: '2.2.2', description: 'Locate Pinkerton cache' },
    { action: 'retrieve', itemId: 'ITM-MANIFEST-REAL', description: 'Take the real manifests' },
    { action: 'deposit', target: { floorId: '2.2.2', x: 9, y: 3 },
      slots: [{ requiredItemId: 'ITM-MANIFEST-DECOY', required: true }],
      description: 'Plant decoy manifests in the Pinkerton chest' },
    { action: 'deliver', target: { floorId: '3.2', x: 5, y: 11 },
      slots: [{ requiredItemId: 'ITM-MANIFEST-REAL', required: true }],
      description: 'Deliver real manifests to MSS dead-drop' }
  ],
  reward: { gold: 80, rep: 25, factionId: 'mss' },
  expires: 5,
  issuer: 'Lt. Mei',
  description: 'Swap the Pinkerton manifests. They won\'t know until it\'s too late.'
}
```

**The wax-off moment**: The player who spent Act 1 filling crates and stocking chests as busywork now realizes they've been trained in infiltration logistics. They know every chest location on every floor. They know which supplies fit which slots. They know the timing of hero runs and when chests reset. The menial labor was the curriculum.

### 3.4 Work Order Lifecycle

```
AVAILABLE → ACCEPTED → IN_PROGRESS → COMPLETE | EXPIRED | FAILED

Phase 1 (dispatch):
  AVAILABLE → ACCEPTED → IN_PROGRESS → COMPLETE
  Simple. Fill chest, get paid. No failure state (expired orders
  just disappear from the clipboard, no penalty).

Phase 2 (faction):
  AVAILABLE → ACCEPTED → IN_PROGRESS → COMPLETE | EXPIRED
  Faction rep at stake. Expired orders cost a small rep penalty
  (-2 rep) because the faction trusted you with the job.

Phase 3 (independent):
  AVAILABLE → ACCEPTED → IN_PROGRESS → COMPLETE | FAILED
  No expiry (operations are open-ended). But failure is possible:
  hostile faction discovers your tampering (if you deposit wrong
  items or take too long on time-sensitive steps). Failed operations
  alert the hostile faction, increasing encounter density on the
  target floor for 2 days.
```

### 3.5 The Replacement Dispatcher's Rigged Board

The replacement dispatcher (ACT2_NARRATIVE_OUTLINE §5.2) issues orders that LOOK like dispatch-phase orders but route the player to floors where the hostile faction has ambushes staged. Mechanically:

- Orders use `phase: 'dispatch'` styling (mundane tone, generic rewards)
- But target floors have elevated hostile faction encounter rates
- The chest target is real — filling it IS a valid maintenance job — but the route there passes through hostile-faction-controlled corridors
- A player who checks the floor before accepting (via Minimap or NPC intel) notices the trap. A player who trusts the board walks into it.

This is NOT a special flag or scripted event. It emerges from the replacement dispatcher's order generation favoring floors with high hostile faction presence. The system doesn't cheat — the player just starts noticing patterns.

---

## 4. Technical Changes Required

### 4.1 RestockBridge — Add 'chest' Mode (Small)

`detectMode()` currently skips chests. Add chest detection for empty + demandRefill containers:

```javascript
if (container.type === 'chest') {
  var phase = CrateSystem.getPhase(x, y, floorId);
  if (phase === 'empty' && container.demandRefill) return 'chest';
}
```

RestockSurface backdrop variant mapping adds: `chest: 'chest'`.

**Estimate**: ~15 lines across restock-bridge.js and restock-surface.js.

### 4.2 Per-Chest demandRefill Override (Small)

Currently `demandRefill: depth >= 3` is set at creation time. Work orders at depth 1–2 need to flip this per-chest:

```javascript
function setDemandRefill(x, y, floorId, value) {
  var c = _containers[_key(x, y, floorId)];
  if (!c || c.type !== TYPE.CHEST) return false;
  c.demandRefill = !!value;
  return true;
}
```

**Estimate**: ~10 lines in crate-system.js.

### 4.3 Slot-Specific Item Requirements (Medium)

RestockWheel slots currently accept any supply. Work order chests need slots that demand a specific frameTag or itemId:

```javascript
// Slot model extension:
slot.requiredFrame = 'potion';    // only accepts items with this frameTag
slot.requiredItemId = 'ITM-042';  // only accepts this exact item (delivery)
```

RestockWheel's `_canFillSlot(slot, item)` check adds:
```javascript
if (slot.requiredFrame && item.frameTag !== slot.requiredFrame) return false;
if (slot.requiredItemId && item.id !== slot.requiredItemId) return false;
```

Visual: required slots show a ghost icon of the expected item. Mismatched drags show a red flash.

**Estimate**: ~40 lines in restock-wheel.js, ~10 lines in crate-system slot generation.

### 4.4 Chest Sealing (Medium)

Chests currently don't seal (`canSeal` returns false for TYPE.CHEST). Work order chests need sealing to trigger the `empty → restocked` phase transition and fire the completion reward:

```javascript
// In canSeal(): allow sealing for chest containers with demandRefill
if (c.type === TYPE.CHEST && c.demandRefill) {
  // Check minFilled from active work order, or default to all slots
  return _countFilled(c) >= (c.minFilled || c.slots.length);
}
```

The seal action transitions the chest to `restocked` phase, grants the work order reward, and fires the existing `triggerSealVFX()` celebration.

**Estimate**: ~30 lines in crate-system.js, ~10 in peek-slots.js.

### 4.5 Work Order Registry (New Module — Large)

New module `work-order-registry.js` (Layer 2):

- Stores active/available/completed orders
- Generates daily orders based on faction rep, floor state, and hero schedule
- Tracks per-chest order binding (which order targets which chest)
- Exposes API: `getAvailableOrders(factionId)`, `acceptOrder(orderId)`, `getActiveOrders()`, `checkCompletion(x, y, floorId)`, `completeOrder(orderId)`
- Persisted in save state alongside CrateSystem containers

**Estimate**: ~300–400 lines. This is the largest single piece.

### 4.6 Quest Board UI (New — Medium)

A new peek module or dialogue tree for faction quest boards. Could reuse the VendorDialog pattern (StatusBar.pushDialogue with choices) rather than building a new overlay:

```
[Tide Quest Board]
"3 contracts available today."

[1] Stock bonfire chest, Deepwatch B1 — 45g
[2] Deliver sealed letter to Dock chest — 30g + 15 rep
[3] Rehydrate cellar supplies — 15g
[Done]
```

**Estimate**: ~150 lines as a dialogue tree module, or ~250 lines as a dedicated peek.

### 4.7 Readiness Integration (Small)

`readiness-calc.js` currently excludes chests from the crate sub-score (line 758: "TYPE.CHEST excluded"). Work order chests with `demandRefill` should contribute:

```javascript
if (c.type === TYPE.CHEST && c.demandRefill) {
  // Count toward crate readiness like regular crates
}
```

**Estimate**: ~10 lines in readiness-calc.js.

---

## 5. What This Does NOT Include

- **Hero AI reacting to chest contents**: Heroes finding and using restocked items is a separate system (hero-ai.js pathing + inventory). Roadmap separately.
- **Chest visual changes by phase**: Different chest appearances for loot/empty/restocked. Cosmetic — roadmap with VISUAL_OVERHAUL.
- **Player-placed chests**: The gleaner places items in existing chests, not new chests. Chest placement is level design, not gameplay.
- **Act 3 betrayal integration**: The work order system supports Act 3 structurally (operations with steps, faction flags) but Act 3 specific narrative triggers are out of scope here.

---

## 6. Implementation Order

Two tracks: the chest-deposit wiring (C-track, needed for any work orders to function) and the work order system itself (W-track, the quest engine). C-track is Act 1 ready. W-track phases map to narrative phases.

### Track C — Chest Deposit Wiring (Act 1 prerequisite)

| Phase | Work | Estimate | Depends On |
|-------|------|----------|------------|
| **C-1** | RestockBridge 'chest' mode + demandRefill override + chest sealing | ~65 lines | RS-1–RS-5 (done) |
| **C-2** | Slot-specific item requirements in RestockWheel | ~50 lines | C-1 |
| **C-3** | Readiness integration (demandRefill chests contribute to crate score) | ~10 lines | C-1 |

### Track W — Work Order System (phased by narrative act)

| Phase | Work | Narrative Phase | Estimate | Depends On |
|-------|------|-----------------|----------|------------|
| **W-1** | Work Order Registry: core data model, accept/complete/expire lifecycle, save/load | Dispatch (Act 1) | ~250 lines | C-1 |
| **W-2** | Dispatcher clipboard UI (dialogue tree, 2–3 daily orders, simple restock/rehydrate types) | Dispatch (Act 1) | ~150 lines | W-1 |
| **W-3** | Faction order generation: faction-specific slots, delivery type, rep rewards | Faction (Act 2 early) | ~200 lines | W-1, faction_favor flags |
| **W-4** | Faction quest board UI (per-faction boards on Floor 3, replaces/supplements dispatcher) | Faction (Act 2 early) | ~150 lines | W-3 |
| **W-5** | Operation type: multi-step orders (investigate → retrieve → deposit → deliver) | Independent (Act 2 mid) | ~300 lines | W-3 |
| **W-6** | Replacement dispatcher rigged board: order generation biased toward hostile-faction floors | Independent (Act 2 mid) | ~100 lines | W-3, faction_hostile flag |
| **W-7** | Environmental discovery: auto-detect hostile faction chests, generate counter-orders | Independent (Act 2 late) | ~150 lines | W-5 |

**Track C total**: ~125 lines. Prerequisite, can ship with Act 1.
**Track W total**: ~1,300 lines across 7 phases. W-1 and W-2 ship with Act 1. W-3–W-7 ship incrementally with Act 2 content.

---

## 7. Open Design Questions

### Resolved by Act 2 Context

1. ~~**Work order item sourcing**: Does the player buy work-order items from shops, or are they provided by the faction?~~
   **Answer**: Both, and it evolves. Dispatch orders (Phase 1) use generic supplies the player buys — the Dispatcher doesn't provide materials, you're labor. Faction orders (Phase 2) sometimes include a faction-stamped item given on acceptance (delivery quests) — this IS a bag slot cost, and the item is tangible. Independent operations (Phase 3) require the player to source their own materials or steal from hostile faction caches. The economy shifts from "spend gold to earn gold" (Act 1) to "spend risk to earn intel" (Act 2).

2. ~~**Delivery quest items**: Are these unique items that take a bag slot, or tokens/flags?~~
   **Answer**: Real items. Bag slot cost is intentional — it creates logistics pressure. The dragonbone blade, the sealed letter, the decoy manifests all live in the same 21+N bag as your torches and potions. You can't carry infinite quests. You plan your loadout. This is the Morrowind school of quest design: the quest item is heavy and real and you have to make room for it.

3. ~~**Multiple orders per chest**: Can two work orders target the same chest?~~
   **Answer**: No in Phase 1–2. Yes in Phase 3 (operations). A single chest can be the target of your faction's order AND the hostile faction's cache — that's the entire point of the swap/sabotage mechanic. The system resolves by step order: the first deposit action claims the chest for that order. Subsequent deposits into the same chest append to the same order's step progress.

### Still Open

4. **Should restocked chests revert to loot phase for the next hero run?** Currently `restocked` is a terminal phase. If heroes loot restocked chests, they need to cycle back to `loot → empty → restocked` again. This implies a phase reset on hero-day or floor re-enter. The answer probably varies by depth: D3 bonfire chests reset daily (heroes consume them), D1–D2 faction chests reset only when a work order targets them.

5. **Partial completion persistence**: If the player fills 2/3 required slots and leaves, does progress persist? CrateSystem persists slot state per-floor, so mechanically yes. But for operations (Phase 3), does leaving mid-step alert the hostile faction? Probably not for simple deposits, but leaving a hostile chest open (unsealed) after swapping items could trigger a detection check.

6. **Environmental discovery UX**: When the player stumbles on a hostile faction chest during a routine dungeon run, how is the counter-order surfaced? Options: (a) toast notification + auto-add to journal, (b) the chest itself shows hostile faction insignia and the player must choose to investigate, (c) a bark from the faction contact via comms. Option (b) fits the "show don't tell" philosophy best — the player recognizes the Pinkerton seal on the chest and decides whether to mess with it.

7. **Original Dispatcher's independent orders**: The Dispatcher found in the Seaway (ACT2_NARRATIVE_OUTLINE §5.3) becomes a faction-agnostic quest giver. Their orders should feel different from faction orders — more personal, more desperate, no rep rewards. "I need you to get something from the contraband locker. Not for any faction. For me." Do these use the same work order structure with `faction: null`, or are they a separate narrative-scripted path?

8. **Replacement dispatcher detection**: How does the player discover the rigged board? Pure observation (noticing pattern of ambush-floor assignments)? NPC hints (the original Dispatcher warns them in the Seaway)? A mechanical tell (the replacement's orders lack the clipboard formatting the original used)? All three could layer — the subtle player notices first, the exploring player is told, the trusting player learns the hard way.

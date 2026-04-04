# Quest Marker System — Audit & Fix Plan

**Date:** 2026-04-04 (jam day −1)
**Scope:** Why the minimap quest diamond "gets lost between floors" and what it takes to push a playtester cleanly through gate → house → keys → dungeon entrance → deeper door → next pending dungeon.

---

## 1. The systems in play

| Module | Role in the quest chain |
|---|---|
| `engine/game.js :: _updateQuestTarget()` | The brain. Computes a single `{x, y}` target from `_gateUnlocked`, `_dispatcherPhase`, current `floorId`, `DungeonSchedule.getNextGroup()`, `ReadinessCalc.getCoreScore()`, and `FloorManager.getFloorCache()`. Calls `Minimap.setQuestTarget()`. |
| `engine/minimap.js :: setQuestTarget / _drawQuestMarker` | Pure renderer. Pulsing green diamond at a tile coordinate. No fallback, no "sticky" state — if you pass `null`, the marker vanishes that frame. |
| `engine/dungeon-schedule.js :: getNextGroup()` | Returns the soonest unresolved contract `{groupId, floorIds, target, actualDay, daysAway, ...}` or `null`. The three jam contracts are `spade→['1.3.1']`, `club→['2.2.1','2.2.2']`, `diamond→['3.1.1','3.1.2','3.1.3']`, all at target 0.6. |
| `engine/readiness-calc.js :: getCoreScore(floorId)` | 0.0–1.0 snapshot of how ready a floor is for its hero run. Drives the "readiness met" branch. |
| `engine/floor-manager.js :: getFloorCache(floorId)` | Returns cached `floorData` for previously-visited floors only. **Returns `null` for any floor the player has never entered** — the root of most marker drops. |
| `engine/dump-truck-spawner.js :: getDeploySites()` | Canonical `faction → (exteriorFloor, doorPos)` map that we can use as a rotation anchor for the quest target. `spade → (Floor 1, 10,27→1.3)`, `club → (Floor 2, 14,5→2.2)`, `diamond → (Floor 3, 25,1→3.1)`, plus home `(Floor 1, 22,27→1.6)`. This is the "hero-faction-dungeon schedule rotation" the post-jam design should anchor the marker to. |
| Call sites of `_updateQuestTarget()` | `game.js:3638` (dispatcher phase advance), `game.js:3798` (keys collected), `game.js:4330` (floor transition / post-spawn), `game.js:4379` (readiness tier-cross to 100%). |

---

## 2. The current state machine — phase by phase

Live code at `game.js:4429–4557`.

### Phase 0 — `!_gateUnlocked && _dispatcherPhase !== 'done'`
Goal: meet the dispatcher at the promenade gate.

| Floor | Target | Null-drop? |
|---|---|---|
| `'0'` (Approach) | Fixed (19, 5) | No |
| `'1'` (Promenade) | Dispatcher NPC if visible; else gate door − 1 col | No (as long as gate door exists) |
| *anything else* | `null` | **Yes** — if the player ducks into the inn/shop/home before the dispatcher fires, the marker goes dark. |

### Phase 1 — `!_gateUnlocked && _dispatcherPhase === 'done'`
Goal: retrieve work keys from Gleaner's Home (1.6).

| Floor | Target | Null-drop? |
|---|---|---|
| `'1'` | Fixed (22, 27) — the SC-pod door to 1.6 | No (correct against the 6-pod layout) |
| `'1.6'` | Fixed (19, 3) — the work-keys chest | No |
| *anything else* | `null` | **Yes** — inn, shop, even Floor 0. |

### Phase 2–3 — `_gateUnlocked === true`, read `DungeonSchedule.getNextGroup()`
Goal: push the player at the next dungeon assignment; auto-roll when readiness is met.

| Situation | Target | Null-drop? |
|---|---|---|
| `getNextGroup()` returns `null` (arc complete) | `null` | OK — arc is done, marker should be off. |
| On a group floor (`'1.3.1'`, `'2.2.1'`, etc.), `coreScore ≥ target` | `doors.stairsUp` | `null` if `stairsUp` missing from floor data |
| **On a group floor, `coreScore < target`** | **`null` (deliberate hide — line 4501)** | **Yes — THE main "lost between floors" bug.** The comment says "Still working — no marker (player is doing the sweep)" but the user wants the marker to point deeper. |
| In the lobby (`'1.3'`, `'2.2'`, `'3.1'`), all group floors done | `doors.doorExit` | `null` if missing |
| In the lobby, some floors still below target | `doors.stairsDn` | `null` if missing |
| On the group's exterior (e.g. Floor 1 when target is `1.3.1`) | `_findDoorTo(exterior, lobby)` | **`null` if the exterior's cache is cold.** Only a problem if the exterior is fresh — rare, but possible if the player teleports via bonfire. |
| On a *different* exterior (e.g. on Floor 1 when target is `3.1.1`) | `_findDoorTo(currentFloor, targetExterior)` | **`null` — floor 1 has no direct door to floor 3.** The east gate on Floor 1 leads to `'2'`, not `'3'`. The current code does not chain-hop. |
| Interior unrelated to assignment (shop, inn, home after keys) | `null` | **Yes.** |

So of the nine Phase 2–3 branches, **five** can produce `null`, and three of those are easy to hit in normal play:

1. **Inside a group dungeon before readiness target is met.** Deliberate, but wrong for this design.
2. **Standing on a different exterior than the target's.** Chain-hop not implemented.
3. **Inside a shop/inn/home in the middle of the work cycle.** No fallback.

This matches the symptom the user reported: "sometimes it's lost between floors when it should be pushing users towards a floor for quest".

---

## 3. Root cause of "lost between floors"

Three independent defects compound into a single intermittent symptom:

1. **Deliberate null inside dungeons (line 4501).** The in-dungeon below-target branch was written to *hide* the diamond so the player focuses on cleaning. That conflicts with the explicit progression chain the design now calls for. The marker should stay visible and point at the deeper door (stairs down) or, on the last group floor, at a fallback anchor.
2. **Cross-exterior chain gap (line 4550).** `_findDoorTo(floorId, exteriorId)` only finds *direct* doors. Floor 1's doorTargets include `(48,17)→'2'` but no entry for `'3'`. When diamond is next and the player is on Floor 1, the lookup fails and the marker drops.
3. **Unrelated-interior null (line 4556).** The shops, inn, and home (post-keys) all land on the catch-all `return null`. Anyone who ducks inside to buy a card loses the diamond until they step back out.

The marker "used to" work reliably because the early hardcoded Phase 2 route only pointed at Floor 1 landmarks. Once Phase 3 was made data-driven against `DungeonSchedule`, these three null-drop states started firing and the symptom became intermittent.

---

## 4. The chain the fix has to produce

From the user's spec, the target sequence is:

```
Phase 0:  gate NPC on promenade
Phase 1:  home door on promenade (22,27) → chest in 1.6 (19,3)
Phase 2:  east gate on promenade (48,17)        [first time leaving Floor 1]
Phase 3a: dungeon-lobby entrance door on the group's exterior
Phase 3b: stairs-down chain through dungeonN.N → dungeonN.N.N deeper doors
Phase 3c: stairs-up out of the last group floor once readiness is met
Phase 3d: auto-advance to the NEXT pending group — repeat 3a–3c
Phase 4:  all groups resolved → marker off (arc complete)
```

The marker must never drop to `null` between any two adjacent steps in that chain while the arc is still in flight.

---

## 5. Jam-day patch (applied 2026-04-04)

Minimal, in place in `_updateQuestTarget()`. No new modules, no data migration.

1. **Introduce a `_lastQuestTarget` sticky fallback.** If every computed branch in Phase 3 would return `null` but the arc is still in flight, reuse the last known good target for this floor, OR fall back to a "progression anchor" (see below) rather than drawing nothing.
2. **Add `_findProgressionDoorForward(currentExterior, targetExterior)`.** Scans the current floor's `doorTargets` for a door whose target is *closer* to `targetExterior` along the hardcoded chain `['1','2','3']`. Fixes the cross-exterior chain gap.
3. **Replace the in-dungeon-below-target null** at line 4501 with: stairs-down if present (push toward deeper floor), else stairs-up (push toward lobby). Drops the "hide marker while sweeping" rule.
4. **Replace the unrelated-interior null** at line 4556 with the interior's `doors.doorExit` (push the player back toward the exterior they need to be on).
5. **Handle Phase 0 / Phase 1 on-unrelated-interior** the same way: point at the interior's `doorExit`.
6. **Fallback to DumpTruckSpawner anchor.** If none of the above resolve, and `DumpTruckSpawner.getDeployment()` reports an active site on the current floor, point at the first truck tile. That guarantees a visible anchor on every exterior during a hero day.

After the patch, the only states that legitimately produce `null` are:

- Title / character-creation / pre-game (not reached — `Minimap` isn't rendering yet).
- Arc complete (`getNextGroup() === null` AND `_gateUnlocked`).

---

## 6. Post-jam rework spec — data-driven quest tracking

The jam patch is surgical. For post-jam, replace it with a proper quest-chain module.

### 6.1 Goals
- No hardcoded tile coordinates in `_updateQuestTarget()`.
- Quest steps cycle across the hero-faction-dungeon schedule automatically.
- Anchors align with `DumpTruckSpawner` so the truck and the marker are *always* in agreement about where the current work site is.
- Designers can add, remove, or reorder quest steps by editing a data file, not engine code.

### 6.2 Proposed module — `engine/quest-chain.js`

```
QuestChain = {
  init(),                    // builds steps from current schedule + progress
  getCurrentStep() → {       // what the marker should point at right now
    id, label, floorId, target:{x,y},
    completionPredicate, nextStepId
  },
  onFloorEnter(floorId),     // advance if a 'reach floor' step is satisfied
  onReadinessChange(floorId, score),  // advance if a 'readiness met' step is satisfied
  onItemAcquired(itemId),    // advance on key pickups
  onScheduleAdvance(groupId) // called when DungeonSchedule resolves a contract
}
```

### 6.3 Step data shape

```js
{
  id: 'spade.dungeon.deep.1',
  label: 'Scrub the Soft Cellar',
  anchor: {
    source: 'schedule',        // 'fixed' | 'schedule' | 'dump-truck' | 'door-to'
    groupId: 'spade',
    floorId: '1.3.1',
    kind: 'stairsDn'           // fixed x/y, stairsDn, stairsUp, doorExit, npcId, chestId
  },
  completes: {
    type: 'readiness',
    floorId: '1.3.1',
    threshold: 0.6
  },
  next: 'spade.lobby.exit'
}
```

### 6.4 Chain template generated from `DungeonSchedule` + `DumpTruckSpawner`

For each unresolved contract in schedule order:

```
reach exterior (via DumpTruckSpawner.getDeploySites()[group].floorId)
    └── find door-to lobby (via cached doorTargets)
        └── in lobby → stairsDn
            └── for each group floorId → readiness ≥ target → stairsDn (or stairsUp on last)
                └── back to lobby → doorExit
                    └── back to exterior → dispatch check-in → mark group resolved
```

All computed at runtime from three inputs: `DungeonSchedule.getSchedule()`, `DumpTruckSpawner.getDeploySites()`, and each floor's `doorTargets`.

### 6.5 "Lost between floors" becomes structurally impossible

The step is a discrete object. Floor transitions cannot un-set it. Only an explicit advance predicate (readiness crossed, item acquired, floor entered, group resolved) can move to the next step. The renderer still just draws whatever the current step's `target` resolves to — but the *state* lives in `QuestChain`, not in a re-derivation every tick.

### 6.6 Anchor to the DumpTruckSpawner rotation
`DumpTruckSpawner._deploy()` already walks `DungeonSchedule` every day change and picks the active faction. Hook `QuestChain.onScheduleAdvance()` into the same pathway so the marker and the truck deploy in lockstep. If on a given day the truck is at Floor 2 (14,6), the quest chain's current step is guaranteed to be "enter the club dungeon via (14,5)".

### 6.7 i18n note
Each step carries a `label` key. LG webOS submission already needs i18n pass-through on dispatcher dialogue; quest step labels slot into the same system and show up as a single-line HUD banner when the marker is visible.

---

## 7. Verification plan

After the patch, walk these paths and confirm the marker is visible at every step:

1. Fresh save → walk Floor 0 → promenade → dispatcher fires → home → chest → exit → east gate → Floor 2 → Watchman's Post → 2.2 → 2.2.1 → readiness 0.6 → 2.2.2 → readiness 0.6 → out.
2. Spade path: keys → west → soft cellar → 1.3 → 1.3.1 → readiness → out.
3. Diamond path from Floor 1: confirm cross-exterior chain hop displays the east gate as the next anchor.
4. Duck into the Coral Bazaar mid-work: confirm the marker points at the shop's `doorExit` rather than vanishing.
5. Die in a dungeon → respawn at bonfire → confirm marker still points at the deeper stairs.

Each step should produce a visible pulsing green diamond on the minimap. Any frame where the diamond disappears during this walk is a regression.

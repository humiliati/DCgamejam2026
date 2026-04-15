# SEED_AND_SAVELOAD_DESIGN.md — Seed Payload, Save/Load Architecture, and Player-Facing Seed UX

**Status:** Design draft (2026-04-14). Feeds `tools/short-roadmap.md` (world-designer → BO-V handoff) and `BLOCKOUT_REFRESH_PLAN.md §1.3` (tooling).

**Purpose:** One document that answers three questions we've been treating separately:

1. What payload does the **world-designer** hand to **BO-V** when it scaffolds a new floor? (authoring)
2. How do we persist and restore a **run-in-progress** without re-serializing the entire world? (save/load)
3. How does the **player** ever see, share, or re-enter a seed? (player-facing UX)

The answers share a common spine — the same seed that reproduces a floor's proc-gen scatter also keys the save file and the shareable seed phrase. Getting this layered right now prevents a painful refactor when we add save/load, daily runs, or leaderboards post-Jam.

---

## 1. Baseline — what we already have

- `engine/rng.js` — Mulberry32 `SeededRNG` singleton. Global `_seed`, `random()`, `randInt`, `pick`, `weighted`, `shuffle`. Ten engine modules already call into it (`grid-gen`, `enemy-ai`, `cleaning-system`, `breakable-spawner`, `crate-system`, `loot-tables`, `hero-system`, `shop`, `floor-manager`, `card-authority`).
- `EyesOnly/public/js/seeded-rng.js` + `seeded-random.js` — the reference implementation. Same Mulberry32; adds `generateSeed()` (Date.now XOR Math.random), 3-word phrase encoding, `parseSeedPhrase()`, an unused `getDailySeed()`.
- `EyesOnly/public/js/save-load.js` — localStorage save/load that serializes the **entire** grid + entities. This is the anti-pattern we want to avoid at scale (see §4).

What we don't have yet: a per-run seed lifecycle, a seed payload contract between tools, any save/load, and any player-facing seed surface.

---

## 2. Two seeds, two lifecycles

The critical design move is separating **authoring** from **runtime**. We need two distinct seed systems, each with a different lifetime and a different consumer:

### 2.1 Authoring seed — `authorSeed`

Lives only during world-designer scaffolding. Used to generate the initial grid that BO-V opens. Once the designer saves in BO-V, the grid is frozen into `engine/floor-blockout-<id>.js` and `authorSeed` is no longer meaningful — the file IS the authored output. The designer may never see this seed.

| Property | Value |
|----------|-------|
| Lifetime | One scaffold invocation |
| Consumer | World-designer's grid scaffolder |
| Persisted | As a comment in the generated floor-blockout file (for reproducibility when re-scaffolding) |
| Player-facing? | No |

### 2.2 Runtime seed — `runSeed`

Generated once per new-game (or once per save slot). Drives everything proc-gen at play time: enemy spawns, breakable scatter, hero-mess distribution, trap reset variations, loot rolls, weather sequences, living-infrastructure state ticks. This is the one players see, share, and re-enter.

| Property | Value |
|----------|-------|
| Lifetime | Full run (new game → game over / victory) |
| Consumer | All engine modules that currently call `SeededRNG` |
| Persisted | In the save file; player-facing as a 3-word phrase |
| Player-facing? | Yes — see §5 |

**Why two seeds?** A single seed would couple authored layout to proc-gen scatter — change the hand-cut grid and you'd invalidate every prior run's scatter layout. Separating them means the designer can tune a floor's blockout without breaking player save compatibility, and a player can share a "LANTERN-DRAGON-SCAR" seed knowing every other player gets the same scatter over the same authored floors.

**Implementation note.** `SeededRNG` currently has one module-level `_seed`. Keep the singleton; add two lifecycle methods:

```js
SeededRNG.beginRun(runSeed)   // called once at new-game; reseeds with runSeed
SeededRNG.deriveFloor(floorId) // called per floor-enter; reseeds to hash(runSeed, floorId)
```

Per-floor derivation means entering floor "2.2.1" always produces the same scatter for the same `runSeed`, even if the player detoured through "1.6" in between. Hash is plain string-mix — no cryptography needed, just determinism.

---

## 3. World-designer → BO-V seed payload contract

When world-designer births a new floor node, it writes a JSON blob next to (or inside) the scaffolded `floor-blockout-<id>.js`. BO-V reads this blob on load and uses it to:

- Prime the tile picker with biome-appropriate tiles (highlight the biome's wall/floor/prop tiles at the top)
- Show a "required tiles" checklist panel (spawn, entry door, pinned exits) that ticks off as they're placed
- Lock certain cells (pinned doorTargets) so the designer can't accidentally paint over them

### 3.1 Payload shape

```json
{
  "version": 1,
  "floorId": "2.2",
  "authorSeed": "a7c3f914",
  "parent": "2",
  "depth": 2,
  "biome": {
    "name": "commercial_interior",
    "palette": {
      "wall": [1, 18],
      "floor": [0, 19],
      "ceiling": null,
      "light": [40, 41, 43]
    },
    "defaults": {
      "wallTile": 1,
      "floorTile": 0,
      "torchTile": 40
    }
  },
  "dimensions": { "w": 24, "h": 16 },
  "required": [
    { "kind": "spawn", "hint": "center-south", "pinned": true },
    { "kind": "entry-door", "at": { "x": 12, "y": 15 }, "tile": 4, "faces": "N", "pinned": true, "target": "2" },
    { "kind": "exit-door", "at": { "x": 12, "y": 0 }, "tile": 3, "faces": "S", "pinned": true, "target": "2.2.1" }
  ],
  "stamps": [
    { "name": "shop-bar-counter", "at": { "x": 3, "y": 3 }, "rotate": 0 }
  ],
  "budget": {
    "enemies": { "min": 0, "max": 3, "roster": ["commoner", "cutpurse"] },
    "breakables": { "min": 2, "max": 6 },
    "lights": { "min": 1, "max": 3 }
  },
  "narrativeHints": ["dispatcher office", "faction_watchmen"]
}
```

### 3.2 Field semantics

- `version` — payload schema version. Bump when we add fields.
- `floorId` — string id per the CLAUDE.md floor hierarchy (`"N"`, `"N.N"`, `"N.N.N"`).
- `authorSeed` — hex seed the scaffolder used. Re-running with the same seed and payload reproduces the seeded starting grid (useful if a designer wants to "reset" a half-finished blockout). Not used at runtime.
- `parent`, `depth` — redundant with `floorId` but cheap to carry; lets BO-V validate hierarchy without re-parsing.
- `biome.palette` — arrays of tile ids that BO-V's tile picker should surface first. Per-biome palettes live in a new `tools/biomes.json` sidecar (mirror of EyesOnly's `biomes.json` pattern, but keyed off our TILES schema, not emoji).
- `biome.defaults` — single-tile picks used by the scaffolder when seeding the initial grid. BO-V's resize-fill dropdown should default to `biome.defaults.floorTile`.
- `required` — the non-negotiable cells. BO-V pre-stamps these and shows them on a checklist panel. `pinned: true` means "cannot be painted over without explicit unlock." Kinds we need at minimum: `spawn`, `entry-door`, `exit-door`; later: `quest-object`, `faction-anchor`, `hero-mess-origin`.
- `stamps` — optional named stamps from `tools/stamps.json` to apply at scaffold time. Gives world-designer a way to say "every shop floor starts with a bar-counter at (3,3)".
- `budget` — runtime-side hints. BO-V doesn't enforce these, but the engine's scatter systems read them at floor-enter to know how many enemies / breakables / lights to spawn. Range form (min/max) keeps proc-gen lively across seeds.
- `narrativeHints` — free-text tags the dialogue / quest systems can key off. Not structural.

### 3.3 Where it lives on disk

Two options, pick one:

**Option A:** Sidecar JSON at `tools/floor-payloads/<floorId>.json`. Clean separation, easy to diff, BO-V reads it at floor load. Con: one more file per floor.

**Option B:** Inline at the top of the generated `floor-blockout-<id>.js` as a `var FLOOR_PAYLOAD = {...};` literal. Everything for a floor lives in one file. Con: the payload mutates as the designer edits pinned targets, so `Ctrl+S` has to patch a fourth region on top of GRID/SPAWN/doorTargets.

**Recommendation:** Option A. Simpler patcher surface, and the sidecar can be regenerated by `tools/extract-floors.js` alongside `floor-data.json`. We already have one sidecar per concern (floors, tiles, cards, enemies, strings) — one more fits the pattern.

---

## 4. Save/load architecture

### 4.1 Design principle: save diffs, not state

EyesOnly serializes the entire 40×20 grid + every entity into localStorage. This works at jam scale but breaks down when (a) grids get larger (Floor 2 is already heading to 48×32+), (b) you want to support multiple save slots, (c) you want cloud sync, or (d) you want to version saves across patches.

We can do better because **our floors are authored, not procedural**. The grid is already on disk in `engine/floor-blockout-*.js`; the save file doesn't need to duplicate it. Instead, save three things per floor:

1. **Cleanup diff** — which tiles have been scrubbed, torches lit, crates restocked, traps re-armed. Sparse — most cells are unchanged. Grows over the run.
2. **Entity diff** — which scatter entities (enemies, breakables, loot) have been killed/broken/taken. Sparse.
3. **Explored mask** — bitfield of which cells the player has seen. Cheap (one bit per cell).

Plus one run-global blob for the player (position, stats, inventory, card state, quest flags, faction standings).

### 4.2 Save file shape

```json
{
  "version": 1,
  "runSeed": "a7c3f914",
  "seedPhrase": "LANTERN-DRAGON-SCAR",
  "createdAt": 1744300000000,
  "playtimeMs": 4200000,
  "buildVersion": "0.14.2",
  "currentFloor": "2.2.1",
  "player": {
    "x": 14, "y": 8, "facing": 0,
    "hp": 18, "maxHp": 22,
    "stats": { "blade": 2, "ranger": 1, "shadow": 3, "sentinel": 0, "seer": 1 },
    "callsign": "We",
    "class": "shadow"
  },
  "cards": {
    "hand": [12, 34, 56, 78, 90],
    "deck": [...],
    "bag": [...],
    "stash": [...],
    "equipped": [14, 22, 41],
    "gold": 142
  },
  "quests": {
    "act1_hero_wake": "in-progress",
    "faction_watchmen": 2,
    "dragon_truth_known": false
  },
  "factions": {
    "watchmen": 15,
    "dispatcher": 0,
    "church": -5
  },
  "floors": {
    "1": { "explored": "base64-bitmask", "cleanup": [[4,5,0],[6,2,40]], "entities": [{"id":"b1_7","gone":true}] },
    "2.2": { ... },
    "2.2.1": { ... }
  }
}
```

### 4.3 Field notes

- `runSeed` / `seedPhrase` — the hex seed and its 3-word encoding. Present in every save; the phrase is what the player sees.
- `buildVersion` — lets us refuse to load saves from incompatible builds. Bump when the authored grids change shape (Floor 2 rebuild is a `buildVersion` bump).
- `floors.<id>.cleanup` — array of `[x, y, newTileId]` triples. On load, we re-apply these over the authored grid.
- `floors.<id>.entities` — sparse diff keyed by entity id (`b1_7` = breakable room-1 index-7, etc.). Only entities that have changed state are recorded; everything else re-derives from `runSeed` + `floorId`.
- `floors.<id>.explored` — base64-encoded bitmask, one bit per cell. Drives the minimap fog-of-war.
- Not in the save: the authored grids themselves, enemy scatter that hasn't been touched, loot that hasn't dropped, texture atlas, anything deterministic from the code + seed.

### 4.4 Save / load flow

**On save** (manual save slot, autosave on floor transition, autosave on game-over):
1. Collect the current floor's cleanup diff + entity diff + explored mask.
2. Merge with previously-saved floor state (other floors we've visited).
3. Serialize player + cards + quests + factions as-is.
4. Write to the chosen backend (localStorage for web, webOS storage for TV app, future: cloud).

**On load:**
1. Read the save blob.
2. `SeededRNG.beginRun(save.runSeed)`.
3. Resolve `currentFloor` → load its authored grid from the floor-blockout file.
4. `SeededRNG.deriveFloor(currentFloor)` → regenerate scatter.
5. Apply `cleanup` diff over grid, apply `entities` diff over scatter, hydrate `explored` mask into minimap.
6. Rehydrate player + cards + quests + factions.
7. Place camera on `player.x, player.y` facing `player.facing`.

The key invariant: **the authored grid + the runSeed + the diff is sufficient to reconstruct exact game state.** If we ever find ourselves also saving raw tile arrays, something is wrong.

### 4.5 Multi-slot + autosave

- **Three named slots** + one autosave slot (rotate on floor transition).
- Each slot shows: seed phrase, callsign, class, playtime, current floor name, timestamp.
- Autosave is write-through on floor-transition and on checkpoint tiles (bonfire, inn, home).
- Manual save available at any walkable tile.
- **Death is not save-destructive.** The resurrection-at-home-bed system owns what's lost: the player's **hand, equipped quick-slots, draw deck, and bag** are wiped; **stash and bonfire storage persist**. See §4.6.

### 4.6 Death, resurrection, and the save file

Dungeon Gleaner is not a permadeath roguelike — death is a setback with a fixed narrative shape. The player respawns in the bed at `1.6` Gleaner's Home. The trigger branches by floor context:

- **Combat defeat on a dungeon floor** (depth 3+) → fade to bed, morning light, the save file is rewritten with the loss applied.
- **Curfew violation on an exterior/interior floor** (depth 1–2) → the same bed wake, a different narrative framing (watchman dragged you home).

Save-file effect of a death event, applied through `CardAuthority`:

| Zone | Death behavior |
|------|----------------|
| Hand (5) | Wiped |
| Equipped quick-slots (3) | Wiped |
| Draw deck | Wiped |
| Backup deck (30) | Wiped |
| Bag (12) | Wiped |
| **Stash (20)** | **Persists** |
| **Bonfire storage** (Driftwood Inn overheal stash) | **Persists** |
| Gold | **50% penalty** (confirmed — `CardAuthority.failstateWipe()` already taxes half) |
| Cleanup progress per floor | Persists (the work you did stays done) |
| Entity diffs per floor | Reset on the floor you died on (enemies repopulate); other floors persist |
| `currentFloor` | Forced to `"1.6"` |
| `player.facing` | Forced to bed-exit direction |

This is a **save-file-visible event**, not an ad-hoc in-memory mutation. On death: CardAuthority emits the wipe events → save system writes the post-death state → resurrection cutscene plays from the reloaded save. Loading a save after a mid-death crash therefore always lands on the post-resurrection state, never halfway through the wipe.

Implementation hook: **`CardAuthority.failstateWipe()` already exists** (`engine/card-authority.js` lines 709–761) and implements this transaction today — wipes hand/backup/deck/equipped/bag (Joker Vault items survive), preserves stash, applies 50% gold penalty, emits `death:reset`. M2 death integration just needs the save system to listen for `death:reset`, persist the post-wipe state, and force `currentFloor = "1.6"`. No new CardAuthority API required.

Tested via save-file snapshot diffs in M2.

### 4.7 Per-floor diffs feed the readiness bar

Per-floor diff shape isn't just a save-file optimization — it's the same shape the readiness system already consumes. `ReadinessCalc.getReadiness(floorId)` reads `CleaningSystem`, `CrateSystem`, `TorchState`, and `TrapRearm` state keyed by floor. The debrief feed and the HUD readiness bar (`docs/READINESS_BAR_ROADMAP.md`) surface those per-floor numbers aggregated by dungeon group (e.g. "Hero's Wake B1+B2 readiness: 72%").

Implication for the save contract: **readiness is derived, never persisted as a number.** We save the underlying per-floor cleanup/entity diff and let `ReadinessCalc` recompute on load. This means save files survive any re-tuning of the readiness weights in §2 of `READINESS_BAR_ROADMAP.md` without needing migration — only the raw state persists. The bar redraws with the new weights the moment the new build ships.

Minimap breadcrumb follows the same rule — derived from `currentFloor`'s parent chain at load, not persisted.

---

## 5. Player-facing seed UX

The seed is a first-class player-facing object, not a debug console log.

### 5.1 Seed phrase encoding

**Decision: in-world thematic vocabulary.** Words are pulled from `Biome Plan.html` locations, `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` factions/NPCs, and the card/item corpus. Every seed phrase should read like a dispatch callsign — flavor doubles as marketing and ties seed-sharing into the fiction.

Borrow EyesOnly's 3-word pattern with game-flavored vocabulary:

- **Word 1 (location):** LANTERN, CORAL, PROMENADE, WAKE, GARRISON, ... (24 tokens from Biome Plan locations)
- **Word 2 (creature/faction):** DRAGON, WATCHMAN, CUTPURSE, OPERATIVE, ... (24 faction / enemy / NPC tokens)
- **Word 3 (object/quality):** SCAR, LANTERN, KEY, EMBER, ... (24 item / adjective tokens)

`24 × 24 × 24 = 13,824` phrases. Not enough for unique-per-player global space, but fine for *recognizable reproducibility* — two players comparing seeds will catch collisions by looking at the hex fallback. For the full 32-bit space, append a `-<4 hex>` disambiguator: `"LANTERN-DRAGON-SCAR-a7c3"`.

Code lives in `engine/seed-phrase.js` (Layer 0, zero-dep). Two functions: `encode(hexSeed) → "WORD-WORD-WORD-HHHH"` and `decode(phrase) → hexSeed | null`. Word lists are arrays of 24 strings; add vocab tokens during Jam polish.

### 5.2 Surfaces

| Where | What |
|-------|------|
| Title screen → New Game | "Random seed" default; "Enter seed" sub-flow lets you type/paste a phrase. Invalid phrases gracefully fall back to random + toast. |
| Title screen → Load Game | Each slot shows its seed phrase in small text under the slot label. |
| Pause menu | Seed phrase visible at the bottom of the pause overlay. Click to copy. |
| Game-over screen | Seed phrase shown alongside stats. "Retry with same seed" button reboots the run with `runSeed` preserved. |
| Victory screen | Same, plus "Share seed" copy-to-clipboard. |
| Dispatcher (NPC) | In-fiction surface. Dispatcher can reference "your dispatch ID" = the seed phrase. Useful for narrative framing later. |

### 5.3 Reproducibility contract

A seed phrase + `buildVersion` reproduces the proc-gen scatter *exactly*. What's NOT reproduced:

- Player choices (which cards drawn, which doors taken, which NPCs engaged, which cleanup actions performed)
- Timing (real-time weather, if we make weather real-time)
- Anything that hits `Math.random()` instead of `SeededRNG.random()` — so don't.

We document this contract in the "What a shared seed means" tooltip on the seed-entry screen. Avoids the "I entered your seed and got a different dungeon!" support load.

---

## 6. Roadmap

Three milestones, sequenced. Each is a separate doc-card for `tools/short-roadmap.md` when we slice them.

### M1 — Seed lifecycle + per-floor derivation (foundational, ~half-day)

- [ ] Add `SeededRNG.beginRun(seed)`, `SeededRNG.deriveFloor(floorId)`, `SeededRNG.currentSeed()` to `engine/rng.js`.
- [ ] Call `beginRun` at `Game.startNewRun()`; call `deriveFloor` at every `FloorTransition` enter.
- [ ] Audit every `Math.random()` call in the engine and convert to `SeededRNG.random()`.
- [ ] Create `engine/seed-phrase.js` with `encode` / `decode` + three 24-token word lists.
- [ ] Debug HUD: show current `runSeed` phrase in the dev-overlay.

**Ship gate:** two consecutive fresh-install runs with the same hand-entered phrase produce visually identical floors (modulo player action).

### M2 — Save/load with diff-based persistence (~1-2 days)

- [ ] Design sealing decision: localStorage for web, webOS storage API for TV app. Pick an abstraction layer now (`engine/save-backend.js`).
- [ ] Implement cleanup diff + entity diff + explored mask per floor.
- [ ] Autosave hook on `FloorTransition.commit()`.
- [ ] Three-slot save UI on title screen.
- [ ] "Retry with same seed" on game-over.
- [ ] `buildVersion` gate with a friendly "this save is from an older build" message.

**Ship gate:** save mid-dungeon, fully close the tab, reopen, load — same floor, same enemies alive/dead, same cleanup state, same inventory.

### M3 — World-designer seed payload + BO-V handoff (~2-3 days; gated on world-designer existing)

- [ ] Spec `tools/floor-payloads/<id>.json` schema per §3.1.
- [ ] World-designer generates payload JSON + `floor-blockout-<id>.js` scaffold.
- [ ] BO-V loads payload on floor-select; pre-stamps `required` tiles; locks `pinned: true` cells.
- [ ] BO-V tile picker re-sorts to surface `biome.palette` tiles first.
- [ ] BO-V "Required" panel shows checklist of missing required tiles with jump-to-cell buttons.
- [ ] `extract-floors.js` includes payload in `floor-data.json`.

**Ship gate:** world-designer scaffolds a new interior, opens BO-V, and the entry door + spawn are already placed and locked before the designer paints a single cell.

### Post-Jam stretch

- **Daily seed** — `getDailySeed(date)` → everyone who starts a run on Apr 27th plays the same seed. Leaderboard by playtime or cleanup score.
- **Seed history** — "recent seeds you've played" on title screen.
- **Share as URL** — `dungeongleaner.com/?seed=LANTERN-DRAGON-SCAR` auto-fills the new-game seed entry.
- **Cloud save** — probably gated on LG account infrastructure for the webOS build.

---

## 7. Cross-references

- `tools/BO-V README.md` — "Creating a new floor" section will become the consumer-side docs for §3 once M3 lands.
- `tools/short-roadmap.md` — slice M1 / M2 / M3 into passes here as they come up.
- `BLOCKOUT_REFRESH_PLAN.md §1.3` — "Tooling" subsection points into this doc for the seed-payload half of the world-designer handoff.
- `docs/DOC_GRAPH_BLOCKOUT_ARC.md` — add this doc to the orange Tooling cluster (or a new yellow "Player Systems" cluster) once M2 ships.
- `EyesOnly/public/js/seeded-rng.js`, `seeded-random.js`, `save-load.js` — reference implementations. Borrow Mulberry32 (already have it), borrow the 3-word phrase idea (new), explicitly don't borrow the full-grid serialization (anti-pattern at our scale).
- `engine/rng.js` — the module we extend in M1.

---

## 8. Open questions

- ~~**Seed-phrase word list curation.**~~ **RESOLVED (2026-04-14):** in-world thematic vocabulary — locations from Biome Plan, factions/NPCs from Street Chronicles, items/adjectives from the card corpus. Token list curation is an M1 task.
- ~~**Does dying wipe the autosave?**~~ **RESOLVED (2026-04-14):** no. Death is not save-destructive. The resurrection-at-home-bed system wipes hand + equipped + draw deck + backup deck + bag; stash and bonfire storage persist. Trigger branches by floor depth (combat on dungeon floors, curfew on exterior/interior). See §4.6.
- ~~**Per-floor vs per-run diff.**~~ **RESOLVED (2026-04-14):** per-floor. The cleanup state is already read per-floor by `ReadinessCalc.getReadiness(floorId)` (see `docs/READINESS_BAR_ROADMAP.md`), and the debrief feed surfaces a readiness bar per dungeon group. The save diff mirrors that per-floor model exactly — readiness is **derived from the persisted per-floor state**, not a separate saved number. See §4.7.
- ~~**Is `currentFloor` enough, or do we save the full visited path?**~~ **RESOLVED (2026-04-14):** `currentFloor` is enough. No `floorStack` persistence. The minimap rebuilds its breadcrumb from the floor-ID parent chain on load (`"1.3.1"` → implies `["1", "1.3", "1.3.1"]`).
- ~~**Does the world-designer need to exist before M1/M2 ship?**~~ **RESOLVED (2026-04-14):** no. M3 is **parked** until the world-designer tool's dependencies are lined out separately. M1 and M2 are unblocked and engine-side only.

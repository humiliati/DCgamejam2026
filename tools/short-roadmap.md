# tools/short-roadmap.md

Three active tracks: **BO-V tooling pass** (near-complete), **Seed / Save-Load / World-Designer** (M1/M2 active, M3 parked), and **Agent-feedback closeouts** (Track C, new).

---

## Track A — BO-V tooling pass (near-complete)

Proposed order:

1. Read BLOCKOUT_REFRESH_PLAN.docx (docx skill) so I know its structure before spec'ing doc edits ✅
2. Build the help button + help modal (biggest UX win, unblocks the doc update because I can point at it) ✅
3. Wire the status bar ✅
4. Update BO-V README (new Ctrl+S behavior, help button, what the tool is/isn't, agent workflows section) ✅
5. Add tooling node to DOC_GRAPH_BLOCKOUT_ARC.md + reading-order mention ✅
6. Splice authoring subsection into LIVING_INFRASTRUCTURE_BLOCKOUT.md ✅
7. Update BLOCKOUT_REFRESH_PLAN.docx with tooling section + cross-refs ✅

---

## Track B — Seed / Save-Load / World-Designer

Sliced from `docs/SEED_AND_SAVELOAD_DESIGN.md` on 2026-04-14. Each milestone is a PR-sized slice. Tick boxes as they land. When M1 is green, size M2; same for M3. Don't skip ahead — M2 diffs depend on M1 determinism, M3 payload loading depends on M2 save schema.

### Prep — completed 2026-04-14

- [x] Draft `docs/SEED_AND_SAVELOAD_DESIGN.md` (two-seed architecture, payload contract, diff save, phrase UX, §4.6 death model).
- [x] Create `engine/seed-phrase.js` stub with three frozen 24-token word lists (LOCATIONS / FACTIONS / OBJECTS) + `encode` / `decode` / `isPhrase`.
- [x] Audit `Math.random()` in `engine/` — ~80 hits, ~8 gameplay-significant (see table below).
- [x] Confirm `CardAuthority.failstateWipe()` already implements §4.6: wipes hand/backup/deck/equipped/bag, preserves stash, Joker-Vault items survive, **50% gold penalty** (this answers the gold TBD from §4.6), emits `death:reset`. M2 death integration reuses the existing transaction — no new API needed.
- [x] Confirm `FloorTransition._doFloorSwitch` hook point for `SeededRNG.deriveFloor()` — between line 147 (`FloorManager.setFloor`) and line 165 (`FloorManager.generateCurrentFloor`).

#### Math.random audit — converted vs deliberately left alone

**Conversion philosophy refined during M1 implementation:** SeededRNG for **content** (what's in the world, what's in the deck, what's rolled as an outcome). Math.random for **runtime-tick jitter** (timing, pitch, animation noise, tie-breaker noise). Converting tick jitter to SeededRNG would make the seed stream depend on frame timing — two runs of the same seed would diverge whenever NPC ticks land on different frames. That's worse than the problem it solves.

**Converted (gameplay content):**

| File | Line | Use | Done |
|---|---|---|---|
| `engine/combat-bridge.js` | 676 | Refight roll (friendly → hostile) | ✅ |
| `engine/game.js` | 1502 | Hero confiscate hand index | ✅ |
| `engine/enemy-deck.js` | 126 | Combat deck Fisher-Yates | ✅ |
| `engine/title-screen.js` | 437, 438 | Class stat roll (player-facing char creation) | ✅ |
| `engine/hero-run.js` | 52–55 | Removed `Math.random` fallback branch | ✅ |

**Deliberately left as `Math.random` (runtime-tick jitter, not content):**

| File | Line | Why left alone |
|---|---|---|
| `engine/combat-bridge.js` | 704 | Bark pool pick — cosmetic flavor line |
| `engine/enemy-ai.js` | 48 | ID suffix — identity-only, doesn't affect gameplay |
| `engine/enemy-ai.js` | 78, 200 | Bark timer stagger — audio jitter |
| `engine/enemy-ai.js` | 357 | Step audio pitch — audio jitter |
| `engine/npc-system.js` | 717, 761, 1138 | VF pathing tie-breaker + linger + ambient gate — runtime tick noise |
| `engine/vendor-dialog.js` | 80 | Greeting pick — cosmetic |
| `engine/debug-boot.js` | 89, 90 | Dev-only, not player-facing |
| `engine/card-fan.js` | 407 | Shuffle animation cosmetics |

All particle/weather/audio cosmetics also stay on `Math.random` for the same reason.

### M1 — Seed lifecycle + per-floor derivation (~half-day) ✅ (code-complete — ship-gate test pending)

**Ship gate**: `?seed=LANTERN-DRAGON-SCAR-a7c3` → play Floor 1 + 1.3 + 1.3.1 → screenshot → reload → enemy placements, breakable scatter, hero-mess piles pixel-identical (modulo live particles). **Needs user-side browser run; see M1 verification note below.**

- [x] Extend `engine/rng.js`:
  - [x] `SeededRNG.beginRun(seed)` — seeds module, stores `_runSeed`. (rng.js:82–90)
  - [x] `SeededRNG.deriveFloor(floorId)` — reseeds to `hash(runSeed, floorId)` via FNV-1a XOR-folded with `_runSeed`. (rng.js:104–114)
  - [x] `SeededRNG.currentSeed()` — for debug HUD. (rng.js:117–119)
  - [x] `SeededRNG.runSeed()` — returns the top-level run seed. (rng.js:122–124)
- [x] Wire `SeededRNG.beginRun(runSeed)` in `TitleScreen.deploy()` — title-screen.js:454–458 consumes `window._pendingRunSeed` stashed by `Game.init()` before class stat rolls.
- [x] Wire `SeededRNG.deriveFloor(targetFloorId)` in `FloorTransition._doFloorSwitch` — floor-transition.js:160–164, after `FloorManager.setFloor` (line 147) and before `FloorManager.generateCurrentFloor` (line 166).
- [x] Convert Math.random gameplay-significant sites (table above) — all 5 landed:
  combat-bridge.js:676 (refight roll), game.js:1555 (hero confiscate hand index),
  enemy-deck.js:125 (combat deck Fisher-Yates), title-screen.js:476–477 (class stat roll),
  hero-run.js:52–55 (Math.random fallback branch removed).
- [x] Dev HUD: runSeed phrase in debug overlay — debug-perf-monitor.js:639–641 renders
  `SeedPhrase.encode(SeededRNG.runSeed())` in the overlay footer. `currentSeed()` not yet
  shown per-floor; deferred as post-M1 polish (runSeed is sufficient for the ship-gate test).
- [x] `?seed=<phrase>` URL param handler in `Game.init()` — game.js:208–225 decodes via
  `SeedPhrase.decode`, stashes on `window._pendingRunSeed` for TitleScreen.deploy to consume.
  Invalid phrases warn + fall back to random seed in `beginRun()`.

**M1 verification note (pending user's browser):** Open the game with `?seed=LANTERN-DRAGON-SCAR-a7c3` (or any valid phrase), walk Floor 1 → 1.3 → 1.3.1, screenshot each, reload with the same URL, walk the same path, compare. Enemy placements, breakable scatter, and hero-mess pile positions should be pixel-identical. If they drift, the remaining suspects are (a) a missed `Math.random` gameplay site, (b) generation order dependent on async load timing, or (c) a floor entering the tick loop before `deriveFloor` runs. Bash-mount stale-sync prevented in-session smoke; this is a user-terminal / user-browser gate.

### M2 — Save/load with diff-based persistence (~2.5-3 days)

**Ship gate**: Manual save at Floor 1.3 mid-cleanup → close tab → reopen → load → same floor, same enemies alive/dead, same cleanup state, same hand/equipped/bag/stash, same gold, same explored mask.

Sliced 2026-04-15 after audit revealed M2.1 already covered more than the flat bullet list implied, and that M2.3 has partial progress. Order is dependency-forced: **M2.2 populates scalar/per-module state → M2.3 populates per-floor diffs → M2.4 wires autosave + death + curfew → M2.5 ships the UI**. Don't skip ahead.

#### M2.1 — Schema + slot I/O (~½ day) ✅

- [x] `engine/save-backend.js` (Layer 1) — `read(slot)`, `write(slot, json)`, `list()`, `remove(slot)`, `exists(slot)`. Browser impl: localStorage. Slot namespace: `dg_save_slot_0..2` + `dg_save_autosave`. webOS fork deferred post-Jam.
- [x] `engine/save-state.js` (Layer 3, after FloorManager). Schema `version: 1` frozen in a `// DO NOT RENUMBER` comment (`SCHEMA_VERSION = 1`, `BUILD_VERSION = '0.14.2'`).
- [x] Full skeleton serializer/deserializer with structurally-valid shapes for every top-level key (version/buildVersion/runSeed/seedPhrase/createdAt/playtimeMs/currentFloor/player/cards/clock/shops/workOrders/debuffs/respawn/quests/factions/floorStack/floors).
- [x] Public slot API: `save(slot)`, `load(slot)`, `remove(slot)`, `peek(slot)`, `autosave()`, `listSlots()`, `beginRun()`.
- [x] Resume handshake: `setResuming`/`isResuming`/`consumeResuming` lets TitleScreen hand off to Game without a window global.

#### M2.2 — State population from live modules (~½ day) ✅

- [x] **Player** (save-state.js:157–199): reads from `Player.state()` — position, facing, hp/maxHp, full stat block (str/dex/stealth/energy/battery/fatigue trio), callsign/class/avatarId, debuffs, flags. Deserialize uses `Player.setPos`/`setDir`/`applyDebuff`.
- [x] **Cards**: delegates to `CardAuthority.serialize()` / `CardAuthority.deserialize()` — full hand/backup/deck/bag/stash/equipped/gold round-trip with all change events re-emitted on load.
- [x] **Clock**: derives `{day, timeOfDayPct, heroCyclePos}` from `DayCycle.getDay/getHour/getMinute`; deserialize reverses the time-of-day pct back to (hour, minute) via `DayCycle.setTime(day, hr, min)`.
- [x] **Debuffs** (save-state.js:248–271): per-id slot table `{groggy, sore, humiliated, shaken}` with `active` + `expiresDay = currentDay + daysRemaining`. Stable JSON shape across engine changes, deserialize uses `Player.applyDebuff`.
- [x] **Respawn**: reads/writes the full `HazardSystem._bonfirePositions` map via `getBonfirePositions`/`setBonfirePositions` — preserves shallower-floor anchors across mid-run transitions.
- [x] **Shop** (new 2026-04-15): added `Shop.serialize()`/`Shop.deserialize()`. Captures only the currently-open shop's live state (`_factionId`, `_floor`, deep-copied `_inventory` with slot `sold` flags, `_cacheKey`, `_open`) since per-faction rep lives in Player flags and inventory rebuilds deterministically from (faction, floor, repTier, cycleIdx). The save-state stub kept `tide/foundry/admiralty` keys for forward-compat, adds a `current` key holding `Shop.serialize()`.
- [x] **WorkOrderSystem** (new 2026-04-15): added `serialize()`/`deserialize()`. Captures the floor-keyed `_orders` map + `_currentCycle` + `_completedCount` + `_failedCount`. The save-state stub's legacy `{available, accepted, completed}` fields stay for schema continuity; the real shape lands under a `state` key.
- [x] **Quests / Factions**: remain forward-compat `{}` stubs — owning engine modules don't exist yet. Will populate when those modules land (post-M2 or in a dedicated faction slice).
- [x] **Seed handshake preserved**: `_deserialize` calls `SeededRNG.beginRun(blob.runSeed)` directly; it does NOT need to interact with `window._pendingRunSeed` (that's only the TitleScreen → fresh-run path).

#### M2.3 ✅ — Per-floor diffs (~¾–1 day) (shipped 2026-04-15)

Shipped across five subslices: **M2.3a ✅** (2026-04-15) — CleaningSystem blood map + GrimeGrid sub-tile state (base64 Uint8Array per allocated tile); **M2.3b ✅** (2026-04-15) — TorchState per-floor records with `_loaded` gate; **M2.3c ✅** (2026-04-14) — Minimap `explored` bitmap + CrateSystem `containers`; **M2.3d ✅** (2026-04-15) — TrapRearm {consumed, rearmed, total} with onFloorLoad grid-patch; **M2.3e ✅** (2026-04-15) — retired legacy stubs in `_emptyFloorDiff`. Remaining categories listed in `save-state.js:_emptyFloorDiff` as forward-compat stubs for modules that don't exist yet (doors, buttons, puzzles, vermin, formidables, entities) — each will be filled in by a future slice as its owning module lands.

- [x] **M2.3a ✅** CleaningSystem persistence (2026-04-15) — `GrimeGrid.serialize(floorId)` / `deserialize(floorId, snap)` walk keys by `"floorId:"` prefix, base64-encode each Uint8Array via chunked `btoa` (5.5KB per 64×64 wall tile vs ~16KB for JSON-of-bytes). `CleaningSystem.serialize(floorId)` bundles the discrete `_bloodMap[floorId]` + `GrimeGrid.serialize(floorId)` + the `seeded` flag into `{blood, grime, seeded}`; returns null when the floor has no state. Wired into `save-state.js:_serializeFloors` (layers onto every floor in `seenFloors = minimap.floors ∪ floorStack`), `_emptyFloorDiff` (stub fields `blood: {}`, `grime: {}`, `seeded: false`), and `_deserialize` (floor-keyed hydration loop, runs alongside CrateSystem — does not depend on FloorManager having regenerated the floor yet). Bindfs cache hid the actual file sizes from `node --check`; per CLAUDE.md the Read tool is authoritative.
- [x] **M2.3b ✅** TorchState persistence (2026-04-15) — `TorchState.serialize(floorId)` deep-copies the per-floor `{"x,y": {x, y, tile, biome, idealFuel, slots[3]}}` map via a `_copyTorch` helper (slots and items are sliced, junk flag preserved). Returns null on empty floors. `TorchState.deserialize(floorId, snap)` rebuilds the map and flips a new `_loaded[floorId]` flag. The flag is the key insight: FloorManager still calls `registerFloor` + `applyHeroDamage` on post-load regen, and both now short-circuit when `_loaded[floorId]` is set — `registerFloor` instead walks the saved records and **patches each `torch.tile` value back onto the fresh grid** (otherwise the grid shows authored baseline TORCH_LIT everywhere while records say TORCH_UNLIT). `applyHeroDamage` bails unconditionally so it doesn't re-roll on top of saved state. `clearFloor` / `reset` clear `_loaded` alongside `_floors`. Wired into `save-state.js:_serializeFloors`, `_emptyFloorDiff` (`torches: {}`), and `_deserialize` (floor-keyed loop).
- [x] **M2.3d ✅** TrapRearm persistence (2026-04-15) — `TrapRearm.serialize(floorId)` returns `{consumed, rearmed, total}` where consumed/rearmed are sparse `{"x,y":true}` sets (safely re-copied via `_copyKeys` to break aliasing) and total is the baseline TRAP count at floor load. Returns null only when no baseline count AND no consumed traps (brand-new floor). `TrapRearm.deserialize(floorId, snap)` rebuilds all three maps. The post-load grid-patch lives in the **existing** `onFloorLoad` function rather than a new gate module: its `if (_total[floorId] !== undefined) return;` guard becomes a code path that walks `_consumed[floorId]` and stamps `TILES.EMPTY` onto each consumed-but-not-rearmed position (the baseline grid regenerates with TRAP everywhere, so only consumed positions need patching; re-armed positions are already TRAP). Wired into `save-state.js:_serializeFloors`, `_emptyFloorDiff` (`traps: null`), and `_deserialize` (floor-keyed loop).
- [x] **M2.3e ✅** Retire legacy stubs + seal M2.3 (2026-04-15) — `_emptyFloorDiff` audited and pruned. **Removed** (superseded by reality-matched keys shipped in M2.3a–d): `cleanedTiles` + `bloodTiles` (→ `blood` + `grime`), `armedTraps` + `disarmedTraps` (→ `traps`), `sealedCrates` + `chestPhases` (→ `containers`). **Retained as forward-compat stubs** (modules don't exist yet): `relockedDoors` / `unlockedDoors` (DoorContracts has no per-floor lock-state serialize hook yet), `resetButtons` / `scrambledPuzzles` (modules don't exist), `verminSpawns` / `verminLastRefreshDay` / `reanimatedFormidables` (post-Jam track), `entities` (needs EnemyAI + NpcSystem serialize — separate slice). Updated per-key comments to cite owning module, and expanded the save-state.js file header from "M2.3 ⏳" to "M2.3 ✅" with per-subslice provenance. Track B M2.3 sealed; next up: M2.4.
- [ ] `entities` — dead/alive list for enemies + NPC relocations. Source: `EnemyAI._state` + `NpcSystem`. Kill-state is the primary save target; positional relocations secondary.
- [ ] `armedTraps` / `disarmedTraps` — `HazardSystem` owns trap state; needs serialize/deserialize parallel to bonfire map.
- [ ] `relockedDoors` / `unlockedDoors` — `DoorContracts` per-door lock state; floor-keyed map.
- [ ] `resetButtons` / `scrambledPuzzles` — TBD modules.
- [ ] `sealedCrates` / `chestPhases` — `CrateSystem` chest phase progression (partial already via containers).
- [ ] `verminSpawns` + `verminLastRefreshDay` — TBD vermin module.
- [ ] `reanimatedFormidables` — post-Jam track.

#### M2.4 — Autosave hooks + death:reset + curfew teleport (~½–1 day)

- [ ] `FloorTransition.commit()` end-of-transition autosave write-through (slot = autosave).
- [ ] Checkpoint tile autosaves: bonfire rest, inn bed, home bed. Hook into their interact handlers.
- [ ] Death integration: `save-state.js` listens for `death:reset`, persists post-wipe state, forces `currentFloor` to the act-appropriate residence anchor per §4.6. **Decision (2026-04-15): curfew → teleport is handled in this same slice.** The `_onCurfew` callback in `day-cycle.js` currently fires at 02:00 with no gameplay effect; M2.4 gives it a real effect by resolving an **act-aware residence anchor**: Act 1 → `"1.6"` (Gleaner's Home); later acts → most-recently-rested bonfire on the current floor if present, else the act's current residence (detective flat, church nave, etc. — exact ID per arc). Same transform used for both combat death and curfew violation (the only difference is whether `failstateWipe()` ran — curfew re-uses the save-file write path without wiping cards). Residence-anchor resolver lives in `save-state.js` so a single function owns the act→floor mapping.

#### M2.5 — Title UI + retry + buildVersion gate (~½ day)

- [ ] Title screen save-slot UI: 3 manual + 1 autosave. Each shows seed phrase, callsign, class, playtime, floor label via `SaveState.peek(slot)`.
- [ ] "Retry with same seed" button on game-over screen: reads `SeededRNG.runSeed()` before `failstateWipe()` fires, stashes on `window._pendingRunSeed` so the next TitleScreen.deploy reuses it. Also display the phrase on the game-over vignette footer for player visibility.
- [ ] `buildVersion` gate: compare `SaveState.BUILD_VERSION` vs `blob.buildVersion` on load — if mismatch, show "Load anyway / Cancel" modal before calling `_deserialize`.

### M3 — World-designer seed payload + BO-V handoff (~2-3 days) — **PARKED**

Parked 2026-04-14. M3 resumes once the world-designer tool's dependencies are lined out in a separate pass. M1 + M2 proceed unblocked — they are engine-side and payload-agnostic. When we return to M3, the design contract in `docs/SEED_AND_SAVELOAD_DESIGN.md §3` is the starting point.



**Ship gate**: Designer scaffolds new interior → BO-V opens with door + spawn pre-placed and pinned, biome palette pre-selected, required-cells checklist visible.

- [ ] Spec `tools/floor-payloads/<id>.json` per `docs/SEED_AND_SAVELOAD_DESIGN.md §3.1`.
- [ ] World-designer module generates payload JSON alongside `engine/floor-blockout-<id>.js` scaffold.
- [ ] BO-V payload loader: fetch `tools/floor-payloads/<id>.json`, pre-stamp `required` cells, lock `pinned: true` ones.
- [ ] BO-V tile picker surfaces `biome.palette` tiles first.
- [ ] BO-V "Required" side panel: checklist with jump-to-cell buttons.
- [ ] `tools/extract-floors.js` bundles payload JSON into `floor-data.json`.
- [ ] Round-trip test: scaffold → paint → Ctrl+S → play — door targets + spawn + biome defaults all correct.

### Post-Jam stretch

- Daily seed (`getDailySeed(YYYY-MM-DD)`) + leaderboard.
- Seed history on title screen.
- URL share (`dungeongleaner.com/?seed=...`).
- webOS LG account cloud save.
- Word-list expansion with a format-version prefix (`v2:LANTERN-DRAGON-SCAR-a7c3`) so M1 saves never break.

---

## Track C — Agent-feedback closeouts (Pass 5d)

Sliced from `tools/BO-V agent feedback.md` (Floor 3.1.1 field report, April 2026). The agent
chose raw authoring over the CLI because of five concrete blockers; this track closes all five.
Full spec in `tools/BLOCKOUT_VISUALIZER_ROADMAPv2.md` → "Pass 5d — Agent feedback closeouts".

**Exit criteria:** agent re-attempts a 3.1.1-class floor via the CLI and reports it was faster
than raw; `bo ingest` ↔ `bo emit` is byte-identical for a round-trip; `bo help <command>`
prints a worked example.

Scope: **3–4 days**. Target: land before Pass 5b (world-graph editor) so the graph editor
inherits a CLI that's already agent-friendly.

### Slice C1 — `--dry-run` on every mutator (~½ day) ✅

- [x] Shared pre-flight path in `bv-bo-router.js`: `run()` intercepts
  `cmd.dryRun`, takes a full-FLOORS snapshot, executes the action, computes
  a cell-level diff vs the snapshot, then restores state (in-place) —
  undo/redo stacks truncated, currentFloorId reselected, created floors
  dropped. `DRY_RUN_BLOCK` set rejects I/O-only actions (`save`,
  `downloadPendingSave`) so dry-run is a hermetic preview. Browser API:
  `{action:'paintRect', dryRun:true, ...}` → `{ok, dryRun:true, preview,
  wouldChange, cellsChanged, result}`. Helpers `_snapshotAll`,
  `_restoreAll`, `_diffAgainstSnapshot` exposed under `window.BO._helpers`
  for sibling modules (e.g. batched preview).
- [x] Top-level CLI flag `--dry-run` parsed in `tools/blockout-cli.js`
  dispatcher before subcommand runs. Implementation via `S.setDryRun(true)`
  in `tools/cli/shared.js` — every command's `S.saveFloors(raw)` call is
  swallowed and counted; dispatcher then computes diff of in-memory `raw`
  vs the pristine pre-run snapshot and prints a compact JSON preview to
  stdout (`{dryRun, command, wouldChange, totalCellsChanged, cells, spawn,
  doorTargets, floorsAdded, floorsRemoved, saveCallsSuppressed}`). Works
  for every mutating command (paint-rect, flood-fill, stamp-*, set-spawn,
  set-door-target, resize, create-floor, set-biome, place-entity, …)
  without per-command edits — the `saveFloors` chokepoint is the gate.
- [x] `__boSmokeTest` in `bv-bo-router.js` extended with a dry-run paintRect
  assertion: snapshots `FLOORS[fid].grid` + `EDIT.undoStack.length` pre,
  runs `paintRect` with `dryRun:true`, confirms grid + undo length are
  byte-identical post and `wouldChange === true`, logs PASS/FAIL.
- [x] CLI smoke: `node tools/blockout-cli.js paint-rect --floor 2.1 --at
  5,5 --size 3x3 --tile WALL --dry-run` emits preview to stdout, stderr
  note `floor-data.json NOT written (1 save call suppressed)`,
  `floor-data.json` mtime unchanged.

### Slice C2 — IIFE round-trip (`bo ingest` / `bo emit`) (~1 day) ✅

- [x] `tools/cli/iife-sandbox.js` — lifts the VM sandbox + DOM/engine stubs
  from `tools/extract-floors.js` into a reusable module. Exports
  `createSandbox()`, `bootstrapForIngest()` (loads `engine/tiles.js` +
  `engine/floor-manager.js`), `extractFloor(sandbox, floorId)` (pulls from
  `FloorManager._testGetBuilders()` and normalizes to floor-data.json shape).
  Enables per-file ingest without rebuilding the whole world.
- [x] `tools/cli/emit-iife.js` — shared deterministic IIFE scaffolder.
  Mirrors `scaffoldFloorBlockoutSource` + `formatGridLiteral` +
  `floorBlockoutFileName` from `tools/js/bv-save-patcher.js` (byte-compatible
  modulo attribution comment). Banner comment reminds maintainers that
  output shape must stay in sync between the browser scaffold path and the
  CLI emit path; the Slice C2 round-trip test enforces this going forward.
- [x] `tools/cli/commands-ingest.js` — registers `bo ingest` with
  `--from <path>` / `--floor <id>` / `--print` flags. Either flag derives
  the other via `fileNameForFloor` / `floorIdFromFileName`. Boots the
  sandbox, evals the target IIFE, extracts via `extractFloor`, merges into
  `raw.floors[floorId]` (preserves existing entities if IIFE omits them),
  calls `S.saveFloors(raw)`. `--print` short-circuits to stdout JSON.
- [x] `tools/cli/commands-emit.js` — registers `bo emit` with `--floor`,
  `--as iife|json`, `--out <path>`, `--overwrite` flags. `--overwrite`
  always targets `engine/floor-blockout-<id>.js` (no path-guessing
  footgun); mutually exclusive with `--out`. Honors `S.isDryRun()` —
  `--dry-run` skips the actual write but still prints the payload metadata.
  Default (no `--out`/`--overwrite`) writes to stdout.
- [x] Wired both into `tools/blockout-cli.js` `COMMANDS` via
  `require('./cli/commands-ingest')` + `require('./cli/commands-emit')`;
  `'emit': 1` added to the `READ_ONLY` set (emit handles dry-run of its
  own writes internally, so the dispatcher treats it as read-only for the
  `--dry-run` bookkeeping).
- [ ] Round-trip smoke test deferred to user terminal: `node
  tools/blockout-cli.js ingest --floor 2.2.1 && node tools/blockout-cli.js
  emit --floor 2.2.1 --as iife --out /tmp/rt.js` → diff `/tmp/rt.js`
  against `engine/floor-blockout-2-2-1.js`. Bash-mount stale-sync
  observed during Slice C1 verification blocks running this from the
  in-session sandbox; the commands themselves are wired and expected to
  pass modulo attribution-comment whitespace.

### Slice C3 — `bo help <command>` (~½ day) ✅

- [x] Metadata centralized in `tools/cli/help-meta.js` rather than scattered
  across every `commands-*.js` (cleaner maintenance — one file to edit when
  adding a new command). Dual-mode UMD: Node `require()` via the CLI path
  AND `<script src="cli/help-meta.js">` in the browser visualizer attaches
  to `window.BlockoutHelpMeta`. Entry shape `{description, args: [{name,
  about, required}], example}`. Covers every public action: paint/paint-rect/
  paint-line/flood-fill/replace, list-floors/get-floor/resize/set-spawn/
  set-door-target, render-ascii/describe-cell/diff-ascii, validate/
  report-validation, tile/tile-name/tile-schema/find-tiles, stamp-room/
  stamp-corridor/stamp-torch-ring/save-stamp/apply-stamp/list-stamps/
  export-stamps/delete-stamp, create-floor/set-biome/place-entity/
  git-snapshot/git-diff, ingest/emit, describe, help itself.
- [x] `tools/cli/commands-help.js`: `bo help` → formatted index;
  `bo help <command>` → args block + worked example; `bo help <command>
  --json` → JSON payload (agent-friendly). Always exit 0, even on unknown
  command — emits a helpful stub so scripted pipelines never break.
- [x] Wired into `tools/blockout-cli.js` COMMANDS, added `'help'` to
  `NO_FLOORS` (doesn't need floor-data) and `READ_ONLY` (safe under
  `--dry-run`). `printHelp` now points users at `bo help <command>` for
  per-command docs.
- [x] Browser mirror `window.BO.help(action)` in `tools/js/bv-bo-router.js`
  returns the same shape as `bo help --json`. No-arg call returns
  `{commands: {name: meta}}`; action arg returns `{command, meta}` or
  `{error: 'unknown command', available: [...]}`. Graceful fallback if
  `window.BlockoutHelpMeta` wasn't loaded (shouldn't happen — added to
  `tools/blockout-visualizer.html` right before `bv-bo-router.js`).
- [x] Verified by inspection: `bo help paint-rect` prints required
  `--floor/--at/--size/--tile` plus optional `--outline` with a full
  example line; `bo help set-door-target` prints `--floor/--at/--target`
  with the "empty string to clear" note; `bo help emit` covers
  `--floor/--as/--out/--overwrite` with the mutual-exclusion caveat.

### Slice C4 — Biome-specific stamps (~1–1½ days) ✅

- [x] `stampTunnelCorridor({floor, at, len, dir?, ribTile?, wallTile?, floorTile?})`
  added to `tools/js/bv-bo-router.js` ACTIONS. 3-row band (ribbed flank /
  floor walkway / ribbed flank) with tapered 3-wide mouths at both ends.
  `dir` parameter (0=E/1=S/2=W/3=N) rotates the canonical layout in place
  so the same stamp builds north-south corridors without pre-rotation.
  Defaults land on TUNNEL_RIB (94) / TUNNEL_WALL (95) / EMPTY for the
  submarine-base biome; overridable for dungeon-mine or sewer biomes.
- [x] `stampPortholeWall({floor, at, side:'L'|'R', span, tile?, jambTile?})`
  added. Writes a single row of `2*span - 1` cells alternating
  `[tile, jamb, tile, jamb, …, tile]` running left or right from `at`.
  Defaults PORTHOLE_OCEAN (96) + TUNNEL_WALL (95) jamb masonry.
- [x] `stampAlcoveFlank({floor, at, count, spacing?, depth?, tile?})`
  added. Paints `count` symmetric pairs of TUNNEL_WALL faces at
  `(at.x ± 2, at.y + i*spacing)` with `depth` tiles-thick per face.
  Leaves the 2-cell gutter untouched so the caller fills chamber
  interior with their preferred biome floor tile.
- [x] CLI mirrors `stamp-tunnel-corridor`, `stamp-porthole-wall`,
  `stamp-alcove-flank` in `tools/cli/commands-stamps.js`. Shared
  `_applyStampCells(raw, f, cells)` helper handles bounds checking +
  `S.saveFloors(raw)`, so every new stamp automatically inherits
  `--dry-run` support from Slice C1's `saveFloors` chokepoint.
- [x] `help-meta.js` entries for all three commands — args, defaults,
  and a worked example each.
- [x] `tools/stamps.json` seeded with `tunnel_corridor_8` (8×3 east
  corridor), `porthole_wall_4` (7×1 horizontal span of 4), and
  `alcove_flank_3` (5×5 triple pair). Each usable via `bo apply-stamp
  --name <n>` as a starting canvas the agent can rotate/flip.
- [ ] Smoke test against 3.1.1 deferred to agent run (composability
  verification, not code correctness). Round-trip ingest→emit on 3.1.1
  will confirm the stamp cells write into engine/floor-blockout-3-1-1.js
  without drift once the agent authors with the new primitives.

### Slice C5 — IIFE-aware `render-ascii` (~½ day) ✅

- [x] `_resolveFloor(raw, id)` helper added to `tools/cli/commands-perception.js`.
  Tries `raw.floors[id]` first; on miss, boots the shared `iife-sandbox`
  harness, eval's `engine/floor-blockout-<id>.js` (filename derived via
  `commands-ingest._fileNameForFloor`), and pulls the floor payload via
  `sandboxMod.extractFloor`. Hermetic — does **not** call `S.saveFloors`,
  so `floor-data.json` is never mutated as a side effect of perception.
  Throws a specific error if neither source resolves (floor-data miss
  AND engine file missing, or IIFE didn't register a matching builder).
- [x] `render-ascii` and `describe-cell` both migrated from
  `S.requireFloor(raw, args.floor)` to the `_resolveFloor` try/catch
  pattern. Both emit a new `source: 'floor-data' | 'iife'` field in
  their JSON output so agents can tell whether they're reading authored
  data or a pending scaffold's in-memory extraction.
- [x] `diff-ascii` deliberately left on `S.requireFloor` — it compares
  against a before-snapshot file, which implies the target floor is an
  established member of `floor-data.json`. Running diff against an
  IIFE-only floor would be semantically meaningless.
- [x] Browser mirror: `renderAscii` in `tools/js/bv-bo-router.js` now
  throws an actionable error when `ensureFloor` misses — lists every
  currently-loaded floor id and suggests `node tools/blockout-cli.js
  ingest --floor <id>` as the recovery path for pending scaffolds. No
  attempt to eval IIFEs in-browser (would require `FloorManager` to be
  present, which it isn't in the visualizer context).

### Slice C6 — Stretch: `bo validate` expanded rules (optional)

- [ ] Every `STAIRS_*` / `DOOR*` tile on the floor has a `doorTargets` entry (or explicit
  fallback annotation).
- [ ] Room rectangles contain no wall tiles.
- [ ] Every freeform-tile depth matches the spatial contract's `tileWallHeights` table.
- [ ] Wire into the existing validation modal + CLI `report-validation` scope.

---

### Cross-references

- `docs/SEED_AND_SAVELOAD_DESIGN.md` — full design spec, open questions, §4.6 death model.
- `docs/BLOCKOUT_REFRESH_PLAN.md §1.3` — tooling section points here.
- `tools/BO-V README.md` — "Creating a new floor" consumer-side for M3.
- `engine/rng.js` — extended in M1.
- `engine/seed-phrase.js` — frozen word lists.
- `engine/card-authority.js` (lines 709–761) — `failstateWipe()`, reused in M2 death path.
- `engine/floor-transition.js` (lines 147–165) — M1 `deriveFloor` hook.
- `docs/READINESS_BAR_ROADMAP.md` — per-floor diff is the same shape the readiness bar consumes; readiness is derived from saved state, never persisted as a number.
- `tools/BO-V agent feedback.md` — Track C source document (Floor 3.1.1 field report).
- `tools/BLOCKOUT_VISUALIZER_ROADMAPv2.md` → "Pass 5d — Agent feedback closeouts" — full spec for Track C.
- `tools/js/bv-save-patcher.js` — Pass 5c scaffold + parent-wiring; C2 reuses `scaffoldFloorBlockoutSource`.
- `tools/extract-floors.js` — C2 ingest reuses its VM sandbox.
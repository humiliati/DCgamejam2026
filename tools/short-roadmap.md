# tools/short-roadmap.md

Two active tracks: **BO-V tooling pass** (near-complete) and **Seed / Save-Load / World-Designer** (just sliced).

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

### M1 — Seed lifecycle + per-floor derivation (~half-day)

**Ship gate**: `?seed=LANTERN-DRAGON-SCAR-a7c3` → play Floor 1 + 1.3 + 1.3.1 → screenshot → reload → enemy placements, breakable scatter, hero-mess piles pixel-identical (modulo live particles).

- [ ] Extend `engine/rng.js`:
  - [ ] `SeededRNG.beginRun(seed)` — seeds module, stores `_runSeed`.
  - [ ] `SeededRNG.deriveFloor(floorId)` — reseeds to `hash(runSeed, floorId)` via FNV-1a or cheap mix.
  - [ ] `SeededRNG.currentSeed()` — for debug HUD.
  - [ ] `SeededRNG.runSeed()` — returns the top-level run seed (not per-floor derivative).
- [ ] Wire `SeededRNG.beginRun(runSeed)` in `TitleScreen.deploy()` (after callsign + class confirmed, before `Game.startNewRun`).
- [ ] Wire `SeededRNG.deriveFloor(targetFloorId)` in `FloorTransition._doFloorSwitch` between lines 147 and 165.
- [ ] Convert Math.random gameplay-significant sites (table above) to `SeededRNG.random()` / `randInt` / `pick`.
- [ ] Dev HUD: show current `runSeed` phrase in debug overlay (pause-menu footer OK for M1).
- [ ] `?seed=<phrase>` URL param handler in `Game.init()` — decode via `SeedPhrase.decode`, fall back to random + toast on invalid.

### M2 — Save/load with diff-based persistence (~1-2 days)

**Ship gate**: Manual save at Floor 1.3 mid-cleanup → close tab → reopen → load → same floor, same enemies alive/dead, same cleanup state, same hand/equipped/bag/stash, same gold, same explored mask.

- [ ] `engine/save-backend.js` (Layer 1) — `read(slot)`, `write(slot, json)`, `list()`, `remove(slot)`. Browser impl: localStorage. webOS: stub with localStorage (post-Jam).
- [ ] `engine/save-state.js` (Layer 3, after FloorManager). Schema `version: 1` frozen in a `// DO NOT RENUMBER` comment.
- [ ] Per-floor diffs: `explored` (packed bitmap string), `cleanupDiff` (vs authored baseline), `entityDiff` (kills, smashes, pickups, NPC relocations).
- [ ] Autosave hooks: `FloorTransition.commit()` end-of-transition write-through; checkpoint tiles (bonfire, inn bed, home bed).
- [ ] Death integration: `save-state.js` listens for `death:reset`, persists post-wipe state, forces `currentFloor = "1.6"` per §4.6.
- [ ] Title screen save-slot UI: 3 manual + 1 autosave. Each shows seed phrase, callsign, class, playtime, floor label.
- [ ] "Retry with same seed" button on game-over screen.
- [ ] `buildVersion` gate with "Load anyway / Cancel" dialog for cross-build saves.

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

### Cross-references

- `docs/SEED_AND_SAVELOAD_DESIGN.md` — full design spec, open questions, §4.6 death model.
- `docs/BLOCKOUT_REFRESH_PLAN.md §1.3` — tooling section points here.
- `tools/BO-V README.md` — "Creating a new floor" consumer-side for M3.
- `engine/rng.js` — extended in M1.
- `engine/seed-phrase.js` — frozen word lists.
- `engine/card-authority.js` (lines 709–761) — `failstateWipe()`, reused in M2 death path.
- `engine/floor-transition.js` (lines 147–165) — M1 `deriveFloor` hook.
- `docs/READINESS_BAR_ROADMAP.md` — per-floor diff is the same shape the readiness bar consumes; readiness is derived from saved state, never persisted as a number.
# Post-Jam Execution Order — Patch Release

> **Created:** 2026-04-07 | **Target:** Before voting closes (~2026-04-25)
> **Strategy:** Architecture + systems + polish. No new features or content.
> **Player feedback:** "Big game, broken menus." Returning players expect it to work.
> **Supersedes:** UNIFIED_EXECUTION_ORDER.md (jam-era), JAM_SPRINT_EXECUTION_ORDER.md (archived)

---

## Completed Work (Reference)

Everything below is DONE and should not be re-sequenced:

| Track | Steps | Status |
|-------|-------|--------|
| Sprint 0 | S0.1–S0.5 (CardAuthority, CardTransfer, rewire, cleanup) | ✅ COMPLETE |
| Track A | A1–A7 (N-layer raycaster, wall decor, cavity, lights, torches) | ✅ COMPLETE |
| Track PW | PW-1–PW-5 (grime grid, hose, spray, reel, nozzles) | ✅ COMPLETE |
| Track IO | IO-1–IO-7 (biome overrides, bonfire cooldown, sprite centering, hearth, caps) | ✅ COMPLETE |

**Stale debug notes (verified fixed in code):**
- DN-10 (DECK button face index) — code already routes to face 2
- DN-11 (deck denominator) — code uses CardAuthority.getBackupSize()
- Flee button routing — `_inCombat` check already dispatches to `_onFleeCallback()`
- IO-8 (CHEST walkability) — CHEST is already non-walkable + opaque

---

## Patch Execution Phases

### Phase P1 — Menu Usability (Critical Path) ✅

The #1 player complaint. Every returning player will test the menus first.

```
Step P1.1: Pause button for pointer users                                ✅ DONE
  │  ☰ hamburger button on #sb-pause. Click → Game.requestPause('pause', 0).
  │  Also serves as shared anchor: FLEE (combat) / REEL (hose) / ☰ (normal).
  │  Priority resolution via _refreshActionButton(). CSS pulse animations
  │  for sb-flee-active (red) and sb-reel-active (green).
  │  Files: status-bar.js, index.html
  │
Step P1.2: Menu face S-factor scaling pass                               ✅ DONE
  │  All 4 faces now use `var S = Math.min(w, h) / 400` for font sizes,
  │  padding, hit zones. 10+ sub-renderers converted from hardcoded px.
  │  DN-07 verified ✅.
  │  Files: menu-faces.js, menu-box.js
  │
Step P1.3: Debrief feed legibility                                       ✅ DONE
  │  Time row removed (DN-03 ✅). Dynamic base font-size from panelWidth
  │  scaling. All child sizes in em units. DN-04 verified ✅.
  │  Files: debrief-feed.js
  │
Step P1.4: Stale debug notes cleanup                                     ✅ DONE
     DN-10, DN-11 marked ✅. DN-09 verified ✅ (two dialogue systems
     documented). DEBUG_NOTES_SCREENER.md fully reviewed 2026-04-07.
     Files: docs/DEBUG_NOTES_SCREENER.md
```

**Phase P1 total: ~4-5h → completed**

### Phase P2 — Interaction Polish ✅

Things that work but feel broken to a first-time player.

```
Step P2.1: IO-9/IO-10 — Chest + Work Keys playtest gate              ✅ DONE
  │  Verified: Full code-path audit of Dispatcher→Home→Chest→Key flow.
  │  ChestPeek is visual-only (per-frame facing check), interact goes
  │  through PeekSlots→CrateUI, onWithdraw detects work_keys subtype,
  │  fires _onPickupWorkKeys→HomeEvents→gate unlocked. No issues found.
  │
Step P2.2: BAG button focus sync                                      ✅ DONE
  │  Verified: Already implemented. Game.requestPause('pause', 2, 'bag')
  │  sets invFocus before pause. Toggle-close on re-click. Mirrors DECK.
  │
Step P2.3: Currency button routing                                    ✅ DONE
  │  Verified: Gold click routes to Face 1. Fixed missing
  │  ScreenManager.resumeGameplay() on toggle-close path.
  │  File changed: status-bar.js
  │
Step P2.4: NPC dialogue choice wiring verification                    ✅ DONE
     Verified: Two complete dialogue systems — StatusBar.pushDialogue
     (inline DOM choices, click-delegated) and DialogBox.startConversation
     (canvas-rendered modal). Dispatcher uses StatusBar path with pinned
     mode. Full tree navigation, effect callbacks, showIf gating all wired.
     DN-09 marked ✅ Fixed.
```

**Phase P2 total: ~3-4h → completed (code audit + 1 bugfix)**

### Phase P3 — Architecture Cleanup ✅

Reduce fragility for future work. No player-visible changes, but prevents
regression in everything that follows.

```
Step P3.1: card-renderer.js → CardAuthority constants rewire          ✅ DONE
  │  CardRenderer's SUIT_DATA/RES_COLORS now delegate to CardAuthority
  │  when available (local fallback kept for script-order safety).
  │  _getResColor() delegates to CardAuthority.getResColor().
  │  card-draw.js and menu-faces.js were already rewired in Sprint 0.
  │  card-fan.js still uses CardRenderer.createGhostFromData (correct:
  │  that's rendering logic, not data authority).
  │  File changed: card-renderer.js
  │
Step P3.2: game.js extraction assessment                              ✅ DONE
  │  Assessed remaining blocks: NPC dialogue trees (1,614 lines, 0 deps,
  │  LOW risk), _interact (601 lines, HIGH risk), render+sprites (599,
  │  MED), input bindings (472, HIGH). Best candidate: dialogue trees.
  │  Assessment appended to DOC-72.
  │
Step P3.3: NPC dialogue trees extraction                              ✅ DONE
     Extracted 1,534-line dialogue tree block → npc-dialogue-trees.js.
     game.js: 5,306 → 3,774 lines (29% reduction).
     New file: engine/npc-dialogue-trees.js (1,571 lines, IIFE module).
     Script tag added to index.html (after npc-system.js, before game.js).
     Zero closure deps — pure data extraction, no state mutation.
```

**Phase P3 total: ~4-5h → completed**

### Phase P4 — Systems Hardening ✅

Make existing systems more robust. These are things that work in the
happy path but break on edge cases.

```
Step P4.1: Hose cross-floor edge cases                                ✅ DONE
  │  Verified: All 6 cancel paths wired and tested:
  │    wrong_building  — HoseState.onFloorEnter() + recordStep() guard
  │    dropped_exterior — same two locations
  │    bonfire_warp    — _warpToFloor() in game.js
  │    combat_damage   — Player.damage() in player.js
  │    energy_exhausted — step listener in game.js
  │    reeled          — HoseState.onReeledUp() (internal)
  │  DumpTruckSpawner already implements hero-day gating via
  │  DayCycle.isHeroDay() — no separate cleaning-truck.js needed.
  │
Step P4.2: Readiness weight verification                              ✅ DONE
  │  Verified: Core weights sum to 1.0 (crate 0.35, clean 0.25,
  │  torch 0.20, trap 0.20). Extra weights sum to 1.0. Depth-3
  │  override sums to 1.0. All subsystem getReadiness() returns
  │  [0,1]. Scenarios: 100% core = 100%, full run with extras ~155%
  │  (matches doc target 130-160%).
  │  Added: ReadinessCalc.logBreakdown(floorId) — console debug tool.
  │  File changed: readiness-calc.js
  │
Step P4.3: CrateUI hover tooltips + selection highlight               ✅ DONE
     Added hover tooltip above hovered slot — shows item name +
     match/mismatch for filled slots, "Needs: [frame]" for empty.
     Tooltip clamps to viewport, flips below slot if no room above.
     Added selection flash glow (400ms gold pulse) on deposit/withdraw.
     Fires on all fill paths: _fillFromBag, _fillFromBagAt,
     _fillSuitCardFromHand, _withdrawToBag.
     File changed: crate-ui.js
```

**Phase P4 total: ~3-5h → completed (audit + 2 code changes)**

### Phase P5 — Track B Quick Wins (Skybox) ✅

Track B was never started during jam. These are additive visual polish
with zero risk to existing systems.

```
Step P5.1: Sky color cycling (B1)                                     ✅ DONE
  │  Already implemented: _getPhaseColors() interpolates between
  │  DayCycle phases, _getStarAlpha() fades stars at dusk/dawn.
  │  Per-phase zenith/horizon tables exist on all exterior presets.
  │  No code changes needed — this was completed during jam.
  │
Step P5.1b: Star field quality (new — from skybox roadmap Phase 3)    ✅ DONE
  │  Replaced hash-based star placement (_hash1D grid artifacts) with
  │  seeded PRNG (LC generator, seed 7919). Ported EyesOnly starfield
  │  techniques: 4-tier layer system (350+100+35+12 = 497 stars),
  │  per-star drift at different layer speeds, scintillation spikes,
  │  glow halos for brightest stars (r > 0.8), small = crisp 1px
  │  fillRect / large = arc() circles. Stars now appear organic,
  │  not gridded. Pre-generated at first render, stored in arrays.
  │  File changed: skybox.js
  │
Step P5.2: HUD time widget (B4)                                      ⏳ DEFERRED
     Phase icon + hour + day counter — new feature, not a fix.
     DayCycle already exposes getDay(), getHour(), getPhaseIcon().
     Deferred to post-patch: adding new HUD elements is additive
     and risks layout regressions on LG 1920x1080 scaling.
```

**Phase P5 total: ~2.5h → completed (1 code change, 1 deferred)**

---

## Phase Dependencies

```
                P1.1 ─┐
                P1.2 ─┤
                P1.3 ─┼──→ P2 (interaction polish) ──→ P4.3 (crate hover)
                P1.4 ─┘              │
                                     └──→ P4.1, P4.2 (systems hardening)
                P3.1 ──→ P3.2 ──→ P3.3 (architecture cleanup)

                P1.3 ──→ P5.1 ──→ P5.2 (skybox quick wins)
```

All phases complete. P1 was the critical path — P2-P5 ran after.
See PLAYER_CONTROLLER_ROADMAP.md for remaining smoothness polish.

---

## What's NOT in This Patch

These are documented but explicitly deferred past the voting deadline:

| Item | Source | Why Defer |
|------|--------|-----------|
| Drag-drop unification (CardFan ↔ MenuFaces) | DN-12, HUD Phase 3 | Major refactor, 3-4h, high regression risk |
| EyesOnly convergence sprints (S1-S5) | UNIFIED_EXECUTION_ORDER §S1-S5 | 33h of work, wrong phase |
| Track B celestial bodies (B2) | SKYBOX_ROADMAP Phase 2 | Nice visual but not broken |
| Track B star parallax (B3) | SKYBOX_ROADMAP Phase 3 | Nice visual but not broken |
| Floor 3 blockout (C1-C3) | UNIFIED_EXECUTION_ORDER convergence | Content, not polish |
| Skill tree / quest log (Face 1 stubs) | MENU_INTERACTIONS_CATALOG | Content, not polish |
| Equipment slots (Face 2 stubs) | MENU_INTERACTIONS_CATALOG | Content, not polish |
| Controls rebinding (Face 3) | GAME_FLOW_ROADMAP post-jam | Feature, not fix |
| Pressure gauge HUD | PW roadmap §12 | Feature, not fix |
| Gyro aim spray targeting | PW roadmap §12 | Feature, not fix |
| Save/load system | GAME_FLOW_ROADMAP post-jam | Feature, not fix |
| Buff items in shop | SHOP_REFRESH_ECONOMY §7 | Content, not fix |
| Post-jam deferred items (5 buff items) | POST_JAM_ITEM_ROADMAP | Depend on unbuilt systems |

---

## Estimated Total

| Phase | Hours | Priority | Status |
|-------|-------|----------|--------|
| P1 — Menu Usability | 4-5h | **CRITICAL** | ✅ COMPLETE |
| P2 — Interaction Polish | 3-4h | HIGH | ✅ COMPLETE |
| P3 — Architecture Cleanup | 4-5h | MEDIUM | ✅ COMPLETE |
| P4 — Systems Hardening | 3-5h | MEDIUM | ✅ COMPLETE |
| P5 — Skybox Quick Wins | 2.5h | LOW | ✅ COMPLETE |
| **Total** | **17-22h** | | **✅ ALL DONE** |

All 5 phases completed as of 2026-04-07. 18 days remain before voting close.
Remaining polish tracked in PLAYER_CONTROLLER_ROADMAP.md (smoothness) and
DEBUG_NOTES_SCREENER.md (DN-08 partial, DN-12 deferred, DN-13 open).

---

## Cross-References

- TABLE_OF_CONTENTS_CROSS_ROADMAP.md — master doc index (DOC-1 through DOC-81)
- UNIFIED_EXECUTION_ORDER.md — jam-era sequencing (Sprint 0, Tracks A/B/PW/IO)
- Archive/JAM_SPRINT_EXECUTION_ORDER.md — original jam sprint phases (historical)
- DEBUG_NOTES_SCREENER.md — bug tracker (several entries now stale, see P1.4)
- GAME_JS_EXTRACTION_ROADMAP.md (DOC-72) — extraction candidates for P3.2
- MENU_INTERACTIONS_CATALOG.md (DOC-55) — face-by-face interaction inventory
- INTERACTIVE_OBJECTS_AUDIT.md (DOC-54) — tile interaction audit (IO-1 through IO-10)

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

### Phase P1 — Menu Usability (Critical Path)

The #1 player complaint. Every returning player will test the menus first.

```
Step P1.1: Pause button for pointer users                                    (30m)
  │  Problem: No way to open pause menu without ESC key. Magic Remote has
  │  no keyboard. This is a hard blocker for LG deployment.
  │  Fix: Add ☰ hamburger button to StatusBar. Click → Game.requestPause().
  │  Files: status-bar.js, index.html (add sb-pause element)
  │
Step P1.2: Menu face S-factor scaling pass                                   (2-3h)
  │  Problem: DN-07 — all menu faces render at tiny hardcoded pixel sizes.
  │  Click targets too small for Magic Remote pointer.
  │  Fix: Faces 0, 1, 3 need the same S-factor scaling that Face 2 already
  │  uses. Derive font sizes, padding, hit zones from viewport dimensions.
  │  Files: menu-faces.js (all 4 face render functions)
  │  Depends: None — pure rendering pass, no state changes
  │
Step P1.3: Debrief feed legibility                                           (1h)
  │  Problem: DN-04 — debrief feed content too small to read. DN-03 —
  │  time row is redundant (time already in minimap strip).
  │  Fix: Remove time row, scale feed text to S-factor, match EyesOnly
  │  format (avatar + 2-line event feed).
  │  Files: debrief-feed.js, status-bar.js
  │  Depends: None
  │
Step P1.4: Stale debug notes cleanup                                         (30m)
     Problem: DEBUG_NOTES_SCREENER.md lists fixed bugs as open.
     Fix: Mark DN-10, DN-11 as ✅ FIXED. Update DN-09 status. Add
     fix dates and verification notes.
     Files: docs/DEBUG_NOTES_SCREENER.md
```

**Phase P1 total: ~4-5h**

### Phase P2 — Interaction Polish

Things that work but feel broken to a first-time player.

```
Step P2.1: IO-9/IO-10 — Chest + Work Keys playtest gate                     (1h)
  │  Problem: The Dispatcher→Home→Chest→Key flow has never been verified
  │  end-to-end since IO-8 landed. This is the literal tutorial gate.
  │  Fix: Playtest the full flow. Fix any issues found. Verify ChestPeek
  │  shows before CombatBridge fires. Verify gate unlocks on key pickup.
  │  Files: game.js, peek-slots.js, chest interaction path
  │  Depends: IO-8 already resolved (CHEST is non-walkable)
  │
Step P2.2: BAG button focus sync                                             (30m)
  │  Problem: [BAG] button opens Face 2 but doesn't set _invFocus='bag'.
  │  Should toggle-close if already on Face 2 with bag focus.
  │  Fix: Mirror the DECK button pattern (already correct).
  │  Files: status-bar.js
  │
Step P2.3: Currency button routing                                           (30m)
  │  Problem: Gold display has hover animation but click does nothing.
  │  Fix: Route to Face 2 inventory with gold/shop focus, or Face 1
  │  character stats. Decision: Face 2 (matches "where is my stuff?").
  │  Files: status-bar.js
  │
Step P2.4: NPC dialogue choice wiring verification                           (1-2h)
     Problem: DN-09 — DialogBox choice buttons may not be fully wired for
     callback chain. Dispatcher interaction is the tutorial gate flow.
     Fix: Verify DialogBox.startConversation() choice callbacks fire.
     Trace dispatcher dialogue tree end-to-end. Fix any broken wiring.
     Files: dialog-box.js, npc-system.js, game.js (dispatcher interaction)
     Depends: P2.1 (same playtest flow)
```

**Phase P2 total: ~3-4h**

### Phase P3 — Architecture Cleanup

Reduce fragility for future work. No player-visible changes, but prevents
regression in everything that follows.

```
Step P3.1: card-renderer.js → CardAuthority constants rewire                 (1h)
  │  Problem: Sprint 0 follow-on — card-draw.js, card-fan.js, menu-faces.js
  │  still import RES_COLORS, SUIT_DATA, createGhostFromData from the legacy
  │  card-renderer.js. CardAuthority owns these now.
  │  Fix: Rewire consumers to CardAuthority. Then .bak card-renderer.js.
  │  Files: card-draw.js, card-fan.js, menu-faces.js, card-renderer.js
  │
Step P3.2: game.js extraction assessment                                     (1h)
  │  Problem: game.js is 5,075 lines. GAME_JS_EXTRACTION_ROADMAP (DOC-72)
  │  exists but needs a prioritized subset for this patch cycle.
  │  Fix: Read DOC-72, identify the 2-3 extractions with the best
  │  lines-saved-to-risk ratio. Don't execute yet — just prioritize.
  │  Output: Annotated extraction priority list appended to DOC-72.
  │
Step P3.3: game.js top-priority extraction(s)                                (2-3h)
     Execute the 1-2 extractions identified in P3.2.
     Likely candidates: floor transition logic, input binding block,
     or combat wiring (each is 200-400 lines of self-contained code).
     Files: game.js → new extraction module(s)
     Depends: P3.2
```

**Phase P3 total: ~4-5h**

### Phase P4 — Systems Hardening

Make existing systems more robust. These are things that work in the
happy path but break on edge cases.

```
Step P4.1: Hose cross-floor edge cases                                       (1-2h)
  │  Problem: Hose survival rules (wrong building cancel, bonfire cancel,
  │  combat damage cancel) need verification against all floor transition
  │  paths. CleaningTruck spawn logic (§2.1 of PW roadmap) is not yet
  │  implemented — truck is currently always available.
  │  Fix: Implement CleaningTruck spawn gating on HeroSystem.isHeroDay().
  │  Verify hose cancel triggers on all documented paths.
  │  Files: game.js (hose wiring), hero-system.js, cleaning-truck.js (new)
  │
Step P4.2: Readiness weight verification                                     (1h)
  │  Problem: ReadinessCalc weights were rebalanced during A7 (torch) and
  │  PW-5 (grime). Need to verify the full blend produces sane % on each
  │  playable floor with all systems active (torch + grime + crate + corpse).
  │  Fix: Add a debug readiness breakdown to console (or debrief feed).
  │  Test on floors 2.2.1 and 1.1.1 with standard enemy populations.
  │  Files: readiness-calc.js, cleaning-system.js
  │
Step P4.3: CrateUI Phase 3-4 (hover tooltips + selection highlight)          (1-2h)
     Problem: Crate interaction has clickable seal and bag strip but no
     hover feedback or selection state. Feels unresponsive.
     Fix: Implement hover tooltip (item name + frame match indicator) and
     selection highlight (border glow on focused slot).
     Files: crate-ui.js (or crate-peek.js)
     Depends: P1.2 (S-factor scaling — tooltips need to scale correctly)
```

**Phase P4 total: ~3-5h**

### Phase P5 — Track B Quick Wins (Skybox)

Track B was never started during jam. These are additive visual polish
with zero risk to existing systems.

```
Step P5.1: Sky color cycling (B1)                                            (1.5h)
  │  Per-phase color tables, smooth interpolation during day/night.
  │  Files: skybox.js, day-cycle.js
  │
Step P5.2: HUD time widget (B4)                                              (1h)
     Phase icon + hour + day counter. Remove redundant debrief feed clock.
     Files: hud.js
     Depends: P5.1 (DayCycle phase reads), P1.3 (debrief feed cleanup)
```

**Phase P5 total: ~2.5h**

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

P1 is the critical path — nothing else ships without working menus.
P2 and P3 can run in parallel after P1.
P4 and P5 are independent and can interleave.

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

| Phase | Hours | Priority |
|-------|-------|----------|
| P1 — Menu Usability | 4-5h | **CRITICAL** |
| P2 — Interaction Polish | 3-4h | HIGH |
| P3 — Architecture Cleanup | 4-5h | MEDIUM |
| P4 — Systems Hardening | 3-5h | MEDIUM |
| P5 — Skybox Quick Wins | 2.5h | LOW |
| **Total** | **17-22h** | |

With 18 days to voting close, this is comfortable even at 1-2h/day pace.

---

## Cross-References

- TABLE_OF_CONTENTS_CROSS_ROADMAP.md — master doc index (DOC-1 through DOC-81)
- UNIFIED_EXECUTION_ORDER.md — jam-era sequencing (Sprint 0, Tracks A/B/PW/IO)
- Archive/JAM_SPRINT_EXECUTION_ORDER.md — original jam sprint phases (historical)
- DEBUG_NOTES_SCREENER.md — bug tracker (several entries now stale, see P1.4)
- GAME_JS_EXTRACTION_ROADMAP.md (DOC-72) — extraction candidates for P3.2
- MENU_INTERACTIONS_CATALOG.md (DOC-55) — face-by-face interaction inventory
- INTERACTIVE_OBJECTS_AUDIT.md (DOC-54) — tile interaction audit (IO-1 through IO-10)

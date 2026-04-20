# Sprint Plan — Voting-Period Patch (DOC-130)

**Sprint:** Voting-Period Patch
**Dates:** 2026-04-20 → 2026-04-27 (7 days)
**Ship gate:** 2026-04-25 EOD (playtester patch build stamped and published)
**Buffer:** 2026-04-26 / 04-27 for playtester regression triage
**Concurrency:** 2 parallel Cowork sessions + Command.QaAndIntegration supervising
**Owner (this doc):** Command.QaAndIntegration

---

## Sprint Goal

> *Ship a stamped voting-period patch on 2026-04-25 that unifies refill-interaction UX across crate / corpse / torch / hose, lands Phases B–D of `docs/BLOCKOUT_REFRESH_PLAN.docx`, and gets the tutorial-world interaction roster (pressure wash, trap rearm, cobwebs, crate, corpse, torches) working end-to-end so peer feedback about "inconsistent UI between refilling interactions" is resolved.*

The patch is framed as a second submittal — the jam version shipped 2026-04-05 (`SaveState.BUILD_VERSION = 0.14.2`); this patch lands the refresh pass and the discoverability fix that peer reviewers flagged.

---

## Active Section Roster (Patch Sprint)

Original Alpha–Echo roadmap sections are **paused** for this sprint (trap rearm already shipped in Phase 1 per `COBWEB_TRAP_STRATEGY_ROADMAP.md`; Charlie's raycaster extraction is gated on framerate profiling and not patch-critical). New phonetic letters are added for the patch scope per user decision on 2026-04-20.

| Section | Charter | Primary specs | Est. sprint-days |
|---|---|---|---|
| **Foxtrot.BlockoutRefreshAndFloorUpdate** | Phases B–D of `BLOCKOUT_REFRESH_PLAN.docx` + per-floor §7 update pass across floors 0 → 3.1.N | `BLOCKOUT_REFRESH_PLAN.docx`, `DOOR_ARCHITECTURE_ROADMAP.md` (§Ph 3), `BLOCKOUT_ALIGNMENT.md` | 3–4 |
| **Golf.UiUnificationAndRefillAudit** | Vocabulary + icon consistency across `interact.fill` / `interact.restock` / `interact.refuel` / `interact.grab_hose`. Unified verb and glyph; class-gating stays invisible to player. | `UNIFIED_UI_OVERHAUL.md`, `CRATEUI_INTERACTION_OVERHAUL.md`, `engine/interact-prompt.js` ACTION_MAP | 2–3 |
| **Hotel.TutorialInteractionPolish** | End-to-end playability pass on tutorial-world interaction roster (pressure wash, trap rearm, cobwebs, crate, corpse, torches). Partial block on Golf landing UI consistency first. | `TUTORIAL_WORLD_ROADMAP.md` (§4 Initial Player Experience), `PRESSURE_WASHING_ROADMAP.md`, `COBWEB_TRAP_STRATEGY_ROADMAP.md`, `LIGHT_AND_TORCH_ROADMAP.md` | 2–3 |
| **India.PatchBuildGate** | Day-5 stamp, smoke test, release gate. Runs `scripts/stamp-build.sh`, full validator + harness suite, confirms playtester-visible build string, authors release notes. | `BUILD_VERSION_POLICY.md`, `PLAYTEST_AND_BLOCKOUT_PROCEDURE.md` | 1 |
| **Command.QaAndIntegration** | This session. Seam-watch, TOC ledger, union validator, handoff notes, daily status-report update. | (coordination role) | entire sprint |

### Stretch (if Foxtrot finishes early)

| Section | Charter | Gate |
|---|---|---|
| **Juliet.BlockoutRefreshPhaseE** | Boss door prototype at Hero's Wake B2 entrance (2-tile-wide synchronized animation, UV split). | Only if Foxtrot lands Phases B–D by EOD Day 3. Unblocked now since DOOR_ARCHITECTURE Phase 6A/6B shipped 2026-04-13. |

### Out of scope (deferred to next sprint)

- UNIFIED_UI_OVERHAUL Phases 5–7 (shop workflow polish, D-pad mobile, theme variety for peek screens)
- Charlie.RaycasterExtraction Phase 4 (gated on framerate profiling — DebugPerfMonitor needs to land first)
- Bravo.SpatialContractsAndProxy (proxy-zone design only; no code deliverable this patch)
- Delta.LivingWindowsAndWeather (weather module is post-jam per `WEATHER_MODULE_ROADMAP.md`)

---

## Capacity

Two parallel Cowork sessions × 5 working days (Apr 20 – Apr 24) + 1 ship day (Apr 25) = roughly 10 section-days of agent capacity, minus ~1 day of coordination overhead = ~9 section-days available. Total committed: ~8–10 section-days (Foxtrot + Golf + Hotel + India). Stretch sections spend the remainder if they open up.

**Planned capacity: ~9 section-days | Sprint load: ~8–10 section-days (~95% of capacity, inside the 70–80% target if Foxtrot's upper estimate holds).**

Buffer to 2026-04-27 covers post-ship regression triage if playtesters surface defects in the first 24–48 h.

---

## Dispatch Schedule

| Day | Session 1 | Session 2 | Command (me) |
|---|---|---|---|
| **Mon 04-20** | Foxtrot — Phase B (BuildingRegistry: Driftwood Inn + Gleaner's Home doorPanel updates); Phase C kickoff (Coral Bazaar / Storm Shelter DOOR_FACADE conversion) | Golf — audit `ACTION_MAP` in `interact-prompt.js`; propose unified verb + icon (likely "Restock" + 📦 as canonical); survey i18n strings | Sprint kickoff; open daily status log; publish this plan; run baseline `bo validate` + `check-budgets` |
| **Tue 04-21** | Foxtrot — Phase C finish; Phase D kickoff (Wolfenstein recess extension to PORTHOLE; Floor 0/1 gate placement) | Golf — land consistency patch on crate/corpse/torch prompts; smoke-test in-game; update `hud.js` tooltips to match | Run validators after each commit; check seam between Golf's prompt changes and Hotel's upcoming interaction work |
| **Wed 04-22** | Foxtrot — Phase D finish; start §7 floor-by-floor checklist (Floor 0 + Floor 1 refresh) | Hotel — pressure-wash loop end-to-end (truck spawn → hose pickup → clean grid → roll-up); verify refill prompts now match Golf's unified language | Midsprint status report (green/yellow/red per section); flag any section running red |
| **Thu 04-23** | Foxtrot — §7 Floor 2 + Floor 2.2 refresh (update pre-refactor states; no size rebuild) | Hotel — trap rearm + cobweb placement + torch refuel + crate fill smoke tests in tutorial path | Seam pass: does Foxtrot's Phase D gate tile registration match Hotel's interaction prompts? Reconcile if not |
| **Fri 04-24** | Foxtrot — §7 Floor 3 + Floor 3.1.N refresh; close any §7 residuals | Hotel — corpse harvest flow; end-to-end tutorial playthrough recorded for regression baseline | Run full union validator; confirm TOC entries for any new docs Foxtrot/Golf/Hotel authored |
| **Sat 04-25 (SHIP)** | — | — | India.PatchBuildGate: `bash scripts/stamp-build.sh` → full validator + harness suite → playtester-visible build string verified → release notes authored → `git push` |
| **Sun 04-26** | — | — | Regression watch; triage any playtester reports |
| **Mon 04-27** | — | — | Sprint retro; mark sections complete; update roster memory |

---

## Definition of Done (per section)

### Foxtrot.BlockoutRefreshAndFloorUpdate
- [ ] `engine/building-registry.js` reflects Phase B contrast matrix updates for Driftwood Inn + Gleaner's Home
- [ ] Coral Bazaar, Driftwood Inn, Storm Shelter converted to DOOR_FACADE with doorFaces + DoorSprites.setTexture + doorTargets wired
- [ ] Gate arches on Floor 0/1 edges render as recessed portholes with Wolfenstein inset
- [ ] Floors 0 through 3.1.N each checked against `BLOCKOUT_REFRESH_PLAN.docx` §7 checklist; per-floor checkbox doc in `docs/DEBUG_NOTES_SCREENER.md`
- [ ] `node tools/blockout-cli.js validate` (all floors) clean
- [ ] `node tools/check-budgets.js` clean

### Golf.UiUnificationAndRefillAudit
- [ ] Single canonical verb chosen (likely "Restock") for `fill` / `restock` / `refuel` / `grab_hose` family
- [ ] Single canonical icon across the family
- [ ] `engine/interact-prompt.js` ACTION_MAP updated; i18n strings reconciled
- [ ] Class-gated variants (Gleaner vs non-Gleaner) use same wording — only affordance availability differs, not terminology
- [ ] Tooltip hint entries aligned with new verb
- [ ] Smoke test: tutorial-world playthrough sees consistent prompts on crate / corpse / torch / truck

### Hotel.TutorialInteractionPolish
- [ ] Pressure-wash loop: grab hose from truck → drag through tutorial corridor → clean at least 3 grime tiles → roll-up auto-exit
- [ ] Trap rearm: re-arm consumed trap → self-step damage cycle works → readiness calc updates
- [ ] Cobweb placement: place cobweb in eligible corridor → self-tear penalty fires → enemy-pass destroys web
- [ ] Crate fill: bag-visible during fill → click-to-select → seal button appears when full → seal plays polish FX
- [ ] Corpse harvest (Gleaner class): yield premium loot → restock prompt consistent with Golf's unified language
- [ ] Torch refuel + extinguish cycle: unlit torch accepts wood → lit torch can be extinguished → lightmap updates
- [ ] Each interaction produces a tutorial-playthrough video capture (or screenshot trail) in `docs/DEBUG_NOTES_SCREENER.md`

### India.PatchBuildGate
- [ ] `bash scripts/stamp-build.sh` regenerates `engine/game-build-stamp.js` with fresh hash + date
- [ ] `window.GameBuildStamp.display` matches `SaveState.BUILD_VERSION` and the current commit
- [ ] Full validator chain clean: `bo validate` + `check-budgets` + `phase4-harness-v2` + `boxforge-phase1-smoke`
- [ ] Release notes authored (one `docs/RELEASE_NOTES_0.14.3.md`-style doc registered as next DOC-ID)
- [ ] Playtester-visible build string confirmed on title screen mismatch warning path

### Command.QaAndIntegration (me)
- [ ] This plan doc registered as DOC-130 in TOC
- [ ] Daily status logged in `docs/DEBUG_NOTES_SCREENER.md`
- [ ] Seam-watch: any cross-section API change gets written to memory as a project fact
- [ ] Post-ship: sprint retro + roster memory updated with outcomes
- [ ] Stretch: dispatch Juliet if Foxtrot lands Phase B–D by end of Wed

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Floor §7 update pass expands beyond checklist items (each floor is its own surprise) | Foxtrot runs past its 4-day estimate, delays Friday pre-ship validation | Command audits Foxtrot's per-floor commits mid-sprint (Wed); if >50% of budget burned on <50% of floors, cut Floor 3.x to next sprint |
| Golf unifies vocabulary in a way that breaks existing i18n consumers | Tutorial dialogue / toast copy references old verbs, regresses | Grep `fill\|restock\|refuel\|grab_hose` across `engine/` + `docs/` before the edit; update all sites in one commit |
| Hotel hits a systemic bug in pressure-wash or cobweb system (both are the most complex interactions) | Interaction polish blocked pending deeper engine fix | Hotel's charter is *polish*, not *authoring*. If a systemic bug is discovered, Command logs it, Hotel polishes what works, the bug goes to next sprint as an engineering section (likely Alpha- or Charlie-descendant) |
| Patch ship day (Sat 04-25) surfaces a regression in India's validator run | Ship slips past 04-25 | Friday evening validator dry-run (Command runs the full suite against Foxtrot/Golf/Hotel's HEAD before India opens on Saturday) |
| Peer-feedback refill fix doesn't land the discoverability win players hoped for | Voters still flag UI inconsistency post-patch | Hotel's tutorial-playthrough video is the acceptance test. If a first-time player can't complete all 6 interactions without external help, Golf's fix failed and we iterate in a post-patch hotfix |

---

## Key Dates

| Date | Event |
|---|---|
| 2026-04-20 | Sprint start; baseline validators clean; Foxtrot + Golf dispatched |
| 2026-04-22 (Wed) | Midsprint status report; cut Juliet/Phase F if sections trending red |
| 2026-04-24 (Fri) | Command dry-runs validator chain against all three sections' HEAD |
| 2026-04-25 (Sat) | **Patch ship**: India runs `stamp-build.sh`, final validation, release notes, `git push` |
| 2026-04-26 → 27 | Regression watch; retro; memory update |

---

## Open questions to resolve Day 1

1. Which canonical verb wins the refill-family unification? ("Restock" vs "Refill" vs "Load")  → Golf proposes Monday morning, Command approves same day.
2. Are there any engine-side blockers on DOOR_FACADE conversion for the three named Promenade buildings, or is it purely registry/doorTargets data? → Foxtrot reports Monday EOD.
3. Does the tutorial-world playthrough surface any interactions that are *specced but not implemented* (e.g. hose "roll-up" auto-exit)? → Hotel audits Monday morning, Command decides scope-fit Tuesday.

---

## Relationship to earlier roster

The roadmap-roster sections (Alpha.DoorsAndTrapdoors, Bravo.SpatialContractsAndProxy, Charlie.RaycasterExtraction, Delta.LivingWindowsAndWeather, Echo.HarnessAndPlaytest) persist in memory for the post-patch sprint. They are **paused, not cancelled**. Patch-sprint sections (Foxtrot, Golf, Hotel, India, optional Juliet) are additive per user decision on 2026-04-20 — the roster grows rather than renaming.

After the patch ships, the next sprint's kickoff will evaluate which Alpha–Echo sections resume, which patch-sprint sections wrap, and whether any patch-sprint learnings re-shape the post-patch roadmap.

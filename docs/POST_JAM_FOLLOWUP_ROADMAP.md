# POST_JAM_FOLLOWUP_ROADMAP.md — Consolidated Follow-up for Deferred Items

**Status**: Active planning  
**Date**: 2026-04-14 | **Updated**: 2026-04-17 (stale roadmap triage sweep — 20+ orphaned docs absorbed)  
**Purpose**: Pulls deferred items from old roadmaps (DOC-62, DOC-82, DOC-86, DOC-17, DOC-19, DOC-48, DOC-88, DOC-89, DOC-91, DOC-92, plus legacy E-/Phase-F/G carryovers) into ordered waves aligned with the current arc — **Blockout Refresh → NPC Refresh → Living Shops/Economy → weighted dungeon loot**.

> **2026-04-17 update:** Stale roadmap triage discovered ~20 docs created before April 8 with open work that had no execution slot in any plan. These have now been absorbed into the appropriate waves below. See **Appendix A** for the full triage ledger.

This is *not* a new feature plan. Every item here was already specced somewhere and consciously set aside. The job now is sequencing them so each wave unblocks the next and the April 25 post-jam ship target stays reachable.

---

## 0. How to read this

Each wave has:

- **Arc tie** — which current-arc deliverable this wave serves
- **Items** — with source doc anchor and the blocker (if any) it resolves
- **Gate** — what has to be true before the wave starts
- **Exit** — what has to be true to call the wave done

Waves are ordered by dependency, not by effort. Small items inside a wave can parallelize.

Priority tags: **[CRIT]** blocks the arc, **[HIGH]** high leverage this cycle, **[MED]** worth it but skippable, **[LOW]** nice-to-have / polish.

---

## Wave 1 — Blockout Prereqs (this week)

**Arc tie**: Unblocks `BLOCKOUT_REFRESH_PLAN` so dungeon activity has enough surface to feel weighted when we circle back to loot.

### Items

1. **[CRIT] Expand dungeon tile library — creature tiles 49–54**  
   Source: DOC-84 §12.2 · Blocker: D-2 (DOC-86 §3)  
   Land in `engine/tiles.js` + biome texture atlas entries + `data/enemies.json` verb-sets. Without this the "living infra ↔ dungeon loot" feedback loop has nothing to grip.

2. **[CRIT] Texture keys for live tile IDs 40–48**  
   Source: DOC-86 §3 D-1  
   well_stone, notice_board_wood, anvil_iron, soup_cauldron, cot_canvas, charging_cradle, switchboard_panel. These tiles *render* today but against fallback flat color — the blockout refresh assumes they have textures.

3. **[CRIT] Expand DOC-95 MINIGAME_TILES — Tier 1 order + Tier 2 UI flow**  
   Source: TOC Outstanding #3 · DOC-95  
   Lock Tier 1 implementation order (WELL, ANVIL, SOUP_KITCHEN, BARREL, FUNGAL_PATCH). Flesh out Tier 2 UI flow for SWITCHBOARD + NOTICE_BOARD. Define overflow/failure + juice/particle hooks. Reconcile vocabulary with DOC-84 verb-node list.

4. **[HIGH] Register verb-nodes on Floors 2 & 3**  
   Source: DOC-84 §5.2c/§6.2c · 22 + 16 nodes  
   Unblocks surface-level economy visibility the moment it lands. Requires #1 and #2.

5. **[HIGH] Biome wiring completeness — CHARGING_CRADLE / SWITCHBOARD across all biomes**  
   Source: DOC-86 §3 D-3

6. **[HIGH] Cobweb/Trap Phases 3, 5–7** *(stale sweep — DOC-31b, last updated Apr 4)*  
   Source: DOC-31b COBWEB_TRAP_STRATEGY_ROADMAP · Phases 1–2 done, Phase 4 partial  
   Phase 3 (placement AI for hero-bait corridors), Phase 5 (trap chain reactions), Phase 6 (cobweb decay/mold), Phase 7 (dungeon-grade cobweb variants). These feed directly into blockout readiness scoring — without them depth-3 trap/cobweb tiles have no strategic layer beyond the basics. Phases 5–7 may re-defer if bandwidth is tight; Phase 3 is the priority.

### Gate

- Agent delegation docs are now fresh: `BLOCKOUT_REFRESH_PLAN.docx` cross-refs, `DOC_GRAPH_BLOCKOUT_ARC.md` live, TOC DOC-104 registered. ✅

### Exit

- All Tier 1 verb-node tiles render with correct textures and minigame stubs on Floors 0–3.
- `BLOCKOUT_REFRESH_PLAN` can be executed without a "where is this tile defined?" scavenger hunt.

---

## Wave 2 — Blockout Execution + Raycaster Polish (next ~1–2 weeks)

**Arc tie**: Ships `BLOCKOUT_REFRESH_PLAN` itself. Coupled raycaster items travel with it because they touch the same hotpath.

### Items

1. **[CRIT] Execute BLOCKOUT_REFRESH_PLAN Sections 1–8**  
   Use `DOC_GRAPH_BLOCKOUT_ARC.md` for reading order. Wave 1 must be green.

2. **[HIGH] Trapdoor Tiers 6–8**  
   Source: DOC-89 TRAPDOOR_ARCHITECTURE_ROADMAP  
   Specced, not shipped. Drops in alongside blockout tile work — same subsystem.

3. **[MED] Arch stamp-out (DOOR_ARCHITECTURE Phase 3)**  
   Source: DOC-88 · Unblocked by shipped Phase 2 + 5A/6A/6B  
   Great-arch variants for Lantern Row and Floor 3 gates.

4. **[MED] Living Windows Phase 6 — EmojiMount port**  
   Source: DOC-92  
   Retires `zBypassMode`, unifies window/terminal/table billboard emission. Worth doing *before* Floor 2 blockout seats more emoji-mount content.

5. **[LOW] Living Windows Phase 7 — COUNTER / COFFEE_TABLE surface-mount tiles**  
   Source: DOC-92  
   Cosmetic but high-impact for shop interiors. Only if bandwidth permits.

6. **[LOW] Raycaster Phase 4 — per-column hotpath extraction**  
   Source: DOC-91  
   Deferred pending ≤2% framerate regression gate. Do NOT pull forward — keep deferred until voting closes unless the blockout exposes a perf issue that forces it.

7. **[HIGH] Readiness Bar visual FX + reporting engine** *(stale sweep — DOC-52, last updated never since Apr 2)*  
   Source: DOC-52 READINESS_BAR_ROADMAP  
   Constellation-tracer line-fill physics, overhealing score model, bonfire warp threshold, morning/hero-day reporting engine, revolving mini win-state. The readiness bar is the game's central progress indicator — it renders during dungeon floors but has no visual polish or reporting loop. The blockout refresh will expose this gap the moment playtesters see the bare progress bar. At minimum: constellation-tracer FX + morning report delivery to mailbox.

8. **[MED] Pressure Washing post-PW features** *(stale sweep — DOC-48, created Apr 1, never updated)*  
   Source: DOC-48 PRESSURE_WASHING_ROADMAP §12  
   PW-1 through PW-5 shipped. Remaining: pressure gauge HUD and gyro aim spray targeting. The pressure gauge is a HUD element that renders during hose use — natural fit alongside blockout HUD polish. Gyro aim is LG Magic Remote specific — better placed in Wave 5 Phase G. Split: pressure gauge → here, gyro aim → Wave 5.

### Gate

- Wave 1 exit met.
- DebugPerfMonitor (DOC-96 TEST_HARNESS Phase 0) running during blockout edits to catch regressions.

### Exit

- Blockout refresh shipped.
- Trapdoor and arch variants ship or are explicitly re-deferred with a ticket.

---

## Wave 3 — NPC Refresh Foundations (after Wave 2)

**Arc tie**: `NPC_REFRESH_PLAN` (DOC-103 reserved). Populates per-NPC memories, creature verb-sets, faction relations, Act 2 dispatcher/contact choreography. Everything here feeds the "living shops" payoff.

### Items

1. **[CRIT] Cross-floor verb attenuation (DOC-83 Phase 11)**  
   Source: TOC Outstanding #7  
   Prevents reanimated constructs from stampeding upstairs. Without it ENERGY_CONDUIT → CHARGING_CRADLE pulls dominate and NPC schedules can't compete.

2. **[HIGH] Depth-3 reliability — DOC-85 execution**  
   Source: TOC Outstanding #6 · DOC-85  
   AI disposition contract, proc-gen invariants, acceptance tests. Feed §12.6 creature-tile placement rules into the D3 Phase 4 composer.

3. **[HIGH] CP3 Living Infrastructure Runtime**  
   Source: DOC-86 CP3  
   NPC schedules satisfy verbs using placed infrastructure without dead-node starvation. Depends on Wave 2 exit (verb-nodes actually exist to consume).

4. **[HIGH] CP4 D3 Proc-Gen Reliability Contract**  
   Source: DOC-86 CP4  
   Acceptance tests: enemy disposition, verb reprioritization, reanimation, cobweb/trap/puzzle-layer invariants.

5. **[HIGH] NPC System open phases — vendor barks, building assignment, hero NPCs** *(stale sweep — DOC-9, created Mar 29, never updated)*  
   Source: DOC-9 NPC_SYSTEM_ROADMAP §5–§9  
   DOC-9 is the foundational NPC architecture doc — it defines the 5 NPC types, bark system, patrol bodies, and interaction verbs. Phases A.0 (bark library + patrol) shipped during jam. Open phases: §5 Interactive NPCs & Dialogue Trees (beyond stub), §6 Vendors with Variety Barks, §7 Dispatcher NPCs (stop + instruct — partially done via DispatcherChoreography), §8 Hero NPCs (rare rovers), §9 Building Interior NPC Assignment. This doc should be the spec source for the NPC Refresh arc. Without §6 and §9, the "living shops" payoff in Wave 4 has no NPC variety to display.

6. **[HIGH] Tooltip Bark remaining phases — Morrowind-style log + inline choices** *(stale sweep — DOC-32b, last updated Mar 30)*  
   Source: DOC-32b TOOLTIP_BARK_ROADMAP  
   Phase 1 (StatusBar tooltip footer + KaomojiCapsule) shipped. Remaining: scrollable tooltip history log, clickable NPC reply choices inline, speech gesture library expansion. These feed the NPC refresh — without the log system, NPC barks are ephemeral and players miss dialogue. Priority: scrollable log + inline choices (Phases 2–3).

7. **[MED] Depth-3 Cleaning Loop Balance** *(stale sweep — DOC-59, created Apr 4, never updated)*  
   Source: DOC-59 DEPTH3_CLEANING_LOOP_BALANCE  
   Readiness weight overrides for depth-3 floors, "adventurer detritus" breakable category, indestructible supply crates at depth-3, bag size increase, spatial tempo tuning. Depends on D3 reliability (item #2 above) being stable. First application: Floor 2.2.1. Without this, the first dungeon run feels like the town cleaning loop with harder enemies instead of its own distinct rhythm.

### Gate

- Wave 2 exit met.
- Creature tiles 49–54 populated in at least one dungeon floor.

### Exit

- NPCs demonstrably use Floor 1–2 verb-nodes on schedule without dead-node starvation.
- D3 proc-gen passes its acceptance test suite.

---

## Wave 4 — Living Shops & Economy (after Wave 3)

**Arc tie**: The payoff. Dungeon loot feels weighted because shops, factions, and NPC memories produce real economic gravity.

### Items

1. **[CRIT] CP5 Narrative/Economy Coupling**  
   Source: DOC-86 CP5  
   Act 2 housing downgrade arc (DOC-74 §5.4), faction relationship and NPC memory effects, clinic/morgue/union pipeline tile support (tiles 55–59). This is the user's stated arc goal.

2. **[HIGH] Planned tile constants 55–59** (clinic/morgue/union)  
   Source: DOC-86 §3 D-2  
   Implement in `tiles.js` + biomes. Prereq to CP5.

3. **[HIGH] Deferred buff items (5) — unlock via their blockers**  
   Source: DOC-62 §1  
   Implementation order: Cobweb Sensor → Industrial Solvent → Quick Dodge → Torch Tongs → Readiness Sense. Slot ITM-049–053. Each unblocks on a specific system:
   - Cobweb Sensor → minimap overlay system
   - Industrial Solvent → Clean AoE system
   - Quick Dodge → combat dodge mechanic
   - Torch Tongs → torch interaction refactor
   - Readiness Sense → per-tile readiness UI

4. **[MED] Janitor's Coin (Gone Rogue adaptation)**  
   Source: DOC-62 §2  
   Simple gold-find +10%. Do after buff items land and economy tuning (Phase F below) settles.

5. **[MED] Phase F — economy tuning + tool progression**  
   Source: TOC Outstanding #8  
   Legacy carryover. Fold into the CP5 settling pass — no point tuning before CP5 exists.

6. **[HIGH] Shop Refresh Economy — staggered biome refresh cycles + scarcity** *(stale sweep — DOC-39, created Mar 30, never updated)*  
   Source: DOC-39 SHOP_REFRESH_ECONOMY  
   This is the detailed spec for how shop inventories rotate on faction-staggered cycles (Tide 2-day / Foundry 3-day / Admiralty 4-day), sold-out states as economic pressure, and the "gamble your capital on cards" design. Wave 4 is literally "Living Shops & Economy" but DOC-39 was never referenced — this was an oversight. It is the implementation spec for the shop side of CP5. Phase F economy tuning (item #5 above) should consume DOC-39 §4 (scarcity thresholds) and §5 (tool progression curves) as its inputs.

7. **[HIGH] Suit System remaining 4 passes** *(stale sweep — DOC-16, last updated Apr 7)*  
   Source: DOC-16 SUIT_SYSTEM_ROADMAP  
   8 of 12 passes complete. Card DB expanded to 120 cards. Remaining passes likely cover advanced suit synergies, biome-weighted drop tables, and faction suit affinities — all of which plug into the economy arc. Without finishing the suit system, card drops from dungeon loot can't be properly weighted by biome/faction.

8. **[MED] CrateUI Interaction Overhaul — work order integration** *(stale sweep — DOC-57, created Apr 4, never updated)*  
   Source: DOC-57 CRATEUI_INTERACTION_OVERHAUL  
   Design for work-order-driven crate deposits. Related to DOC-68 (Chest Restock & Work Orders). The Unified Restock Surface (RS-1–RS-5) shipped the pipeline, but chest deposit activation is blocked at RestockBridge. This unblocks the "fill orders for faction reward" loop that makes the economy tangible.

9. **[MED] Deferred buff items (5) — remaining blockers** *(stale sweep — DOC-62, created Apr 4, never updated)*  
   Source: DOC-62 POST_JAM_ITEM_ROADMAP §1 (partial — item #3 above covers the primary 5, but DOC-62 §2 has additional Gone Rogue adaptations that should be evaluated here, not just in Wave 6)  
   Evaluate whether Cobweb Sensor and Readiness Sense specifically should pull forward to Wave 3 since their blocker systems (minimap overlay, per-tile readiness UI) are D3/blockout-adjacent.

### Gate

- Wave 3 exit met.
- NPC memory hooks ship with at least stub persistence.

### Exit

- Shops restock based on NPC activity, not RNG tick.
- Faction rank changes produce observable shop/NPC behavior deltas.
- Act 2 housing arc playable end-to-end.

---

## Wave 5 — Legacy Carryovers & Submission Polish (parallel to Wave 4 where possible)

**Arc tie**: Close out the archived jam-plan tail so nothing drags on past the April 25 fresh-bug-free target.

### Items

1. **[CRIT] E1/E2 — hero boss encounter + hero deck**  
   Source: TOC Outstanding #8 · DOC-75 HERO_FOYER_ENCOUNTER  
   Floor 2.2.1 cinematic. Design exists, implementation pending. Can parallelize with Wave 4 if a second contributor is available.

2. **[HIGH] E5.8/E5.9/E5.10 — chest interaction + playtest gate**  
   Source: TOC Outstanding #8  
   Legacy carryover. Check if blocked by inventory/card rework (DOC-45/46) — if not, land opportunistically.

3. **[HIGH] Phase G — audio, LG validation, submission polish**  
   Source: TOC Outstanding #8  
   Winter 2026 LG Content Store target needs this regardless of jam voting outcome.
   - Audio pass (missing SFX, volume balancing)
   - LG 1920×1080 scaling audit
   - Magic Remote input final pass
   - Submission metadata + manifest

4. **[MED] HUD time widget (P5.2 B4)**  
   Source: DOC-82 §deferred · DOC-17 §v2  
   Small but was explicitly deferred on LG scaling risk. Do this *inside* the Phase G scaling audit so the risk is addressed end-to-end.

5. **[HIGH] GAP_COVERAGE_TO_DEPLOYABILITY Tier 2** *(stale sweep — DOC-1, last updated Apr 4)*  
   Source: DOC-1 GAP_COVERAGE_TO_DEPLOYABILITY  
   T0 complete, T1 4/6, T2 0/6 (completely unstarted). T2 covers economy transactions, quest progression, and save/load hooks — all critical for LG submission. Run alongside Phase G: the gap coverage audit IS the deployability checklist.

6. **[MED] GAP_ANALYSIS refresh** *(stale sweep — DOC-33, last updated Apr 4)*  
   Source: DOC-33 GAP_ANALYSIS  
   Living audit, last pass Apr 4 — 13 days stale. Many entries may now be resolved by Sprint 0 / Track A / P1–P5 / DOC-107 work. Needs a single triage pass to mark resolved items and extract any surviving gaps into this wave or Wave 6. Do NOT treat as a new execution source — use as a validation checklist.

7. **[MED] Spatial Audio Bark — stereo panning + DirRing** *(stale sweep — DOC-50, partial update Apr 7)*  
   Source: DOC-50 SPATIAL_AUDIO_BARK_ROADMAP  
   Phase 4a (footsteps) and Phase 5a (bonfire crackle) wired. Remaining: Phase 0 (SpatialDir resolver), Phase 1 (stereo pan integration), Phase 2 (DirRing visual indicator), Phase 3 (bark direction widget). These are audio/UX polish — fit for Phase G audio pass. Phases 0–1 (stereo panning) are highest value; DirRing (Phase 2) is nice-to-have.

8. **[MED] Input Controller — gamepad + Magic Remote final pass** *(stale sweep — DOC-37, never updated)*  
   Source: DOC-37 INPUT_CONTROLLER_ROADMAP  
   Keyboard/click parity audit exists but gamepad (webOS Magic Remote + standard controllers) implementation gaps remain. Fold into Phase G Magic Remote input final pass — same deliverable, same audit.

9. **[LOW] Player Controller polish backlog** *(stale sweep — DOC-38, last updated Apr 7)*  
   Source: DOC-38 PLAYER_CONTROLLER_ROADMAP  
   P1 complete (dt-aware free-look, screen shake, strafe mult, walk cap, footstep pitch). Referenced in DOC-82 as "remaining polish" but no specific items sequenced. Remaining items are smoothness polish — pull into Wave 5 only if playtest feedback demands it.

10. **[LOW] Gyro aim spray targeting** *(split from DOC-48 — see Wave 2 item #8)*  
    Source: DOC-48 PRESSURE_WASHING_ROADMAP §12  
    LG Magic Remote specific. Fits Phase G LG validation pass.

### Gate

- None — runs parallel to Wave 3/4 where a contributor has bandwidth.

### Exit

- LG webOS submission-ready build.
- Hero encounter playable.
- Legacy chest/playtest gate items closed or explicitly re-deferred with rationale.

---

## Wave 6 — Deferred Polish (post-April-25, when fresh build is stable)

Pure polish. None of this blocks the arc. Pull off the pile as bandwidth allows, gated on fresh-build stability.

### Items

- **[LOW] SKYBOX Phase 2 — celestial bodies (sun/moon disc + arcs)** — DOC-17 §v2 Phase 2
- **[LOW] SKYBOX Phase 3 — star parallax** — DOC-17 §v2 Phase 3
- **[LOW] SKYBOX Phase 4 — moon phase animation** — DOC-17 §v2 Phase 4
- **[LOW] SKYBOX Phase 5 — Floor 3 ocean integration** — DOC-17 §v2 · gated on Floor 3 blockout stable
- **[LOW] DOOR_EFFECTS three-phase visual transition** — DOC-19  
  Depth-specific crossing effects; new module `engine/transition-fx.js` Layer 2.
- **[LOW] Living Windows Phase 8 — Blockout tool authoring flow** — DOC-92
- **[LOW] Living Windows Phase 9 — beveled corners, crumbled-gap, patron NPCs** — DOC-92
- **[LOW] Living Windows Phase 12 — Proxy Zones** — DOC-93 · large ambition, post-voting
- **[LOW] Pressure gauge HUD** — DOC-48 §12
- **[LOW] Gyro aim spray targeting** — DOC-48 §12
- **[LOW] Drag-drop unification (CardFan ↔ MenuFaces, DN-12)** — DOC-82 HUD Phase 3 · 3–4h, high regression risk
- **[LOW] Gone Rogue adaptations** — Burst Broom, Full Auto Mop, Eavesdrop Charm, Heat Sense Visor, Catalog Charm (each needs a blocker system built first; see DOC-62 §2)
- **[LOW] GAME_FLOW nice-to-haves** — enemy sprite particles, NCH drag-to-reorder, click/drag polish, synergy toast, faction rank-up toast — DOC-21 §1
- **[LOW] Floor 3 post-jam content** — Training Yard (3.2), world-map east exit, Dragon-team-up boss variant, corrupted-dragon variant, peaceful-resolution path — Biome Plan v5 lines 275–899
- **[LOW] Save/load system** — DOC-21 post-jam · large
- **[LOW] Controls rebinding (Face 3)** — DOC-21 post-jam
- **[LOW] Equipment slots / skill tree / quest log stubs (Face 1 & 2)** — DOC-82 deferred
- **[LOW] EyesOnly convergence sprints S1–S5 (33h)** — UNIFIED_EXECUTION_ORDER
- **[LOW] Sprite Stack — triple emoji → artist sprites** *(stale sweep — DOC-15, created Mar 29, never updated)* — Full sprite composition system (head/torso/legs + accessories). Entire roadmap unexecuted beyond stubs. Large effort, pure visual polish. Evaluate when artist sprites become available.
- **[LOW] Sprite Stub — emoji-to-artist migration pipeline** *(stale sweep — DOC-42, never updated)* — Code-side implementation plan for replacing emoji with artist sprites. Companion to DOC-40 (commissioning map). Blocked on sprite availability.
- **[LOW] Sprite Library Plan — particle FX & economic juice** *(stale sweep — DOC-41, never updated)* — Procedural canvas + small asset sprites for particle effects and economic feedback. 500KB budget. Low priority until economy loop (Wave 4) is stable enough to juice.
- **[LOW] HUD Roadmap open items** *(stale sweep — DOC-22, never updated)* — Listed "Active" in TOC but no execution phase. The CRT/phosphor theme may be superseded by VISUAL_OVERHAUL.md (DOC-8) pivot to clinical-hazmat aesthetic. Structural layout (ASCII canon, component breakdown) remains authoritative. Evaluate against DOC-8 before executing any visual HUD work.
- **[LOW] UI Roadmap open items** *(stale sweep — DOC-23, never updated)* — Listed "Active" in TOC but no execution phase. UI-wide style guide and responsive layout spec. Fold into Phase G LG scaling audit (Wave 5) for anything blocking, defer visual polish to here.
- **[LOW] Peek System open phases** *(stale sweep — DOC-12, last updated Apr 8)* — Listed "Active" in TOC. Standard peek architecture, variant registry, animation pipeline, juice budget. v1.5 (Apr 8) likely captured most shipped work. Review for remaining animation/juice phases after Wave 4 economy peeks are stable.
- **[LOW] Light & Torch post-jam phases** *(stale sweep — DOC-31a, created Mar 31, never updated)* — Track A (Phases 1–3, torch slot model) complete. Post-jam phases not picked up: advanced torch placement AI, light propagation upgrades, ambient light color shifting. Pure visual polish.
- **[LOW] Game Flow nice-to-haves** *(stale sweep — DOC-21, last updated Apr 2)* — Save/load (large, deferred), controls rebinding (Face 3), enemy sprite particles, NCH drag-to-reorder, synergy toast, faction rank-up toast. Save/load listed separately above.
- **[LOW] Interactive Objects Audit follow-on** *(stale sweep — DOC-54, created Apr 3, never updated)* — IO-1 through IO-7 track complete. Any surviving follow-on items from the audit need a single pass to mark resolved or extract. Do not treat as execution source.
- **[LOW] MULTI_ELEVATION_RENDERING** *(stale sweep — never indexed)* — Exists in docs/ but has no DOC number and no execution reference. Evaluate whether it's been absorbed by N-layer raycaster work (DOC-18) or remains a standalone ambition.
- **[LOW] FATIGUE_SYSTEM_ROADMAP** *(stale sweep — DOC-97)* — EyesOnly fatigue port. Deferred polish for status effect depth.
- **[LOW] BONFIRE_POLISH_STEPS remaining items** *(stale sweep — DOC-30, created Mar 28, last updated Apr 12)* — Bonfire warp threshold tied to readiness bar (DOC-52). Updated recently enough to not be "stale" per se, but warp threshold specifically depends on readiness bar FX (Wave 2 item #7).

---

## 7. What deliberately stays deferred

These were evaluated and kept off the follow-up:

- **Raycaster Phase 4 hotpath extraction (DOC-91)** — keep deferred until voting closes. Risk > reward mid-arc.
- **EyesOnly convergence sprints** — wrong phase for it; revisit as a separate workstream once Wave 4 ships.
- **Save/load system** — out of scope for the arc. Touch only if Phase G LG validation demands state persistence.

---

## 8. Cross-references

- Arc map: `docs/DOC_GRAPH_BLOCKOUT_ARC.md` (DOC-104)
- Full doc index: `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md`
- Upstream plan: `docs/BLOCKOUT_REFRESH_PLAN.docx`
- Legacy sequencing: `docs/LEGACY_ROADMAP_CRITICAL_PATH.md` (DOC-86)
- Post-jam patch plan (P1–P5 complete): `docs/POST_JAM_EXECUTION_ORDER.md` (DOC-82)
- Deferred buff items source: `docs/POST_JAM_ITEM_ROADMAP.md` (DOC-62)
- Code exploration: `code-review-graph` MCP (`semantic_search_nodes`, `get_impact_radius`) before touching engine files
- Stale roadmap triage: **Appendix A below** — all pre-April-8 docs with open work, triaged into waves or deferred

---

## 9. Maintenance

- Update after each wave exits — mark items shipped and prune from the wave.
- When a wave closes, move any surviving items to the next appropriate wave or to Wave 6.
- If a new post-jam item lands in a source roadmap, add it here *and* register it under the correct wave — don't let it live only in its source doc or it'll drift.
- Archive this doc alongside `BLOCKOUT_REFRESH_PLAN` when the Living Shops arc closes.
- **Stale sweep protocol (added 2026-04-17):** When reviewing docs, if any doc created before the current arc start has open work with no wave assignment, triage it into Appendix A and assign it to a wave or mark it deferred/archived with rationale. Don't let docs accumulate in the TOC without execution slots.

---

## Appendix A — Stale Roadmap Triage Audit (2026-04-17)

Every doc created before April 8, 2026 with open work, evaluated for wave placement. This appendix is the intake funnel — any newly discovered stale doc gets triaged here first, then either assigned to a wave above or archived with rationale.

### Legend

- **→ Wave N** = absorbed into that wave above (see the wave for execution details)
- **✅ Complete** = all work done, candidate for archive
- **📦 Archive** = move to `docs/Archive/` to reduce active-doc noise
- **⏸ Deferred** = deliberately kept off execution, with rationale

### Tier 1 — Oldest (Mar 27–31), with open work

| DOC | Document | Created | Last Updated | Disposition |
|-----|----------|---------|-------------|-------------|
| DOC-16 | SUIT_SYSTEM_ROADMAP | Mar 27 | Apr 7 | → **Wave 4 #7** — 4 remaining passes, suit synergies feed economy arc |
| DOC-9 | NPC_SYSTEM_ROADMAP | Mar 29 | Never | → **Wave 3 #5** — spec source for NPC Refresh (§5–§9 open phases) |
| DOC-15 | SPRITE_STACK_ROADMAP | Mar 29 | Never | → **Wave 6** — entire roadmap unexecuted, blocked on artist sprites |
| DOC-32b | TOOLTIP_BARK_ROADMAP | Mar 30 | Mar 30 | → **Wave 3 #6** — scrollable log + inline choices feed NPC refresh |
| DOC-31b | COBWEB_TRAP_STRATEGY_ROADMAP | Mar 30 | Apr 4 | → **Wave 1 #6** — Phases 3/5–7 feed blockout readiness scoring |
| DOC-39 | SHOP_REFRESH_ECONOMY | Mar 30 | Never | → **Wave 4 #6** — THE spec for shop refresh cycles, was missing from Wave 4 |
| DOC-31a | LIGHT_AND_TORCH_ROADMAP | Mar 31 | Never | → **Wave 6** — Track A done, post-jam phases are visual polish |
| DOC-21 | GAME_FLOW_ROADMAP | Apr 2 | Apr 2 | → **Wave 6** — save/load + controls rebinding are large/deferred |

### Tier 2 — Early April (pre-April 8), partially outdated

| DOC | Document | Created | Last Updated | Disposition |
|-----|----------|---------|-------------|-------------|
| DOC-48 | PRESSURE_WASHING_ROADMAP | Apr 1 | Never | → **Wave 2 #8** (pressure gauge) + **Wave 5 #10** (gyro aim) — split by target |
| DOC-52 | READINESS_BAR_ROADMAP | Apr 2 | Never | → **Wave 2 #7** — constellation-tracer FX + reporting are core blockout polish |
| DOC-54 | INTERACTIVE_OBJECTS_AUDIT | Apr 3 | Never | → **Wave 6** — IO track complete, follow-on items need one triage pass |
| DOC-57 | CRATEUI_INTERACTION_OVERHAUL | Apr 4 | Never | → **Wave 4 #8** — work order integration feeds economy loop |
| DOC-62 | POST_JAM_ITEM_ROADMAP | Apr 4 | Never | → **Wave 4 #3/#9** — partially picked up, rest evaluated for pull-forward |
| DOC-59 | DEPTH3_CLEANING_LOOP_BALANCE | Apr 4 | Never | → **Wave 3 #7** — D3-specific tuning, depends on D3 reliability |
| DOC-33 | GAP_ANALYSIS | Mar 30 | Apr 4 | → **Wave 5 #6** — needs refresh pass, many entries likely resolved |
| DOC-1 | GAP_COVERAGE_TO_DEPLOYABILITY | — | Apr 4 | → **Wave 5 #5** — T2 completely unstarted, IS the deployability checklist |

### Tier 3 — Vague/indirect execution references

| DOC | Document | Created | Last Updated | Disposition |
|-----|----------|---------|-------------|-------------|
| DOC-22 | HUD_ROADMAP | — | Never | → **Wave 6** — listed "Active" in TOC but no phases sequenced; may be superseded by DOC-8 visual pivot |
| DOC-23 | UI_ROADMAP | — | Never | → **Wave 6** — same situation as DOC-22; fold blocking items into Phase G |
| DOC-37 | INPUT_CONTROLLER_ROADMAP | — | Never | → **Wave 5 #8** — gamepad/Magic Remote gaps fold into Phase G |
| DOC-38 | PLAYER_CONTROLLER_ROADMAP | — | Apr 7 | → **Wave 5 #9** — P1 complete, remaining polish is low priority |
| DOC-12 | PEEK_SYSTEM_ROADMAP | — | Apr 8 | → **Wave 6** — v1.5 captured most shipped work; review after Wave 4 economy peeks |
| DOC-50 | SPATIAL_AUDIO_BARK_ROADMAP | — | Apr 7 | → **Wave 5 #7** — stereo panning (Phases 0–1) fold into Phase G audio pass |
| DOC-42 | SPRITE_STUB_ROADMAP | — | Never | → **Wave 6** — blocked on artist sprite availability |
| DOC-41 | SPRITE_LIBRARY_PLAN | — | Never | → **Wave 6** — particle FX, low priority until economy loop is stable |

### Completed / Archive candidates

| DOC | Document | Status | Recommendation |
|-----|----------|--------|----------------|
| DOC-45 | INVENTORY_SYSTEM_AUDIT_AND_ROADMAP | ✅ RESOLVED Apr 1 | 📦 Archive — Sprint 0 completed, all issues addressed |
| DOC-32 | UNIFIED_EXECUTION_ORDER | ✅ Superseded by DOC-82 | 📦 Archive — marked superseded in DOC-86, still in active docs/ folder |
| DOC-90 | RECESS_REPAIR_ROADMAP | ✅ Shipped Apr 14 | Already archived — folds into DOC-88 Phase 1.5 |
| DOC-27 | JAM_COMPLIANCE | ✅ Jam submitted | 📦 Archive — jam-era compliance doc, no longer actionable |
| DOC-54 | INTERACTIVE_OBJECTS_AUDIT | IO track complete | ⏸ Keep in docs/ — still useful as reference for tile interaction audit, but don't treat as execution source |
| DOC-69 | RESTOCK_AUDIT | ✅ RS-1–RS-5 complete | ⏸ Keep as reference — documents the 10 restock interaction types |

### Deliberately deferred (not in any wave)

| DOC | Document | Rationale |
|-----|----------|-----------|
| DOC-91 Phase 4 | Raycaster per-column hotpath | Risk > reward mid-arc; revisit post-voting only if blockout exposes perf issue |
| DOC-47 | EYESONLY_3D_ROADMAP | EyesOnly convergence is wrong phase; revisit as separate workstream after Wave 4 |
| DOC-93 | PROXY_ZONE_DESIGN | Large ambition (Phase 12 of Living Windows); post-voting explicitly |
| DOC-28 | ROADMAP.md (legacy) | Archive reference only per DOC-86 §2 |

# POST_JAM_FOLLOWUP_ROADMAP.md — Consolidated Follow-up for Deferred Items

**Status**: Active planning  
**Date**: 2026-04-14  
**Purpose**: Pulls deferred items from old roadmaps (DOC-62, DOC-82, DOC-86, DOC-17, DOC-19, DOC-48, DOC-88, DOC-89, DOC-91, DOC-92, plus legacy E-/Phase-F/G carryovers) into ordered waves aligned with the current arc — **Blockout Refresh → NPC Refresh → Living Shops/Economy → weighted dungeon loot**.

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

---

## 9. Maintenance

- Update after each wave exits — mark items shipped and prune from the wave.
- When a wave closes, move any surviving items to the next appropriate wave or to Wave 6.
- If a new post-jam item lands in a source roadmap, add it here *and* register it under the correct wave — don't let it live only in its source doc or it'll drift.
- Archive this doc alongside `BLOCKOUT_REFRESH_PLAN` when the Living Shops arc closes.

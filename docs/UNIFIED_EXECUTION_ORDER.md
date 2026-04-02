# Unified Execution Order — All Visual Roadmaps

> **Created:** 2026-03-31 | **Updated:** 2026-04-01
> **Covers:** INVENTORY_CARD_MENU_REWORK, EYESONLY_3D_ROADMAP, NLAYER_RAYCASTER_ROADMAP, TEXTURE_ROADMAP, LIGHT_AND_TORCH_ROADMAP, SKYBOX_ROADMAP, PRESSURE_WASHING_ROADMAP
> **Purpose:** Single source of truth for implementation sequencing across overlapping roadmap phases

---

## Sprint 0 — Inventory / Card / Menu Rework (Prerequisite)

> **Source:** INVENTORY_CARD_MENU_REWORK.md (DOC-46) + EYESONLY_3D_ROADMAP.md (DOC-47) Sprint 0
> **Estimate:** ~15h
> **Why first:** Every subsequent track touches cards, inventory, or the menu surface. The current DG architecture has 3–4 competing card storage models, unregistered drag-drop zones, two competing card renderers, and direct state mutations. Building on top of this creates silent composition failures. Sprint 0 replaces the foundation before anything else stacks on it.

```
Step S0.1: CardAuthority — single read/write gateway for all card state       (2h)
  │  Creates: engine/card-authority.js (Layer 1)
  │  Pattern: EyesOnly CardStateAuthority → DG IIFE adaptation
  │  Provides: _state object (hand/backup/bag/stash/equipped/gold),
  │            event emitter (on/off/emit), serialize/deserialize,
  │            death reset with tiered persistence
  │
Step S0.2: CardTransfer — validated zone-to-zone moves with rollback          (2h)
  │  Creates: engine/card-transfer.js (Layer 1)
  │  Depends: S0.1 (reads/writes through CardAuthority)
  │  Pattern: EyesOnly drop zone registry → DG IIFE adaptation
  │  Provides: handToBag, bagToStash, lootToBag, buyCard, sellFromBag,
  │            registerDropZone(id, accepts, onDrop)
  │
Step S0.3: Rewire existing modules to CardAuthority + CardTransfer            (3h)
  │  Modifies: player.js (strip card/item state), card-system.js (registry only),
  │            card-fan.js (subscribe to events), salvage.js (use CardTransfer),
  │            shop.js (use CardTransfer), hud.js (subscribe to events)
  │  Depends: S0.1, S0.2
  │
Step S0.4: MenuInventory — new pause menu surface                            (5h)
  │  Creates: engine/menu-inventory.js (Layer 2)
  │  Depends: S0.1, S0.2, S0.3 (all modules wired through authority)
  │  Provides: grid-navigable bag/stash/equipped/hand display,
  │            CardDraw as ONLY renderer, drag-drop via registered zones
  │
Step S0.5: Delete dead code + regression test                                 (3h)
     Deletes: card-renderer.js (DOM renderer), orphaned drag-drop stubs
     Depends: S0.3, S0.4 (all consumers rewired)
     Verify: shop round-trip, combat card play, loot pickup, death reset,
             bonfire stash, inventory navigation, drag-drop in all surfaces
```

**Sprint 0 blocks everything.** Track A and Track B cannot begin until S0.5 passes regression. The torch interaction system (A7) writes to inventory. The skybox HUD widget (B4) reads card state. The convergence sprints (EYESONLY_3D_ROADMAP S1–S5) all assume CardAuthority exists.

---

## Key Insight: Merged Implementations

Two pairs of roadmap phases are **the same system described from different angles**:

| Roadmap A | Roadmap B | Shared System |
|-----------|-----------|---------------|
| TEXTURE Layer 3 (Sprite Light Emitters) | LIGHT_AND_TORCH Phase 1 (Dynamic Light Sources) | `Lighting.addLightSource()` API, point light calc, flicker functions |
| TEXTURE Layer 2 (Wall-Mounted Sprites) | LIGHT_AND_TORCH Phase 2 (Torch Tile + Wall Sprites) | `wallDecor[y][x]` data model, raycaster face-hit rendering |

These merge into single implementation steps below. No duplicate work.

---

## Execution Tracks

Two independent tracks can run in parallel. Track A (raycaster/texture/lighting)
and Track B (skybox/day-night) don't share code paths until Floor 3 blockout.

### Track A — Raycaster, Textures, Lighting (~10h jam scope)

```
Step A1: NLAYER Phase 1 — N-layer hit collector + back-to-front render     (45min)
  │  Modifies: raycaster.js DDA loop
  │  Why first: all subsequent raycaster changes build on this
  │
Step A2: NLAYER Phase 3 — SHRUB tile + _genShrub() texture                 (1h)
  │  Modifies: tiles.js, texture-atlas.js, spatial-contract.js, raycaster.js
  │  Depends: A1 (SHRUB hit detection in N-layer DDA)
  │
Step A3: NLAYER Phase 5 + 6 — Performance guards + Floor 0 test            (1.5h)
  │  Modifies: raycaster.js, floor-manager.js
  │  Depends: A1, A2 (need shrubs in Floor 0 to test)
  │  Verify: sky → building → floor → shrub layering correct
  │
Step A4: TEXTURE Layer 2 — Wall decor data model + face-hit rendering      (2h)
  │  Modifies: raycaster.js (within N-layer loop), floor-manager.js, grid-gen.js
  │  Depends: A1 (wall decor renders per-layer in back-to-front loop)
  │  Creates: wallDecor[y][x] structure, spriteId/anchorU/anchorV/scale/emitter
  │
Step A5: LIGHT_AND_TORCH Phase 1 ≡ TEXTURE Layer 3 — Dynamic lights       (1.5h)
  │  Modifies: lighting.js, raycaster.js (glow overlay pass)
  │  Depends: none (Lighting.js is independent), but A4 defines emitter flag
  │  Creates: addLightSource(), clearLightSources(), flicker calc, glow pass
  │  Unblocks: TEXTURE "Future — Campfire/Bonfire" section
  │
Step A6: LIGHT_AND_TORCH Phase 2 ≡ TEXTURE Layer 2 consumer — Torch tiles (2h)
  │  Modifies: tiles.js (TORCH_LIT=30, TORCH_UNLIT=31), floor-manager.js,
  │            grid-gen.js (hero damage patterns), raycaster.js (torch as wall decor)
  │  Depends: A4 (wall decor model), A5 (light source registration)
  │  Creates: torch wall sprites via wallDecor, auto-registration as light sources
  │
Step A7: LIGHT_AND_TORCH Phase 3 — Torch slot model + fuel + reset loop    (2.5h)
     Modifies: interact-prompt.js, loot-tables.js, salvage.js, session-stats.js
     Depends: A6 (torch tiles exist to interact with)
     Creates: 3-slot torch model (flame/fuel_hydrated/fuel_dry/empty),
              TorchPeek interaction surface, biome-matched fuel items,
              water bottle extinguish (careful method), floor readiness scoring
     Unblocks: Track PW step PW-3 (torch-hit detection needs slot model)
```

**Total Track A jam scope: ~11.25h**

### Track B — Skybox Day/Night Cycle (~6h jam scope)

```
Step B1: SKYBOX Phase 1 — Sky color cycling                                (1.5h)
  │  Modifies: skybox.js, day-cycle.js
  │  Depends: DayCycle.getNextPhase() + getPhaseProgress() (already shipped)
  │  Creates: per-phase color tables per preset, _lerpColor interpolation
  │
Step B2: SKYBOX Phase 2 — Celestial bodies (sun + moon)                    (2h)
  │  Modifies: skybox.js
  │  Depends: B1 (phase-aware rendering)
  │  Creates: sun/moon disc rendering, horizon glow, sinusoidal arc
  │
Step B3: SKYBOX Phase 3 — Advanced star parallax                           (1.5h)
  │  Modifies: skybox.js
  │  Depends: B1 (star alpha by phase)
  │  Creates: 3-layer star field, star colors, shooting stars
  │
Step B4: SKYBOX Phase 4 — HUD time widget                                  (1h)
     Modifies: hud.js
     Depends: B1 (DayCycle phase reads)
     Creates: phase icon + hour + day counter in HUD
```

**Total Track B jam scope: ~6h**

### Track PW — Pressure Washing System (~12.5h jam scope)

> **Source:** PRESSURE_WASHING_ROADMAP (DOC-48)
> **Starts after:** Sprint 0 complete
> **Cross-dependency:** PW-3 requires Track A step A7 (torch slot model)

Track PW can run **in parallel** with Tracks A and B for its first two phases.
PW-3 has a hard gate on A7 (torch interaction) for the torch-hit wiring.

```
Step PW-1: GrimeGrid + Raycaster integration                               (3h)
  │  Creates: engine/grime-grid.js (Layer 1)
  │  Modifies: raycaster.js (wall column grime tint, floor pixel grime tint),
  │            hero-system.js (carnage allocates grime grids)
  │  Depends: Sprint 0 complete (avoid merge churn with raycaster)
  │  Note: Modifies raycaster.js — sequence AFTER Track A's A1-A6 if both
  │        are being worked. If Track A hasn't started, PW-1 can go first
  │        (grime tint is additive, not structural like N-layer DDA).
  │
Step PW-2: HoseState + Cleaning Truck spawn                                (2.5h)
  │  Creates: engine/hose-state.js (Layer 1), engine/cleaning-truck.js (Layer 3),
  │           engine/hose-peek.js (Layer 3)
  │  Modifies: tiles.js (TRUCK, TRUCK_HOSE), interact-prompt.js,
  │            movement.js (onMoveFinish → recordStep), hero-system.js,
  │            game.js (wiring)
  │  Depends: PW-1 (grime exists), HeroSystem (hero day detection)
  │
Step PW-3: Spray interaction + Brush system + Torch hit                    (3h)
  │  Modifies: cleaning-system.js (hose-gated sub-tile mode),
  │            game.js (spray input binding)
  │  Depends: PW-1, PW-2, *** Track A step A7 *** (torch slot model —
  │           LIGHT_AND_TORCH Phase 3a must ship before torch-hit wiring)
  │  Creates: brush kernels (base, fan, cyclone), pressure multiplier,
  │           torch extinguish on spray (flame→empty, fuel_dry→empty)
  │
Step PW-4: Hose Reel (backward walk exit) + MinimapNav distance gate       (2h)
  │  Creates: engine/hose-reel.js (Layer 3), engine/hose-overlay.js (Layer 2)
  │  Modifies: minimap-nav.js (min distance gate: 5+itemN),
  │            game.js (reel input binding, floor transition resume)
  │  Depends: PW-2 (hose path exists), PW-3 (spray proven)
  │  Note: Player walks backward (facing opposite of travel) during reel.
  │        Reel bypasses minimap click distance gate.
  │
Step PW-5: Nozzle items + Readiness integration + Regression               (2h)
     Creates: nozzle_fan + nozzle_cyclone in CardSystem registry + loot tables
     Modifies: cleaning-system.js (fractional GrimeGrid cleanliness),
               card-system.js (nozzle registration), loot-tables.js
     Depends: PW-1–PW-4, Sprint 0 (CardAuthority for equip slot)
     Verify: rag/mop still works, hero day truck spawn/despawn,
             reel across floors, kink stacking, energy forced exit,
             torch extinguish careful vs hose (readiness diff)
```

**Total Track PW jam scope: ~12.5h**

**Raycaster.js coordination note:** PW-1 adds grime tint to the wall column loop and floor pixel loop. This is an additive change (new `if (grimeGrid)` blocks) that doesn't restructure the DDA or rendering pipeline. If Track A is being worked simultaneously, PW-1 should sequence after A1 (N-layer DDA) to avoid conflicting structural changes, but before or after A4-A6 is fine since grime tint and wall decor are independent code paths.

### Convergence — Floor 3 Blockout (post-jam or stretch)

```
Step C1: Frontier biome textures in TextureAtlas                           (1h)
  │  Modifies: texture-atlas.js (new generators), spatial-contract.js
  │  Depends: Track A textures + Track B sky cycling both complete
  │  Creates: wall_weathered, floor_planks_wet, door_heavy
  │
Step C2: SKYBOX Phase 5 — Floor 3 ocean sky (frontier preset)              (1.5h)
  │  Modifies: skybox.js, spatial-contract.js, floor-manager.js
  │  Depends: B1 (day/night colors), C1 (frontier biome textures)
  │  Creates: frontier sky preset, water horizon band, ocean connectivity
  │
Step C3: Floor 3 map blockout                                              (2-3h)
     Modifies: floor-manager.js (Floor 3 grid data)
     Depends: A1-A3 (N-layer for see-over harbor walls), A5-A6 (torch system),
              C1-C2 (frontier sky + textures)
     Creates: "3" Frontier Gate, "3.1" Armory, "3.1.1"+ Deep Vaults
```

---

## Post-Jam Phases (Not Sequenced)

These are additive polish with no blocking dependencies on each other:

| Phase | Source Roadmap | Est. |
|-------|---------------|------|
| LIGHT_AND_TORCH Phase 4 (visual polish: flame anim, color temp, shadows) | LIGHT_AND_TORCH | 1h |
| LIGHT_AND_TORCH Phase 5 (additional sprite types: lantern, hearth, crystal, dragon ember) | LIGHT_AND_TORCH | 1h |
| SKYBOX Phase 6 (weather: rain, fog, storm, clear night) | SKYBOX | 2h |
| SKYBOX Phase 7 (polish: god rays, water reflection, aurora, PostProcess wiring) | SKYBOX | 1h |
| NLAYER Phase 7 (expanded exterior maps 40×32+) | NLAYER | TBD |
| TEXTURE hand-pixeled PNGs (replace procedural textures) | TEXTURE | TBD |
| TEXTURE per-biome decor sprite sheets | TEXTURE | TBD |

---

## Dependency Graph (Visual)

```
              ┌────────────────────────────────────────────────┐
              │     SPRINT 0 — Inventory/Card/Menu Rework      │
              │                                                │
              │  S0.1 CardAuthority ──→ S0.2 CardTransfer      │
              │            │                    │               │
              │            └────────┬───────────┘               │
              │                     │                           │
              │              S0.3 Rewire Modules                │
              │                     │                           │
              │              S0.4 MenuInventory                 │
              │                     │                           │
              │              S0.5 Delete + Regress              │
              └─────────────────────┬──────────────────────────┘
                   ┌────────────────┼────────────────┐
                   ▼                ▼                ▼
  ┌──────────────────────────────┐ ┌──────────────┐ ┌──────────────────────┐
  │      TRACK A (Raycaster)     │ │ TRACK B (Sky)│ │  TRACK PW (Hose)     │
  │                              │ │              │ │                      │
  │ A1 N-Layer DDA               │ │ B1 Sky Cycle │ │ PW-1 GrimeGrid      │
  │  │                           │ │  │           │ │   │                  │
  │  ├→ A2 SHRUB → A3 Perf      │ │  ├→ B2 Sun   │ │ PW-2 HoseState      │
  │  │                           │ │  │           │ │   │                  │
  │  └→ A4 Wall Decor            │ │  ├→ B3 Stars │ │ PW-3 Spray+Torch ◄──┤
  │       │                      │ │  │           │ │   │    (needs A7)    │
  │  A5 Lights ──→ A6 Torches   │ │  └→ B4 Time  │ │ PW-4 Reel+Gate      │
  │                  │           │ │              │ │   │                  │
  │             A7 Torch Loop ───┼─┼──────────────┼─┤ PW-5 Nozzles        │
  │                              │ │              │ │                      │
  └──────────────┬───────────────┘ └──────┬───────┘ └──────────┬───────────┘
                 │                        │                    │
          ┌──────┴────────────────────────┴────────────────────┘
          │
          ▼
  ┌────────────────────────────────┐
  │     CONVERGENCE (Floor 3)      │
  │                                │
  │  C1 Frontier Textures          │
  │       │                        │
  │  C2 Ocean Sky Preset           │
  │       │                        │
  │  C3 Floor 3 Blockout           │
  └────────────────────────────────┘
                  │
  ┌───────────────┴───────────────┐
  │  EYESONLY CONVERGENCE (S1–S5)  │
  │                               │
  │  S1 Extract EyesOnly Systems  │
  │       │                       │
  │  S2 Combat Rewire             │
  │       │                       │
  │  S3 Engine Polish             │
  │       │                       │
  │  S4 Cleaning Loop Wire        │
  │       │                       │
  │  S5 Narrative + Ship          │
  └───────────────────────────────┘
```

**Key cross-track dependency:** Track PW step PW-3 (spray + torch hit) cannot complete until Track A step A7 (torch slot model + interaction loop) ships. PW-1 and PW-2 can run freely in parallel with Track A. If Track A is ahead, PW-3 picks up A7's torch slots immediately. If Track PW is ahead, PW-3 ships grime spray first and torch-hit wiring waits for A7 as a small follow-up patch.

---

## Raycaster.js Change Coordination

Multiple roadmap phases modify `raycaster.js`. This is the most sensitive
file — changes must be sequenced carefully to avoid merge conflicts:

| Order | Phase | Change Type |
|-------|-------|-------------|
| 1st | NLAYER Phase 1 | DDA loop → multi-hit collector, back-to-front render |
| 2nd | NLAYER Phase 3e | Add SHRUB to hit detection tile check |
| 3rd | TEXTURE Layer 2 / A4 | Wall decor face-hit sprite overlay per-layer |
| 4th | LIGHT_AND_TORCH Phase 1 / A5 | Glow overlay pass after main wall loop |
| 5th | LIGHT_AND_TORCH Phase 2b / A6 | Torch sprites as wall decor items |
| 6th | PRESSURE_WASHING PW-1 | Grime tint in wall column + floor pixel loops (additive) |

Each step builds on the previous raycaster state. No parallel raycaster edits.
PW-1 is additive (new `if (grimeGrid)` blocks) so it's less sensitive than
structural changes, but should still sequence after A1 to avoid conflicts.

---

## Files Modified Per Step (Quick Reference)

| Step | Files |
|------|-------|
| A1 | raycaster.js |
| A2 | tiles.js, texture-atlas.js, spatial-contract.js, raycaster.js, floor-manager.js |
| A3 | raycaster.js, floor-manager.js |
| A4 | raycaster.js, floor-manager.js, grid-gen.js |
| A5 | lighting.js, raycaster.js |
| A6 | tiles.js, floor-manager.js, grid-gen.js, raycaster.js |
| A7 | interact-prompt.js, loot-tables.js, salvage.js, session-stats.js |
| B1 | skybox.js, day-cycle.js |
| B2 | skybox.js |
| B3 | skybox.js |
| B4 | hud.js |
| C1 | texture-atlas.js, spatial-contract.js |
| C2 | skybox.js, spatial-contract.js, floor-manager.js |
| C3 | floor-manager.js |
| PW-1 | grime-grid.js (new), raycaster.js, hero-system.js |
| PW-2 | hose-state.js (new), cleaning-truck.js (new), hose-peek.js (new), tiles.js, interact-prompt.js, movement.js, hero-system.js, game.js |
| PW-3 | cleaning-system.js, game.js |
| PW-4 | hose-reel.js (new), hose-overlay.js (new), minimap-nav.js, game.js |
| PW-5 | card-system.js, loot-tables.js, cleaning-system.js |

---

## EyesOnly Convergence Sprints (Post-Track A/B)

> **Source:** EYESONLY_3D_ROADMAP.md (DOC-47)
> **Prerequisite:** Sprint 0 complete, Track A + Track B substantially complete
> **Total estimate:** ~33h (S1–S5)

These sprints extract proven game systems from EyesOnly and wire them into DG's engine. Only ONE DG module gets replaced (lighting.js → EyesOnly LightingSystem). Everything else is additive.

| Sprint | Focus | Est. | Key Files |
|--------|-------|------|-----------|
| S1 | Extract EyesOnly systems (LightingSystem, TagSynergyEngine, EnemyIntentSystem, StatusEffects, card quality) | 7h | lighting.js (replace), synergy-engine.js, enemy-ai.js, status-effect.js, card-system.js |
| S2 | Combat rewire (intent→telegraph→resolve pipeline, synergy combos, status procs) | 7h | combat-engine.js, combat-bridge.js, card-fan.js, hud.js |
| S3 | Engine polish (loot scatter, save/load, audio stems, procedural generation) | 10h | loot-tables.js, world-items.js, audio-system.js, grid-gen.js |
| S4 | Cleaning loop wire (tools use EyesOnly item quality, torch system uses LightingSystem) | 5h | cleaning-system.js, interact-prompt.js, crate-system.js |
| S5 | Narrative + ship (faction dialogue, conspiracy evidence, Act 1 choice, deploy) | 4h | dialog-box.js, floor-manager.js, game.js |

**S1 depends on:** S0.5 (CardAuthority exists for card quality tiers)
**S2 depends on:** S1 (synergy + intent systems extracted)
**S3 depends on:** S1 (LightingSystem for torch/glow integration)
**S4 depends on:** S1, S3 (tool quality + loot scatter)
**S5 depends on:** S4 (cleaning loop complete for Act 1 stakes)

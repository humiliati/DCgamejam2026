# Unified Execution Order — All Visual Roadmaps

> **Created:** 2026-03-31 | **Updated:** 2026-04-03 (Track IO added — interactive objects audit)
> **Covers:** INVENTORY_CARD_MENU_REWORK, EYESONLY_3D_ROADMAP, NLAYER_RAYCASTER_ROADMAP, TEXTURE_ROADMAP, LIGHT_AND_TORCH_ROADMAP, SKYBOX_ROADMAP, PRESSURE_WASHING_ROADMAP, INTERACTIVE_OBJECTS_AUDIT
> **Purpose:** Single source of truth for implementation sequencing across overlapping roadmap phases

---

## Sprint 0 — Inventory / Card / Menu Rework (Prerequisite)

> **Source:** INVENTORY_CARD_MENU_REWORK.md (DOC-46) + EYESONLY_3D_ROADMAP.md (DOC-47) Sprint 0
> **Estimate:** ~15h
> **Why first:** Every subsequent track touches cards, inventory, or the menu surface. The current DG architecture has 3–4 competing card storage models, unregistered drag-drop zones, two competing card renderers, and direct state mutations. Building on top of this creates silent composition failures. Sprint 0 replaces the foundation before anything else stacks on it.

```
Step S0.1: CardAuthority — single read/write gateway for all card state       ✅ DONE
  │  Creates: engine/card-authority.js (Layer 1)
  │  Pattern: EyesOnly CardStateAuthority → DG IIFE adaptation
  │  Provides: _state object (hand/backup/bag/stash/equipped/gold),
  │            event emitter (on/off/emit), serialize/deserialize,
  │            death reset with tiered persistence
  │
Step S0.2: CardTransfer — validated zone-to-zone moves with rollback          ✅ DONE
  │  Creates: engine/card-transfer.js (Layer 1)
  │  Depends: S0.1 (reads/writes through CardAuthority)
  │  Pattern: EyesOnly drop zone registry → DG IIFE adaptation
  │  Provides: handToBag, bagToStash, lootToBag, buyCard, sellFromBag,
  │            registerDropZone(id, accepts, onDrop)
  │  Result: 840 lines, 95/95 functional tests
  │
Step S0.3: Rewire existing modules to CardAuthority + CardTransfer            ✅ DONE
  │  Modifies: player.js (strip card/item state), card-system.js (registry only),
  │            card-fan.js (subscribe to events), salvage.js (use CardTransfer),
  │            shop.js (use CardTransfer), hud.js (subscribe to events)
  │  Depends: S0.1, S0.2
  │  Result: 6 spec'd + 7 discovered callers rewired with proxy stubs,
  │          114/114 tests passed (95 CardTransfer + 19 proxy integration)
  │
Step S0.4: MenuInventory — absorbed into menu-faces.js                        ✅ DONE
  │  Decision: Separate menu-inventory.js not needed. menu-faces.js already
  │  owns the 4-face rotating box. S-factor scaling overhaul applied to all
  │  faces (minimap, journal, inventory, settings). Drag zone registration,
  │  hit zone interactivity, and stub sections for planned features all
  │  landed in menu-faces.js during the menu legibility pass.
  │  Depends: S0.1, S0.2, S0.3
  │
Step S0.5: Dead code cleanup + proxy migration                                ✅ DONE
     Migrated: 16 files from CardSystem/Player proxy calls → CardAuthority
       game.js (12 sites), menu-faces.js (~70 sites), status-bar.js (5 sites),
       hero-system.js, nch-widget.js, vendor-dialog.js, combat-bridge.js,
       quick-bar.js, peek-slots.js, floor-transition.js, mailbox-peek.js,
       dialog-box.js, debrief-feed.js
     Stripped: card-system.js → pure registry (init, getById, getByPool,
       getBiomeDrops, getAllRegistry). All 18 proxy stubs removed.
     Stripped: player.js → position/stats/debuffs/flags only. All 16
       inventory proxy exports removed. Kept useItem/hasItem/consumeItem
       as real game logic that reads CardAuthority.
     Cleaned: CardAuthority init() absorb blocks removed (dead after strip)
     Fixed: _handToBackup bug (card removed from hand but not added to backup)
     Remaining: card-renderer.js NOT .bak'd — still read for RES_COLORS,
       SUIT_DATA, createGhostFromData by card-draw.js, card-fan.js,
       menu-faces.js. Rewire to CardAuthority constants is follow-on cleanup.
     Verify: node --check passed on all 16 modified files
```

**Sprint 0 is COMPLETE.** Track A and Track B are now unblocked. CardAuthority is the single source of truth for all inventory/card state. CardTransfer handles all validated zone-to-zone moves. No module directly mutates inventory state outside these two gateways.

**Follow-on cleanup (not blocking):**
- Rewire CardRenderer.RES_COLORS/SUIT_DATA consumers to read from CardAuthority (card-draw.js, card-fan.js, menu-faces.js), then .bak card-renderer.js
- Two drag systems (canvas hit-test vs pointer) still don't cross-communicate in menu-faces.js

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
Step A1: NLAYER Phase 1 — N-layer hit collector + back-to-front render     ✅ DONE
  │  Modifies: raycaster.js DDA loop
  │  Result: _layerBuf[6], _MAX_LAYERS=6, _MAX_BG_STEPS=24, tallest-layer
  │  tracking, >=3.0 height break, back-to-front rendering, _renderBackLayer
  │
Step A2: NLAYER Phase 3 — SHRUB tile + _genShrub() texture                 ✅ DONE
  │  Modifies: tiles.js, texture-atlas.js, spatial-contract.js, raycaster.js
  │  Result: TILES.SHRUB=22, _genShrub() procedural texture, tileWallHeights
  │  0.5, grass floor override in 3 biome configs
  │
Step A3: NLAYER Phase 5 + 6 — Performance guards + Floor 0 test            ✅ DONE
  │  Modifies: raycaster.js, floor-manager.js
  │  Result: 40×30 Floor 0 with shrub hedgerows, tree borders, pillar arcades,
  │  bonfire nooks. Fog culling >0.98, step limit, height break all in place.
  │
Step A4: TEXTURE Layer 2 — Wall decor data model + face-hit rendering      ✅ DONE
  │  Modifies: raycaster.js, texture-atlas.js, grid-gen.js, floor-manager.js
  │  Depends: A1 (wall decor renders per-layer in back-to-front loop)
  │  Creates: wallDecor[y][x] = { n:[], s:[], e:[], w:[] } per-face sprite data
  │  Sprites: decor_torch (bracket+flame), decor_grate (iron bars),
  │    decor_banner_red/blue (hanging pennants). 32×32 with alpha transparency.
  │  Rendering: imageSmoothingEnabled=false for pixel-perfect scaling.
  │  Raycaster: _hitFace() face detection, _renderWallDecor() per-column overlay
  │    in both foreground and _renderBackLayer paths (before fog/shade overlays).
  │  Auto-placement: GridGen._generateWallDecor() for proc-gen floors,
  │    FloorManager._buildWallDecorFromGrid() for hand-authored floors.
  │    Torches at room entrances + ~12% of corridor walls. Grates in dungeons.
  │
Step A4.5: Cavity rendering + bonfire rework + floor tiles + fence       ✅ DONE
  │  Source: LIGHT_AND_TORCH Phase 2.5, BLOCKOUT_ALIGNMENT
  │  Modifies: raycaster.js, texture-atlas.js, tiles.js, spatial-contract.js,
  │    floor-manager.js, bonfire-sprites.js, game.js
  │  Depends: A4 (wall decor system), A5 (cavity glow uses light source API)
  │  Result: tiles.js adds ROAD=32, PATH=33, GRASS=34, FENCE=35 with
  │    isWalkable (ROAD/PATH/GRASS) and isOpaque (FENCE) updates.
  │    texture-atlas.js adds 3 procedural textures: fence_wood (dark-stained
  │    planks + posts), floor_boardwalk (weathered pier planks + gaps),
  │    bonfire_ring (riverrock masonry + soot + inner fire glow).
  │    spatial-contract.js: all 3 contracts get BONFIRE 0.3× wall height +
  │    bonfire_ring texture. Exterior adds FENCE 0.4×, SHRUB 0.5×,
  │    tileFloorTextures map (ROAD→cobble, PATH→dirt, GRASS→grass,
  │    TREE/SHRUB→grass, FENCE→boardwalk).
  │    raycaster.js: cavity glow system — per-pixel radial-falloff rendering
  │    behind wall decor items flagged cavityGlow:true. Quadratic falloff
  │    (1-r²) from glow center. Also upgraded sprite glow from flat arc to
  │    createRadialGradient multi-stop with _parseGlowRGB() hex/rgba helper.
  │    floor-manager.js: BONFIRE/HEARTH tiles get fire cavity decor
  │    (decor_torch, cavityGlow warm amber). TERMINAL decor gets cavityGlow
  │    sickly green (30,90,35). bonfire-sprites.js stripped to tent-only
  │    (fire/shrub removed — fire is cavity glow, stone ring replaces shrubs).
  │    game.js: bonfire sprite glow nulled (moved to cavity system).
  │  Note: Chainlink fence + door archway depth textures are POST-JAM.
  │    Ocean-depth skybox preset deferred to B1 (skybox presets step).
  │
Step A5: LIGHT_AND_TORCH Phase 1 ≡ TEXTURE Layer 3 — Dynamic lights       ✅ DONE
  │  Modifies: lighting.js, raycaster.js, floor-manager.js, game.js
  │  Result: lighting.js rewritten with _lightSources registry, addLightSource/
  │    removeLightSource/clearLightSources API. Flicker types: 'torch' (±15%
  │    at ~3Hz), 'bonfire' (±10% at ~1Hz + shimmer), 'steady', 'none'.
  │    _warmMap Float32Array channel for fire warmth (0=white, 1=amber).
  │    Raycaster warm-tinted brightness overlays: foreground + back-layer wall
  │    columns shift from cold black toward amber near fire sources (rgba tint
  │    scaled by warmMap). _applyFogAndBrightness extended with warmth param.
  │    Floor-manager _registerLightSources() scans for BONFIRE (r5, i0.9),
  │    HEARTH (r3, i0.7), FIRE (r3, i0.6) tiles on floor setup.
  │    game.js passes frame timestamp (now) to Lighting.calculate() for flicker.
  │  Unblocks: TEXTURE "Future — Campfire/Bonfire" section, A4.5 cavity glow,
  │    A6 torch tile light registration.
  │
Step A6: LIGHT_AND_TORCH Phase 2 ≡ TEXTURE Layer 2 consumer — Torch tiles (2h)  ✅ DONE
  │  Modifies: tiles.js (TORCH_LIT=30, TORCH_UNLIT=31), floor-manager.js,
  │            grid-gen.js (corridor + flanking torch placement), spatial-contract.js,
  │            texture-atlas.js (torch_bracket_lit/unlit procedural textures)
  │  Depends: A4 (wall decor model), A5 (light source registration)
  │  Creates: torch wall sprites via wallDecor, auto-registration as light sources
  │  Result: TORCH_LIT/TORCH_UNLIT tile constants + isTorch() helper. Procedural
  │    torch bracket textures (lit=flame+embers, unlit=charred stub). All 3 spatial
  │    contracts wired (30→torch_bracket_lit, 31→torch_bracket_unlit). grid-gen
  │    converts WALL→TORCH_LIT for corridor torches (70%) and room-entrance flanking.
  │    floor-manager: TORCH_LIT gets cavity glow decor (warm amber 255/140/40, α=0.3)
  │    + light source (radius 4, intensity 0.8, warm, torch flicker). TORCH_UNLIT gets
  │    dim bracket decor (no glow, no light). Building entrance glow: exterior DOORs
  │    register as steady warm light (radius 3, intensity 0.6) per roadmap §2e.
  │  Files modified: tiles.js, texture-atlas.js, spatial-contract.js, grid-gen.js,
  │    floor-manager.js
  │
Step A7: LIGHT_AND_TORCH Phase 3 — Torch slot model + fuel + reset loop    (2.5h)  ✅ DONE
     Modifies: interact-prompt.js, loot-tables.js, session-stats.js, game.js,
               floor-manager.js, readiness-calc.js, index.html
     Creates: torch-state.js (Layer 1), torch-peek.js (Layer 3)
     Depends: A6 (torch tiles exist to interact with)
     Result: 3-slot torch model (flame/fuel_hydrated/fuel_dry/empty) in TorchState.
       Per-floor torch registry with biome→idealFuel mapping. Hero damage patterns
       (depth ≥ 3): 40% lit / 60% unlit, corpse-adjacent always unlit, stair-adjacent
       always lit. TorchPeek BoxAnim peek with 3 slot indicators (🔥💧🪵○). Number-key
       slot interaction: water→flame=extinguish, water→dry=hydrate, fuel→empty=fill,
       junk→empty=fill(0.15). ReadinessCalc rebalanced: crate 30%, corpse 15%, clean 25%,
       torch 20%, misc 10%. Torch fuel items in loot-tables.json (per-biome pools: coral,
       drift, deep, generic, water). LootTables.rollTorchFuel(biome) API. InteractPrompt
       wired for TORCH_LIT (extinguish/refuel) and TORCH_UNLIT (refuel). SessionStats
       tracks torchesExtinguished + torchSlotsFilled. Live wall decor + light source
       updates on extinguish (cavity glow removed, Lighting.removeLightSource called).
     Unblocks: Track PW step PW-3 (torch-hit detection needs slot model)
     Files modified: torch-state.js (new), torch-peek.js (new), interact-prompt.js,
       loot-tables.js, loot-tables.json, session-stats.js, game.js, floor-manager.js,
       readiness-calc.js, index.html
```

**Total Track A jam scope: ~11.75h**

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
Step B4: SKYBOX Phase 4 — HUD time widget                                 (1h)
     Modifies: hud.js
     Depends: B1 (DayCycle phase reads)
     Use animation like found in docs/CSS_TO_USE.md
     Creates: phase icon + hour + day counter in HUD (remove other clock in debrief feed)
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
Step PW-4: Hose Reel (retrace-path auto-exit) + MinimapNav distance gate   (2h)
  │  Creates: engine/hose-reel.js (Layer 3), engine/hose-overlay.js (Layer 2)
  │  Modifies: minimap-nav.js (min distance gate: 5+itemN),
  │            game.js (reel input binding, floor transition resume)
  │  Depends: PW-2 (hose path exists), PW-3 (spray proven)
  │  Note: Reel retraces the recorded hose path with normal forward pathing.
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
| Floor tile transition blending (pre-computed Grey-Scott edge textures) | BLOCKOUT_ALIGNMENT | 4-6h |
| Clover meadow + bee particles (5-grass cluster detection, world-anchored particles) | BLOCKOUT_ALIGNMENT | 2-3h |
| Alpha-transparent wall textures (per-column alpha blend for fence_chain + cobweb_sail) | BLOCKOUT_ALIGNMENT + COBWEB Phase 4.2 | 2-3h |
| Chainlink fence + metal pipe fence textures (require alpha wall path) | BLOCKOUT_ALIGNMENT | 1h |
| LIGHT_AND_TORCH Phase 6 (ceiling light fixture sprites: casting pass + billboards) | LIGHT_AND_TORCH | 3-4h |

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
  │  A4.5 Cavity+Fence+Tiles    │ │  │           │ │   │                  │
  │       │                      │ │  │           │ │   │                  │
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
| 3.5 | LIGHT_AND_TORCH Phase 2.5 / A4.5 | Cavity glow overlay in wall decor system |
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
| A4 | raycaster.js, texture-atlas.js, floor-manager.js, grid-gen.js |
| A4.5 | raycaster.js, texture-atlas.js, tiles.js, spatial-contract.js, floor-manager.js, bonfire-sprites.js, game.js |
| A5 | lighting.js, raycaster.js, floor-manager.js, game.js, tiles.js, spatial-contract.js, texture-atlas.js, bookshelf-peek.js, books.json |
| A6 | tiles.js, texture-atlas.js, spatial-contract.js, grid-gen.js, floor-manager.js |
| A7 | torch-state.js (new), torch-peek.js (new), interact-prompt.js, loot-tables.js, loot-tables.json, session-stats.js, game.js, floor-manager.js, readiness-calc.js, index.html |
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

---

## Interactive Objects Audit — Track IO (Apr 3)

> **Source:** INTERACTIVE_OBJECTS_AUDIT.md (DOC-54), MENU_INTERACTIONS_CATALOG.md (DOC-55)
> **Context:** Tile-by-tile rendering and interaction audit revealed biome override erasure,
> bonfire menu trap, sprite centering bugs, and the HEARTH porthole→step-fill pivot.
> Completed work runs parallel with Track A (raycaster changes).

```
Step IO-1: Biome override erasure — explicit heights/textures in all biomes      ✅ DONE
  │  Root cause: tileWallHeights/textures objects fully replaced base defaults.
  │  Fix: Each biome's object now includes ALL tiles with non-default values.
  │
Step IO-2: Bonfire menu trap — 800ms interaction cooldown                        ✅ DONE
  │  Root cause: Magic Remote OK button = menu close + world interact.
  │  Fix: _bonfireCooldownMs in game.js, drained in _tick().
  │
Step IO-3: Billboard sprite centering — mailbox + bonfire                        ✅ DONE
  │  Root cause: +0.5 in sprite builder + +0.5 in _renderSprites = corner offset.
  │  Fix: Removed redundant +0.5 from mailbox-sprites.js, bonfire-sprites.js.
  │
Step IO-4: Step-fill cavity pivot — HEARTH/BONFIRE fire rendering                ✅ DONE
  │  Alpha porthole abandoned → step-fill (Doom rule) with tileHeightOffset.
  │  HEARTH: 0.5 height, -0.40 offset → generous fire cavity.
  │  BONFIRE: 0.3 height, -0.25 offset → stone ring with cavity glow.
  │
Step IO-5: Hearth sandwich — three-zone column rendering                         ✅ DONE
  │  Mantle stone (70% lineHeight) → fire cavity (step-fill lip) → base stone.
  │  Air intake grate (decor_grate) on base stone face.
  │
Step IO-6: Short-wall cap rendering — furniture lid surfaces                     ✅ DONE
  │  TABLE, BED, CHEST, BAR_COUNTER draw horizontal cap when drawStart > halfH.
  │  Texture top-edge sample at 65% brightness, fog-adjusted.
  │
Step IO-7: noFogFade flag — interactive sprites stay opaque                      ✅ DONE
  │  Mailbox and bonfire sprites bypass fog alpha fade.
  │
Step IO-8: CHEST interaction mode cleanup                                        (1h)
  │  Issue: CHEST is walkable (step-on auto-open via _onMoveFinish) BUT renders
  │  as short wall (0.65–0.7×) AND has F-interact path (ChestPeek + CombatBridge).
  │  This is two competing interaction triggers for the same tile.
  │  Options: (a) Make CHEST non-walkable, F-interact only → clean peek lifecycle
  │           (b) Keep walkable, remove from grid after open → one-shot pickup
  │  Decision needed. Both options fix the dual-trigger redundancy.
  │
Step IO-9: Work keys chest validation (Floor 1.6)                                (30m)
  │  Depends: IO-8 (chest interaction mode settled)
  │  Verify: chest at (19,3) renders at correct height, ChestPeek shows label,
  │  F-interact triggers _onPickupWorkKeys(), gate unlocks, Dispatcher despawns.
  │
Step IO-10: PLAYTEST GATE — Dispatcher→Home→Chest→Key                            (30m)
     Full flow: Dispatcher dialogue tree on Floor 1 → walk to home door →
     enter Floor 1.6 → face chest → ChestPeek overlay visible (3D box + label) →
     F-interact → key acquired → exit home → re-enter Floor 1 → gate open.
     NO competing systems. NO redundant open paths. Peek menu interactive and
     dismissible without side effects.
     Depends: IO-8, IO-9
```

**Track IO total**: IO-1 through IO-7 complete (audit fixes shipped), IO-8 through IO-10 open (~2h)
**Unblocks**: Phase G playtesting (Scenario A requires clean chest interaction flow)

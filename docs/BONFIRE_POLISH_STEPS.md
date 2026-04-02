# Bonfire & Hearth — Interaction Audit & Polish Roadmap

**Created**: 2026-03-28 | **Updated**: 2026-04-02
**Status**: §1–§7 complete. §8a–8d complete (visual depth tiers). §9a–9f complete (bonfire UI polish). §11a–11e complete (depth branching + Dragonfire rebrand). §10, §12 are expansion passes.
*** REBRANDED PLAYER FACING BONFIRE TO DRAGONFIRE ***
---

## Current State Audit (Apr 2, 2026)

### What the bonfire IS right now

The bonfire/hearth is the game's **waypoint + stash + rest station** — the Dark Souls bonfire crossed with a Stardew Valley save point. Interacting opens a 4-face rotating MenuBox in `bonfire` context (distinct from `pause` and `shop` contexts).

### Tile types

| Tile | Constant | Where | Visual |
|------|----------|-------|--------|
| BONFIRE (18) | `TILES.BONFIRE` | Exterior floors (depth 1) | 0.3× stone ring wall + 🔥 cavity decor + warm glow + ⛺ tent billboard |
| HEARTH (29) | `TILES.HEARTH` | Dungeon floors (depth 3+) | 1.0× riverrock column + 🔥 cavity decor + warm glow |
| BED (28) | `TILES.BED` | Home only (Floor 1.6, pos 2,2) | BedPeek overlay — sleep/day-advance, NOT bonfire context |

### Interaction flow (game.js → HazardSystem → MenuBox)

1. Player faces BONFIRE or HEARTH tile and presses interact
2. InteractPrompt shows `interact.rest` with 🔥 icon for both tile types
3. `game.js _interact()` calls `HazardSystem.restAtBonfire(fx, fy)` which:
   - Registers tile as respawn point for this floor (`_bonfirePositions[floorId]`)
   - Calls `Player.fullRestore()` (HP + energy)
   - Updates HUD, plays `ui-confirm`, increments `SessionStats.bonfiresUsed`
4. Sets `_pendingMenuContext = 'bonfire'` and opens pause screen via `ScreenManager.toPause()`

### MenuBox bonfire context — 4 faces

| Face | Title | Content |
|------|-------|---------|
| **Face 0: REST** | 🔥 BONFIRE | HP/energy bars (restored), floor info, warp button |
| **Face 1: STASH** | 📦 STASH | 4×5 grid (20 slots), items survive death, DragDrop zone `inv-stash` |
| **Face 2: INVENTORY** | Standard bag/equip | Same as pause Face 2, plus incinerator drop zone active |
| **Face 3: SYSTEM** | Standard system | Same as pause Face 3 |

### Warp destinations (Face 0)

| Player location | Warp target | Label |
|----------------|-------------|-------|
| Exterior (depth 1, not Floor 0) | Floor 1.6 (Home) | 🏠 Warp Home |
| Dungeon (depth 3+) | Parent floor (`FloorManager.parentId`) | 🔼 Warp to Entrance |
| Floor 0 or interiors | No warp available | — |

### Stash system (Face 1)

- `CardAuthority.stash[]` — max 20 items/cards
- **Death-safe**: stash contents survive death (DOC-45 §14 death tiers)
- Transfer via `CardTransfer` or DragDrop (`inv-stash` zone, activated when `menuContext === 'bonfire'`)
- Stash grid rendered as 4×5 card/item slots in `_renderStash()` of menu-faces.js

### Incinerator (debrief-feed.js)

- DragDrop zone `debrief-incinerator` — accepts cards and items (not keys)
- Card refund: rare 5g, uncommon 3g, common 1g
- Item refund: 10% of value (min 1g)
- Active during bonfire context (always registered, overlays at bottom)

### Lighting integration

- `Lighting.addLightSource()` with `flicker: 'bonfire'` — slow 1Hz pulse ±10% + fast shimmer
- WARM tint (amber/orange) for both BONFIRE and HEARTH tiles
- Registered during floor generation via grid-gen lighting pass

### Generation (grid-gen.js)

- One bonfire/hearth per procedural floor, placed in the middle room
- Depth 1 (exterior): BONFIRE + C-shape shrub ring (N, W, E — open to south)
- Depth 3+ (dungeon): HEARTH column (riverrock texture, 1.0× height)
- Depth 2 (interior): hand-authored in blockout files, not procedural

### Status effects at rest

- `Player.fullRestore()` on interact — HP and energy to max
- Home bed (BedPeek) grants WELL_RESTED if slept before 23:00, clears TIRED
- **Gap**: Non-home bonfires do NOT grant WELL_RESTED and do NOT clear TIRED — only fullRestore

---

## §1 Exterior Campfire Blockout — ✅ DONE

C-shape of 3 SHRUB tiles (tile 22, 0.5× height) surrounding a BONFIRE center. Open to south for approach. ⛺ tent billboard via `BonfireSprites.buildSprites()`. Stone ring wall (0.3×) with 🔥 cavity decor and warm glow overlay in raycaster.

## §2 Dungeon Hearth — ✅ DONE

HEARTH (tile 29) placed in dungeon generation. Riverrock texture at 1.0× height. Warm glow, bonfire flicker animation. One per dungeon floor, mid-room placement.

## §3 Fire Emoji Sprite Overlay — Post-jam

Floating 🔥 emoji above BONFIRE/HEARTH tiles (same sprite pass as enemies). Bob, tilt, glow, transparency flicker, scatter sparks on interact. Currently handled by cavity decor system in raycaster — separate billboard sprite is additive polish.

## §4 Crackle Audio — Stub ✅

`fire_crackle` proximity loop within 3 tiles of bonfire/hearth. Stub call exists. Blocked by actual audio asset encoding from EyesOnly MEDIA_ASSETS. Volume scales with distance: `1 - dist/4` falloff.

## §5 Media Asset Encoding — Manual

EyesOnly `MEDIA_ASSETS/` needs ffmpeg encode → `media_assets/audio/sfx/`. Not automated. Includes fire crackle, ambient loops, interaction SFX.

## §6 Debrief Incinerator — ✅ DONE

DragDrop zone `debrief-incinerator` in debrief-feed.js. Rarity-based card refund + 10% item value refund. Glow animation on hover. Click and drag paths both route through `_handleIncineratorDrop()`.

---

## §7 Day/Night Cycle Integration — ✅ COMPLETE (updated Apr 2)

DayCycle module is fully implemented. Skybox Phases 1–4 shipped (sky color cycling, celestial bodies, star parallax). Bonfire rest now wired to day/night cycle.

**✅ Done:**
- DayCycle phase system (DAWN/MORNING/AFTERNOON/DUSK/NIGHT)
- `DayCycle.setPaused(true)` on depth-2 floors (interior time-freeze)
- `DayCycle.advanceTime()` on floor transitions
- Tired trigger at 21:00 — WELL_RESTED→TIRED transition via `StatusEffect`
- Curfew trigger at 02:00 — forced home rescue
- Skybox responds to phase (color cycling, stars fade, celestials track)
- Minimap time strip shows phase icon + HH:MM + day label + compass heading
- Menu faces (Map, Journal) show time and day info
- **§7a** `restAtBonfire()` advances game clock — handles paused interior floors (unpause → advance → re-pause)
- **§7b** WELL_RESTED gated on **bedtime before midnight** (`sleepHour >= 6`). Post-midnight rest (00:00–05:59) = you stayed up too late, no buff. Unified across all 3 rest paths: bonfire, home door (`_doHomeDoorRest`), bed peek (`BedPeek`)
- **§7c** TIRED cleared via `StatusEffect.remove('TIRED', 'manual')` on every bonfire rest
- **§7d** JAM BUILD: rest-until-dawn via `_minutesUntilDawn()` — always wake at 06:00. Post-jam: switch to `ADVANCE.REST` (480 min / 8h) when curfew is no longer automatic failstate. Commented path preserved in code
- **TIRED trigger moved from 21:00 → 19:00** (night phase start). TIRED now fires at nightfall (~7pm), matching the design doc pressure curve. `isTiredHour()` simplified to `_phase === PHASES.NIGHT`
- **§7e** Exterior bonfire glow intensity scales: night 0.95 → noon 0.40 (5s timer in game update loop, `flickerType === 'bonfire'` sources only, depth-1 floors)
- **§7f** Morning recap monologue queued on rest, fires via `HazardSystem.consumeMorningRecap()` when bonfire menu closes → `MonologuePeek.play('morning_recap', { delay: 800 })`
- **Bugfix**: `DayCycle.init()` now resets `_paused`, `_tiredFiredToday`, `_curfewFiredToday` (was not resetting, caused stale state after new game)
- **Bugfix**: HUD week-strip `_WEEK_DAYS` reordered from Sunday-first to Monday-first (matching DayCycle Day 0 = Monday). Past days dimmed, current day bold+bobbing, future days medium. Phase-tinted separator dot before time display

**Debug harness**: `debug/bonfire-8day-cycle.js` — validates 8-day cycle, rest-until-dawn math, pause edge case, rapid spam edge case. Run with `node debug/bonfire-8day-cycle.js`.

**Polish steps:**

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 7a | `HazardSystem.restAtBonfire()` calls `DayCycle.advanceTime(ADVANCE.REST)` after restore | 15m | — | ✅ |
| 7b | WELL_RESTED if bedtime before midnight (`sleepHour >= 6`). Unified across bonfire, home door, BedPeek | 15m | 7a | ✅ |
| 7c | Bonfire rest clears TIRED status effect (parity with home bed) | 5m | 7a | ✅ |
| 7d | **JAM**: All bonfire rests advance to 06:00 dawn (`_minutesUntilDawn()`). POST-JAM: switch to `ADVANCE.REST` 8h when curfew softens | 30m | 7a | ✅ |
| 7e | Exterior bonfire glow intensity scales with `1 - DayCycle.getSunIntensity()` | 15m | Lighting | ✅ |
| 7f | Wire `MonologuePeek.play('morning_recap')` on DAWN phase after bonfire rest | 15m | MonologuePeek | ✅ |

## §8 Bonfire Visual Distinction by Depth

Three visual tiers make the player read safety level at a glance. Currently all bonfires share the same warm glow — the only difference is BONFIRE (stone ring + tent) vs HEARTH (riverrock column).

| Tier | Location | Glow color | Sprites | Fire behavior | Safety read |
|------|----------|------------|---------|---------------|-------------|
| **Campfire** | Exterior (depth 1) | Warm orange | ⛺ tent + stone ring | Steady, welcoming | Safe waypoint |
| **Home hearth** | Floor 1.6 home | Amber/golden | 🛏️ bed adjacent | Steady, warm | Safest — full sleep |
| **Dungeon hearth** | Depth 3+ | Cool blue-grey base, flickering orange | Riverrock column | Nervous flicker, sputtering | Partial safety — enemies nearby |

**Polish steps:**

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 8a | Dungeon hearth: DUNGEON_HEARTH tint (cold blue-grey [12,14,28]), `hearth-dungeon` flicker, cavity glow [80,100,160] | 20m | Lighting | ✅ |
| 8b | Exterior campfire: radius 5, intensity 0.9, WARM tint, `bonfire` slow-pulse flicker (already correct) | 10m | Lighting | ✅ |
| 8c | Home hearth: HOME_HEARTH golden tint ([50,24,6]), radius 5, intensity 0.85, steady — BED tile emitter | 15m | Lighting | ✅ |
| 8d | Dungeon hearth: `hearth-dungeon` nervous flicker — 5Hz primary + erratic 7.5Hz + 1.75Hz harmonics | 15m | Lighting | ✅ |
| 8e | Post-jam: smoke particle emitter above campfire (drift upward, fade) | 1h | ParticleFX | — |
| 8f | Post-jam: ember scatter particles on bonfire interact (bounce away) | 45m | ParticleFX | — |

## §9 Bonfire UI Polish — MenuBox Bonfire Context

The bonfire MenuBox works but the UI is minimal. Polish to make it feel like a proper rest station.

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 9a | Face 0 REST: 🐉 emoji pulses with time-varying alpha + scale (sin-driven flicker) | 20m | — | ✅ |
| 9b | Face 0 REST: status lines from `HazardSystem.getLastRestResult()` — "✓ TIRED cleared", "★ WELL_RESTED gained" | 15m | 7b, 7c | ✅ |
| 9c | Face 0 REST: "📍 Respawn point set" + floor label | 10m | — | ✅ |
| 9d | Face 1 STASH: empty stash shows large 📦 + hint "Drag items here — they survive death." | 10m | — | ✅ |
| 9e | Face 1 STASH: filled slots get purple tint + 💀 death-safe icon (top-right) | 20m | — | ✅ |
| 9f | Warp button: DialogBox confirm before warp, depth-branched prompt text | 20m | DialogBox | ✅ |
| 9g | Warp animation: fade-to-black with bonfire ember particles during transition | 30m | TransitionFX | — (post-jam, no TransitionFX module) |

## §10 Bonfire as Waypoint — Respawn & Warp Network

Currently each floor tracks its own last-rested bonfire independently. The warp system is simple (home or parent floor). Design expansion for a proper waypoint network.

**Current state:**
- `HazardSystem._bonfirePositions[floorId]` stores last bonfire position per floor
- Death rescue → home (Floor 1.6), NOT last bonfire (changed in Sprint 2)
- Warp from bonfire: exterior→home, dungeon→entrance. No bonfire-to-bonfire warp.

**Post-jam expansion:**
- Bonfire-to-bonfire warp network (unlocked bonfires as destinations)
- Warp cost (energy or gold) to prevent trivial fast-travel
- Minimap bonfire icons for visited/unvisited rest points
- Bonfire discovery toast ("🔥 Waypoint discovered: Lantern Gardens bonfire")

## §11 Bonfire Interaction Differentiation

**Updated**: Apr 2, 2026 — reflects §7 fixes + BONFIRE_BRAINSTORMING audit

Both BONFIRE and HEARTH currently trigger identical `interact.rest` behavior. Differentiate by depth to match the contextual contracts model from BONFIRE_BRAINSTORMING.md.

### Current state (post-§7, all bonfires identical)

| Interaction | Exterior Campfire (depth 1) | Dungeon Hearth (depth 3+) | Home Bed (BedPeek) |
|------------|----------------------------|---------------------------|---------------------|
| HP restore | ✅ Full | ✅ Full | ✅ Full |
| Energy restore | ✅ Full | ✅ Full | ✅ Full |
| TIRED clear | ✅ (§7c) | ✅ (§7c) | ✅ |
| WELL_RESTED | ✅ before midnight (§7b) | ✅ before midnight (§7b) — **overpowered** | ✅ before midnight (§7b) |
| Time advance | ✅ rest-until-dawn (§7d) | ✅ rest-until-dawn (§7d) — **overpowered** | ✅ 8h via BedPeek |
| Stash access | ✅ | ✅ — **overpowered** | ❌ (home has furniture) |
| Warp | → Home | → Entrance | — |
| Waypoint set | ✅ | ✅ | — |
| Incinerator | ✅ | ✅ | ❌ |

**Problem**: Dungeon hearths are as powerful as exterior campfires. No dungeon pressure — contradicts CORE_GAME_LOOP §5.7 ("bonfire is a coffee break, not a good night's rest") and the brainstorm's DEEP_DUNGEON contract.

### Target differentiation (jam-scope — depth branching)

| Behavior | Exterior (depth 1) | Dungeon (depth 3+) | Home (BedPeek) |
|----------|---------------------|---------------------|-----------------|
| HP/Energy restore | ✅ Full | ✅ Full | ✅ Full |
| Time advance | Rest-until-dawn | 2h brief rest (no day skip) | 8h via BedPeek |
| WELL_RESTED | Yes (before midnight) | **No** | Yes (before midnight) |
| TIRED clear | Yes | Yes | Yes |
| Stash access | ✅ | **❌ No** | ❌ (furniture) |
| Warp | → Home | → Entrance **gated on readiness** | — |
| Incinerator | ✅ | ✅ | ❌ |
| Unique verb | "Camp" | "Rest" | "Sleep" |
| Safety feel | Full (no enemies) | Partial (tension anchor) | Full |

### Jam-scope tasks (depth branching — no new architecture)

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 11a | `restAtBonfire()` depth branch: depth 3+ → 2h advance (120 min), no WELL_RESTED, no day skip | 30m | §7d | ✅ |
| 11b | `menu-faces.js` depth branch: depth 3+ → hide stash face (Face 1), show "no stash" hint | 20m | — | ✅ |
| 11c | Warp button depth branch: depth 3+ → gate "Warp to Entrance" on `readiness >= 0.6` | 25m | readiness-calc.js | ✅ |
| 11d | InteractPrompt verb: depth 1 → "🐉 Camp", depth 3+ → "🐉 Rest" + Dragonfire rebrand | 10m | — | ✅ |
| 11e | Debug harness Scenario 7: depth-branching (4 sub-tests, all pass) | 20m | 11a | ✅ |

### Post-jam roadmap (from BONFIRE_BRAINSTORMING contracts system)

Full contextual contracts architecture — replaces depth branching with proximity-scan system.

| # | Feature | Source | Notes |
|---|---------|--------|-------|
| 11f | Proximity-scan contract system: `contexts = scan(radius); permissions = BASE + Σ(contracts)` | Brainstorm §2 | Replaces depth branching with modular context providers |
| 11g | Warmth charges: per-bonfire limited heal resource, context sets capacity | Brainstorm §1, §3 | Replaces fullRestore() — adds resource pressure |
| 11h | FIELD_CAMP context: low warmth cap, allow time advance, no stash, no waypoint | Brainstorm §3 | Exterior campfire contract |
| 11i | DUNGEON_ENTRANCE context: waypoint node, NPC services, optional limited stash | Brainstorm §3 | FloorN.0 hub contract — porta-john scoreboard location |
| 11j | INN context: paid rest (advance day), NPC vendor gated | Brainstorm §3 | Civilian rest node — new tile type + NPC |
| 11k | DEEP_DUNGEON conditional return: `if readiness >= threshold → enable one-way extraction` | Brainstorm §4, §6 | Cleanliness-gated extraction with fatigue debuff cost |
| 11l | Mark Path consumable: 1-way return from deep bonfire → entrance, expires after use or day change | Brainstorm §4 | Safety valve item — economy design needed |
| 11m | Dynamic degradation: uncleared dungeons lose cleanliness over time | Brainstorm §7 opt | Anti-stalling mechanic |
| 11n | Overclean bonus (>0.9 readiness): bonus rewards at entrance | Brainstorm §7 opt | Completionist incentive |

## §12 Cross-References

| This Section | Links To | Relationship |
|-------------|----------|-------------|
| §7 Day/Night | → DOC-7 CORE_GAME_LOOP §5 | Day/night pressure, bonfire role, interior time-freeze |
| §7 Day/Night | → DOC-17 SKYBOX_ROADMAP Ph 1–4 | ✅ Sky responds to phase, bonfire glow should too |
| §8 Visual | → DOC-31a LIGHT_AND_TORCH Ph 2e | Building entrance glow scales with DayCycle |
| §8 Visual | → DOC-14 TEXTURE_ROADMAP | Hearth/campfire texture variants per biome |
| §9 UI | → DOC-21 GAME_FLOW_ROADMAP | MenuBox bonfire context, Face layout |
| §10 Waypoint | → DOC-2 TUTORIAL §8 FloorManager | World graph, floor registry, warp targets |
| §11 Differentiation | → DOC-10 COZY_INTERIORS §2 | Time-freeze rule for depth-2 |
| §11 Differentiation | → DOC-7 CORE_GAME_LOOP §5.5 | Interior time-freeze, sleep mechanics |
| §11 Differentiation | → BONFIRE_BRAINSTORMING.md | Contextual contracts system — post-jam architecture source |
| §11 Differentiation | → readiness-calc.js | Warp gate threshold for dungeon hearth extraction |
| §11 Dragonfire | → DOC-51 CINEMATIC_CAMERA | dragonfire_dialogue preset for bonfire bark/dialogue dispatch |
| Incinerator | → DOC-46 INVENTORY_CARD_MENU_REWORK §3 | CardTransfer + DragDrop zone wiring |
| Audio | → DOC-6 AUDIO_ENGINE | fire_crackle proximity, spatial audio (DOC-50 Phase 5) |
| Audio | → DOC-50 SPATIAL_AUDIO_BARK_ROADMAP | Bark proximity, fire crackle spatialization |
| §8 Visual | → engine/lighting.js | DUNGEON_HEARTH + HOME_HEARTH tints, hearth-dungeon flicker |
| §9 UI | → engine/menu-faces.js | REST face flicker/status/waypoint, STASH empty-state + death-safe |
| §9f Warp | → engine/dialog-box.js | Confirm dialog before warp (depth-branched prompt) |
| §9b Status | → engine/hazard-system.js | getLastRestResult() API for REST face feedback |
| Morning Recap | → DOC-51 CINEMATIC_CAMERA | morning_recap preset now wired via MonologuePeek |
# Bonfire & Hearth — Interaction Audit & Polish Roadmap

**Created**: 2026-03-28 | **Updated**: 2026-04-08
**Status**: §1–§7 complete. §8a–8d complete (visual depth tiers). §9a–9f complete (bonfire UI polish). §11a–11e complete (depth branching + Dragonfire rebrand). §13 step-fill cavity technique implemented. §14 bonfire/hearth visual unification roadmapped. **§15 bonfire interaction decoupling complete (Apr 3).** **§11 rewritten Apr 8: two-tier rest system (Full Rest vs Nap), bonfire demoted to nap tier, curfew-nap failstate designed, ownership gate for BED/HEARTH.** §10, §12 are expansion passes. §11p–11w are post-jam nap-tier implementation tasks.
*** REBRANDED PLAYER FACING BONFIRE TO DRAGONFIRE ***
---

## Current State Audit (Apr 2, 2026)

### What the bonfire IS right now

The bonfire/hearth is the game's **waypoint + stash + rest station** — the Dark Souls bonfire crossed with a Stardew Valley save point. Interacting opens a 4-face rotating MenuBox in `bonfire` context (distinct from `pause` and `shop` contexts).

### Tile types

| Tile | Constant | Where | Visual |
|------|----------|-------|--------|
| BONFIRE (18) | `TILES.BONFIRE` | Exterior floors (depth 1) | 0.3× stone ring wall + step-fill cavity (offset -0.25) + `decor_hearth_fire` in lip band + warm glow + ⛺ tent billboard |
| HEARTH (29) | `TILES.HEARTH` | Home + Interior interiors | 1.6× riverrock column + step-fill cavity (offset -0.18) + `decor_hearth_fire` in lip band + cavity glow. See LIGHT_AND_TORCH_ROADMAP §2.5a-b. |
| BED (27) | `TILES.BED` | Home + any housing floor | Context-gated: owned → BedPeek (full rest, day-advance), non-owned → nap action peek (2h, 50% HP, clear TIRED). See §11. |

### Interaction flow (game.js → MenuBox → HazardSystem) — Updated Apr 3

**Previous (pre-§15):** Interact → rest executes immediately → menu opens showing results.
**Current (post-§15):** Interact → menu opens (no rest yet) → player clicks "🔥 Rest" button → rest executes → menu shows results.

1. Player faces BONFIRE or HEARTH tile and presses interact
2. InteractPrompt shows `interact.rest` with 🔥 icon for both tile types
3. `game.js _interact()` records pending bonfire position (`_bonfirePendingX/Y`) and clears last rest result via `HazardSystem.clearLastRestResult()`
4. Opens pause screen via `ScreenManager.toPause()` with `bonfire` context
5. Face 0 renders in **pre-rest state**: shows clickable "🔥 Rest" button (hit-zone slot 901)
6. Player clicks Rest → `game.js` pointer_click handler fires `HazardSystem.restAtBonfire()` which:
   - Registers tile as respawn point (`_bonfirePositions[floorId]`)
   - Calls `Player.fullRestore()` (HP + energy), clears TIRED, grants WELL_RESTED (depth-gated)
   - Advances time (dawn for exterior, 2h for dungeon)
   - Returns result object with cleared/gained effects
7. Face 0 re-renders in **post-rest state**: shows status effect results ("✓ TIRED cleared", "★ WELL_RESTED gained")
8. Closing menu does nothing additional — rest already executed from button

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
- **Gap (resolved in §11 rewrite, Apr 8)**: Non-home bonfires do NOT grant WELL_RESTED — this is now by design (nap tier). They DO clear TIRED and provide full HP/energy restore. See §11 two-tier rest contract.

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

> **Extraction note:** `_doHomeDoorRest()` was extracted from `game.js` to `engine/home-events.js` as `HomeEvents.doHomeDoorRest()`.
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

## §11 Rest Tile Differentiation — Two-Tier System

**Updated**: Apr 8, 2026 — **Major reclassification.** Bonfire demoted from full-rest to nap tier. All rest tiles now fall into two tiers: Full Rest (owned, irreversible day advance) and Nap (public/unassigned, partial recovery, 1-5h time cost). See `PEEK_SYSTEM_ROADMAP.md` §13.7.2 for peek classification details.

### Design principle

WELL_RESTED is the reward for going home. Only owned rest tiles (the player's assigned bed and hearth) grant it. Public rest tiles (bonfires, cots, benches, non-owned beds) are coffee breaks: they remove TIRED and provide partial recovery, but the player must go home for the full buff. This creates a pull-home pressure that complements the curfew system and gives the housing reassignment arc (ACT2_NARRATIVE_OUTLINE §5.4) real mechanical weight.

### Current state (post-§7, needs code update to match)

Bonfires currently grant full restore + WELL_RESTED + rest-until-dawn, making them equivalent to the home bed. This is overpowered and must be downgraded.

### Target: Two-Tier Rest Contract

**Tier 1 — Full Rest (owned tiles only):**

| Behavior | Owned BED | Owned HEARTH |
|----------|-----------|--------------|
| HP/Energy restore | ✅ Full | ✅ Full |
| Time advance | 8h (advance to dawn) | 8h (advance to dawn) |
| WELL_RESTED | ✅ Yes (before midnight) | ✅ Yes (before midnight) |
| TIRED clear | ✅ Yes | ✅ Yes |
| Stash access | ❌ (home has furniture) | ❌ (home has furniture) |
| Incinerator | ❌ | ✅ Yes |
| Unique verb | "Sleep" | "Rest" |
| Peek type | Full peek (BedPeek) | Full peek (multi-button: Rest / Incinerate) |
| Ownership gate | `housing_floor === currentFloor` | `housing_floor === currentFloor` |

**Tier 2 — Nap (public/unassigned tiles):**

| Behavior | BONFIRE | Non-owned BED | COT | BENCH | Non-owned HEARTH |
|----------|---------|---------------|-----|-------|-----------------|
| HP restore | ✅ Full | 50% | 30% | ❌ None | ✅ Full |
| Energy restore | ✅ Full | 50% | 30% | ❌ None | ✅ Full |
| Time cost | 3h | 2h | 2h | 1h | 3h |
| WELL_RESTED | ❌ Never | ❌ Never | ❌ Never | ❌ Never | ❌ Never |
| TIRED clear | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Stash access | ✅ (ext only) | ❌ | ❌ | ❌ | ❌ |
| Warp | → Home (ext), → Entrance (dun, gated) | ❌ | ❌ | ❌ | ❌ |
| Waypoint set | ✅ (bonfire only) | ❌ | ❌ | ❌ | ❌ |
| Incinerator | ✅ | ❌ | ❌ | ❌ | ✅ |
| Unique verb | "Nap" | "Nap" | "Nap" | "Sit & Rest" | "Rest" |
| Peek type | One-button action | One-button action | One-button action | One-button action | One-button action |

**Nap time cost ranking:** Bench (1h) < Cot/non-owned Bed (2h) < Bonfire/non-owned Hearth (3h). Lower cost = less recovery. The player trades quality for time.

### §11.1 Curfew-Nap Failstate

If a nap's time cost would push the clock past curfew (02:00), one of two outcomes fires depending on whether the nap location is sheltered:

**Sheltered nap (depth 2, or BONFIRE with tent, or HEARTH):** Player wakes at the nap tile with GROGGY debuff (`walkTimeMult 1.25`, 1-day duration). The nap consumed all remaining night hours. Player overslept but is safe. This is the gentle version — interior safety contract still holds.

**Unsheltered nap (exterior BENCH, exterior COT, open-area rest tile):** Curfew enforcement triggers. Heroes find the player passed out and return them to their assigned housing. Stardew Valley collapse: fade to black, wake at home, lose 10% gold, gain GROGGY debuff. This is the punitive version — public spaces are not safe overnight.

**Gate logic:**
```javascript
function napCurfewCheck(tile, floorId, napHours) {
  var hoursUntilCurfew = DayCycle.hoursUntilCurfew();
  if (napHours <= hoursUntilCurfew) return 'safe';
  var depth = FloorManager.getDepth(floorId);
  var isSheltered = (depth === 2) ||
                    (tile === TILES.BONFIRE) ||
                    (tile === TILES.HEARTH);
  return isSheltered ? 'groggy' : 'rescue';
}
```

**UI:** Nap button shows warning text when curfew overlap detected: "Nap (⚠️ past curfew — wake groggy)" or "Nap (⚠️ heroes will find you)".

### §11.2 Dungeon Rest (depth 3+ unchanged)

Dungeon hearths retain their existing depth-branching behavior from §11a-11e (2h brief rest, no WELL_RESTED, no stash, warp gated on readiness). They are always nap-tier because the player never owns a dungeon hearth.

### §11.3 Bonfire-Specific Features (retained)

Bonfires keep their unique features even as nap-tier tiles: respawn point registration, warp (home or entrance), stash access (exterior only), incinerator. These differentiate bonfires from other nap tiles. A bonfire nap is the most feature-rich nap — it just doesn't grant WELL_RESTED or advance a full day.

### Jam-scope tasks (depth branching — complete, needs nap-tier update)

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 11a | `restAtBonfire()` depth branch: depth 3+ → 2h advance (120 min), no WELL_RESTED, no day skip | 30m | §7d | ✅ |
| 11b | `menu-faces.js` depth branch: depth 3+ → hide stash face (Face 1), show "no stash" hint | 20m | — | ✅ |
| 11c | Warp button depth branch: depth 3+ → gate "Warp to Entrance" on `readiness >= 0.6` | 25m | readiness-calc.js | ✅ |
| 11d | InteractPrompt verb: depth 1 → "🐉 Camp", depth 3+ → "🐉 Rest" + Dragonfire rebrand | 10m | — | ✅ |
| 11e | Debug harness Scenario 7: depth-branching (4 sub-tests, all pass) | 20m | 11a | ✅ |

### Post-jam tasks (nap-tier reclassification)

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 11p | Demote exterior bonfire from full-rest to nap: 3h time cost, NO WELL_RESTED, full HP/energy | 30m | §11a | — |
| 11q | Add `isOwnedRestTile()` gate: check `Player.getFlag('housing_floor')` against current floor | 20m | ACT2 flags | — |
| 11r | BedPeek ownership branch: owned → full peek (existing), non-owned → nap action peek (2h, 50% HP) | 45m | 11q | — |
| 11s | InteractPrompt verb update: bonfire "Nap" (was "Camp"), non-owned bed "Nap", bench "Sit & Rest" | 15m | 11p, 11q | — |
| 11t | COT/BENCH rest interaction: wire nap action peek for tiles 41 and 48 | 1h | 11q | — |
| 11u | Curfew-nap failstate: `napCurfewCheck()` with sheltered/unsheltered branching | 45m | DayCycle | — |
| 11v | Nap button warning text for curfew overlap (groggy vs rescue) | 20m | 11u | — |
| 11w | Debug harness Scenario 8: nap-tier tests (time cost, no WELL_RESTED, curfew edge cases) | 30m | 11p-11v | — |

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
| §13 Step-fill cavity | → LIGHT_AND_TORCH_ROADMAP §2.5a | Technique documentation, recipe for new cavity tiles |
| §14 Unification | → engine/floor-manager.js biome data | Container texture + wallHeight varies per depth |

---

## §13 Step-fill Cavity Technique — ✅ IMPLEMENTED (Apr 3)

Replaced the alpha-porthole sprite-inside-wall technique with step-fill (Doom rule) cavities. The porthole approach (transparent pixels in texture + cavity pre-fill + wallDecor fire sprite on wall face) produced flat "painted-on" fire with no perceived depth. The step-fill approach creates genuine geometric displacement — the wall column sinks via `tileHeightOffset`, and the gap above becomes a visible cavity with parallax on player movement.

**How it works**: A negative `tileHeightOffset` displaces the wall column downward. The raycaster's step-fill code fills the lip above with: dark cavity base → fire sprite (drawImage from `decor_hearth_fire` canvas) → warm glow overlay. The lip band is geometrically separate from the wall face, so it reads as depth, not paint.

**What changed**:

| File | Change |
|------|--------|
| `engine/texture-atlas.js` | hearth_riverrock + bonfire_ring reverted to fully opaque (no porthole alpha) |
| `engine/raycaster.js` | Removed cavity pre-fill + back-face injection. Added fire cavity rendering in sunken step-fill section. Added `cavityBand` skip in `_renderWallDecor` |
| `engine/floor-manager.js` | HEARTH offset -0.18, BONFIRE offset -0.25 in all biomes. `cavityBand: true` on fire wallDecor items |
| `engine/spatial-contract.js` | Interior WALL tiles now 2.5× (close-up immersion, matches exterior tower behavior) |

**Tuning knobs**: `tileHeightOffset` controls cavity height (more negative = taller opening). `tileWallHeight` controls the stone column size. The fire sprite is `decor_hearth_fire` (32×32 procedural flame with dragon whelp silhouette). Glow is `rgba(255,120,30)` at 18% × brightness.

**Discovery**: The technique was found accidentally — PILLARs with `tileHeightOffset: 1.0` had the most convincing depth cavity in the engine. The step-fill gap looked like a real opening. Applied intentionally to HEARTH/BONFIRE with negative offsets.

---

## §14 Bonfire / Hearth Visual Unification — ROADMAP

One conceptual "Dragonfire source" with three visual containers, determined by floor depth. The fire itself is always the same (🔥 flame + 🐉 translucent dragon), but the stone container that houses it changes to match the biome. Two tile types (BONFIRE 18, HEARTH 29) remain separate for gameplay differentiation (§11) but share the same rendering pipeline.

### 14a. Unified fire sprite composition

All fire sources use the same sprite: 🔥 flame emoji overlaid with a semi-transparent 🐉 dragon emoji. This replaces the current procedural `decor_hearth_fire` (32×32 flame with baked dragon silhouette).

**Implementation options** (pick one):
1. **Pre-render emoji to canvas**: At TextureAtlas init, render `🔥` and `🐉` to offscreen canvases at 32×32, composite into a single `decor_dragonfire` texture. Step-fill cavity drawImage uses this canvas. Simplest, matches existing pipeline.
2. **Live emoji composite**: Render emoji via `ctx.fillText('🔥', x, y)` directly into the step-fill band per frame. Enables dynamic scaling but is slower (text rendering per column per frame). Not recommended for LG webOS.
3. **Hybrid**: Pre-render flame at multiple scales (16, 32, 64). Step-fill picks nearest size for distance-appropriate detail. Most polish, moderate complexity.

**Recommendation**: Option 1. Pre-render emoji at init, single 32×32 texture, drop-in replacement for `decor_hearth_fire`. The dragon transparency is controlled by the emoji's alpha channel — on most platforms 🐉 renders with partial transparency already. If not, composite at 40-50% alpha over the flame.

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 14a.1 | Create `_genDragonfireEmoji(id)` in texture-atlas.js: render 🔥 + 🐉 at 50% alpha to 32×32 canvas | 30m | — | — |
| 14a.2 | Replace `decor_hearth_fire` reference in step-fill cavity code with `decor_dragonfire` | 5m | 14a.1 | — |
| 14a.3 | Update wallDecor spriteId in floor-manager.js for HEARTH/BONFIRE entries | 5m | 14a.1 | — |
| 14a.4 | Verify emoji rendering on LG webOS canvas (emoji font availability, glyph size) | 15m | 14a.1 | — |

### 14b. Container varies by depth

The stone structure around the fire changes per biome depth tier. Both BONFIRE and HEARTH tiles resolve their texture and wallHeight from the biome's SpatialContract data, so this is a floor-manager biome data change — no rendering code needed.

| Depth | Tile | Container texture | wallHeight | tileHeightOffset | Visual read |
|-------|------|-------------------|------------|------------------|-------------|
| **exteriorN** | BONFIRE (18) | `bonfire_ring` — grey riverrock ring | 0.3× | -0.25 | Low campfire stone circle, tent nearby |
| **interiorN.N** | HEARTH (29) | `hearth_riverrock` — warm masonry column | 1.6× | -0.18 | Tall fireplace built into wall |
| **interiorN.N.N** | BONFIRE (18) | `bonfire_scrap` (NEW) — improvised debris ring | 0.3× | -0.20 | Rough campfire, hostile environment |

**Note**: interiorN.N.N (nested dungeons) currently use HEARTH for the rest point. Switching to BONFIRE here requires a grid-gen change: place BONFIRE instead of HEARTH in dungeon mid-rooms. This also changes the gameplay contract (BONFIRE and HEARTH have different interaction rules per §11).

**Alternative** (no tile-type change): keep HEARTH in dungeons but add a biome-specific texture variant: `hearth_scrap` — rough cobbled stone instead of polished riverrock. The step-fill cavity still works (same rendering path). HEARTH keeps its dungeon interaction rules (limited stash, no WELL_RESTED, etc. per §11).

| # | Task | Est. | Depends on | Status |
|---|------|------|------------|--------|
| 14b.1 | Create `bonfire_scrap` texture in texture-atlas.js: irregular piled stones, charred edges, improvised look | 30m | — | — |
| 14b.2 | Add `bonfire_scrap` to nestedDungeon biome textures for BONFIRE (18) if switching, or `hearth_scrap` for HEARTH (29) if keeping current tile types | 5m | 14b.1 | — |
| 14b.3 | Verify step-fill cavity renders for dungeon fire tiles (offset + wallHeight tuning) | 15m | 14b.2 | — |
| 14b.4 | Decide: switch dungeon rest tile from HEARTH to BONFIRE (gameplay impact per §11), or keep HEARTH with scrap texture (visual-only change) | Design decision | §11 | — |

### 14c. Biome-specific glow tinting (already implemented in §8)

Lighting tints already vary by depth (§8a-8d). No additional work needed — the glow color is set per wallDecor entry in floor-manager.js:
- Exterior: warm orange `(255,120,30)` α=0.35
- Home: amber/golden `(255,180,60)` α=0.30
- Dungeon: cold blue-grey `(80,100,160)` α=0.25

### 14d. Summary — what changes where

| System | exteriorN (BONFIRE) | interiorN.N (HEARTH) | interiorN.N.N (TBD) |
|--------|--------------------|--------------------|---------------------|
| Tile type | BONFIRE (18) | HEARTH (29) | HEARTH (29) or BONFIRE (18) — §14b.4 |
| Container texture | `bonfire_ring` | `hearth_riverrock` | `bonfire_scrap` or `hearth_scrap` (NEW) |
| Fire sprite | `decor_dragonfire` (NEW, §14a) | `decor_dragonfire` | `decor_dragonfire` |
| wallHeight | 0.3× | 1.6× | 0.3× (campfire) or 1.2× (hearth) |
| tileHeightOffset | -0.25 | -0.18 | -0.20 |
| Glow tint | Warm orange | Amber/golden | Cold blue-grey |
| Billboard sprite | ⛺ tent | — | — |
| Gameplay contract | §11 exterior | §11 interior | §11 dungeon |

---

## §15 Bonfire Interaction Decoupling — ✅ COMPLETE (Apr 3)

Decoupled rest execution from bonfire interaction. Previously, approaching a bonfire and pressing OK immediately fired `HazardSystem.restAtBonfire()`, advancing the day and restoring HP before the menu even opened. This caused the tooltip to fight the cinematic fade, and gave the player no agency over when rest actually fires.

### What changed

| # | Task | Status |
|---|------|--------|
| 15a | Decouple rest from interact: menu opens first, rest fires from Face 0 "🔥 Rest" button only | ✅ |
| 15b | Track pending bonfire position (`_bonfirePendingX/Y`) in game.js for deferred rest | ✅ |
| 15c | `HazardSystem.clearLastRestResult()` on menu open — null = pre-rest, non-null = post-rest | ✅ |
| 15d | Face 0 two-state renderer: pre-rest shows rest button (slot 901), post-rest shows effect results | ✅ |
| 15e | InteractPrompt emoji changed from 🐉 to 🔥 (BONFIRE, HEARTH, depth-override — 3 locations) | ✅ |
| 15f | HEARTH tileWallHeight in home biome changed from 0.5 to 2.5 (floor-to-ceiling chimney) | ✅ |
| 15g | InteractPrompt repositioned from `BOX_Y_OFF = 200` to `BOX_Y_FRAC = 0.60` (above tooltip bar) | ✅ |
| 15h | Post-key quest target updated to dungeon 2.N entrance (3-phase quest system) | ✅ |

### Files changed
| File | Changes |
|------|---------|
| `engine/game.js` | `_bonfirePendingX/Y` tracking, rest fires from pointer_click `action === 'rest'`, clearLastRestResult on menu open |
| `engine/menu-faces.js` | Face 0 pre/post rest states, 🔥 title emoji replacing 🐉 |
| `engine/hazard-system.js` | `clearLastRestResult()` public API exposed |
| `engine/interact-prompt.js` | 🐉→🔥 in 3 locations, `BOX_Y_FRAC = 0.60` positioning |
| `engine/floor-manager.js` | HEARTH wallHeight 2.5 in home biome |
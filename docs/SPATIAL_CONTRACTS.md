# Spatial Contracts — Interactive Tile Behavior by Floor Depth

**Created**: 2026-04-06 | **Status**: Audit + Design Contract + Roadmap
**Scope**: Every interactive tile type, contracted per depth tier
**Depends on**: Unified Restock Surface (RS-1 through RS-5), Act 2 PvE design

---

## 0. Depth Tier Definitions

| Tier | Format | Example | Setting | Gameplay Role |
|------|--------|---------|---------|---------------|
| **Depth 1** | `floorN` | `1`, `2`, `3` | Exterior zones (Promenade, Lantern Row, Garrison) | Traversal, NPC hubs, light combat encounters (Act 2 PvE) |
| **Depth 2** | `floorN.N` | `1.1`, `2.2`, `1.6` | Interior zones (shops, home, guild halls) | Safe zones, storage, commerce, quest hubs |
| **Depth 3+** | `floorN.N.N` | `2.2.1`, `2.2.2` | Dungeons (post-hero cleaning circuit) | Core gleaner loop: clean, restock, rearm, ready for next hero |

---

## 1. Full Spatial Contract Matrix

### HAVE vs WANT — every interactive tile at every depth

---

### TORCH (tiles 30/31: TORCH_LIT / TORCH_UNLIT)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 12 (Lantern Row + Garrison) | 22 (shops) | 30 (cellars + vaults) |
| **HAVE: Interaction** | Peek + refuel (same as D3) | Peek + refuel (same as D3) | Peek + refuel (same as D3) |
| **HAVE: Hose extinguish** | Always allowed | Always allowed | Always allowed |
| **HAVE: Hero damage** | None | None | Random lit→unlit on floor load |
| **HAVE: Depth gating** | None | None | None (only hero-damage is depth-3+) |
| | | | |
| **WANT: Placement** | Undecided (keep existing?) | Decorative, always-lit | Core restock target |
| **WANT: Interaction** | Undecided | View-only (no refuel) | Full refuel via RestockSurface |
| **WANT: Hose extinguish** | Undecided | ❌ Blocked — shop torches are infrastructure | ✅ Required — hose extinguish is the mechanic |
| **WANT: Aesthetic** | Warm street lamps, permanent | Ambient shop lighting, permanent | Hero-damaged, needs restoration |

**Delta**: Torch interaction is currently identical at all depths. The WANT contract requires depth gating on hose extinguish (block at D2, require at D3+) and making D2 torches non-interactive decoration. D1 behavior is undecided but should probably match D2 (decorative) or be deferred entirely to Act 2 scoping.

---

### BREAKABLE / CRATE (tile 11)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 in blockouts | 0 in blockouts | 16 total (7 + 9) |
| **HAVE: Interaction** | N/A (none placed) | N/A (none placed) | Fill slots via PeekSlots, bolted-down (indestructible) |
| **HAVE: Smash** | Would work (no depth gate on smash for non-containers) | Same | Blocked ("bolted down" if container exists) |
| **HAVE: Container** | Auto-created on load | Auto-created on load | Auto-created on load, 2-5 slots, biome frames |
| | | | |
| **WANT: Placement** | ✅ Place on D1 exteriors | ✅ Place on D2 interiors | ✅ Keep existing |
| **WANT: D1 behavior** | Smash-only. No container, no slots. Loot table drop on destroy. Classic breakable prop. | — | — |
| **WANT: D2 behavior** | — | Chest-like: pre-filled slots, player withdraws. Biome-specific hydration cycle — empty crates refill between visits (day tick). Moderate capacity (4-8 slots). Not smashable. | — |
| **WANT: D3+ behavior** | — | — | Current behavior is correct. Main restock mechanic: bolted-down, fill slots, seal for coins. |

**Delta**: Breakables currently only exist at D3. D1 needs a smash-only path with no CrateSystem container (pure loot breakable). D2 needs a new "storage crate" mode — slots pre-filled, withdraw-only like chests, with a biome-aware refill cycle on day tick. The container creation path (`createCrate`) needs a depth branch: D1 = no container, D2 = chest-like withdraw container with day-tick refill, D3+ = deposit container (current).

---

### CHEST (tile 7)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 in blockouts | 2 (floor 2.2 armory, floor 1.6 home stash) | 2 (2.2.1 vault, 2.2.2 armory) |
| **HAVE: D2 behavior** | — | Withdraw-only. Home = 256-slot stash grid. Others = 8-12 slot row. | — |
| **HAVE: D3 behavior** | — | — | `demandRefill: true`, 1-5 slots, starts filled. PeekSlots routes as deposit because demandRefill, but initial state is filled (withdraw first). **BROKEN**: RestockSurface doesn't handle withdraw. |
| **HAVE: UI** | — | CrateUI canvas (stash grid OR slot row) | CrateUI canvas (no RestockSurface withdraw) |
| | | | |
| **WANT: D1 behavior** | Not planned (no exterior chests) | — | — |
| **WANT: D2 behavior** | — | ✅ Keep as-is: large stash at home (256), small withdraw at interiors (8-12). Uniform CrateUI slot row UI. | — |
| **WANT: D3+ behavior** | — | — | Two-phase lifecycle: **Phase A** = withdraw loot (same UI as D2 chests). **Phase B** = after depletion, `demandRefill` activates → RestockSurface deposit mode. Player takes loot first, then restocks empty chest as part of cleaning circuit. |
| **WANT: UI** | — | Unified: RestockSurface withdraw mode (or keep CrateUI until RS migrates) | RestockSurface with phase detection |

**Delta**: The D3+ dual-phase lifecycle is the biggest gap. `demandRefill` currently routes to RestockSurface immediately even though slots are full (withdraw needed first). Fix: add a `phase` field to chest containers: `'loot'` (slots filled, withdraw) → `'empty'` (depleted, awaiting restock) → `'restocked'` (sealed). PeekSlots routes `'loot'` phase to withdraw UI, `'empty'` phase to RestockSurface. The stash grid at home is a third UI that should eventually become a RestockSurface mode but can stay as CrateUI for now.

---

### COBWEB (overlay, not a tile constant — CobwebSystem manages positions)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 | 0 | 16 (7 + 9 in blockouts) |
| **HAVE: Interaction** | Depth-gated: blocked below D3 | Depth-gated: blocked below D3 | Player installs cobwebs (Silk Spider consumable) |
| **HAVE: Respawn** | N/A | N/A | No respawn. Destroyed = gone until manually re-installed. |
| | | | |
| **WANT: D1 behavior** | ✅ Aesthetic-only cobwebs. Respawn on map load. Not installable, not interactive. Visual ambiance (haunted streets, old corners). | — | — |
| **WANT: D2 behavior** | — | ✅ Same as D1: aesthetic, respawn on load. Shops/interiors have decorative cobwebs in corners/ceilings. Not interactive. | — |
| **WANT: D3+ behavior** | — | — | ✅ Keep current: player-installed, functional, readiness impact, no respawn. |

**Delta**: D1 and D2 cobwebs need a new `'aesthetic'` type that skips the install interaction and respawns on floor load. CobwebSystem already has two types (`'standalone'` and `'wall_overlay'`) — add a third `'aesthetic'` type that renders visually but has no CobwebNode interaction, no readiness contribution, and regenerates on `onFloorLoad()`. Floor blockouts for D1/D2 would declare aesthetic cobweb positions.

---

### CORPSE (tile 19)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 | 0 | 17 (7 + 10 in blockouts) |
| **HAVE: Interaction** | Would work (no depth gate) | Would work (no depth gate) | Restock mode (container unsealed) or Harvest mode (sealed/no container) |
| **HAVE: Container** | N/A | N/A | 2-3 resource slots + 1 SUIT_CARD slot, biome frames |
| | | | |
| **WANT: D1 behavior** | ✅ **Act 2 PvE**: fallen enemies from combat encounters. Harvest-only (loot corpse → items). No restock obligation. Corpses appear after PvE combat events and persist until harvested. | — | — |
| **WANT: D2 behavior** | — | ✅ Same as D1 but interior context. PvE encounter corpses in guild halls, inns (bar fights?). Harvest-only. Possibly quest-gated (investigate the body → clue items). | — |
| **WANT: D3+ behavior** | — | — | ✅ Keep current: restock + harvest dual mode. Suit-card matching for reanimation. Core gleaner loop. |

**Delta**: D1/D2 corpses are a new feature for Act 2 PvE. They need a `harvest-only` mode that doesn't create a CrateSystem container (or creates one with `demandRefill: false` so PeekSlots skips deposit zones). CorpsePeek already has harvest mode — it just needs to be the only option at D1/D2. The container creation in `createCorpse()` should check depth: D1/D2 = loot-only container (pre-filled, no seal flow), D3+ = current restock container.

---

### VENDOR / SHOP (tile SHOP)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 1 (Floor 3 Garrison, Admiralty) | 0 | 0 |
| **HAVE: Factions** | tide, foundry, admiralty (3 catalogs, NPC presets, refresh cycles) | Same | N/A |
| **HAVE: Interaction** | MerchantPeek BoxAnim → VendorDialog (StatusBar dialogue tree) | Same | Same |
| **HAVE: Browse Wares** | TODO (card shop UI unimplemented) | Same | N/A |
| **HAVE: Buy Supplies** | Multi-buy loop via VendorDialog | Same | N/A |
| **HAVE: Sell Junk** | Bulk sell via Salvage + CardTransfer | Same | N/A |
| **HAVE: Refresh** | Staggered cycles: Tide 2d, Foundry 3d, Admiralty 4d | Same | N/A |
| **HAVE: Registry** | None — hardcoded in floor blockout `shops[]` array + game.js SHOP handler | Same | N/A |
| | | | |
| **WANT: D1 behavior** | ✅ Outdoor market stalls, bazaar carts. Tide Council (Coral Bazaar exterior), possibly Foundry (Lantern Row forge storefront). Faction-appropriate exterior NPC preset. | — | — |
| **WANT: D2 behavior** | — | ✅ Indoor shops. All 3 factions. Admiralty (Garrison interior), Foundry (Armorer's Workshop), Tide (Bazaar interior). Home floor (1.x) may have a personal stash vendor or barter NPC. | — |
| **WANT: D3+ behavior** | — | — | ❌ No vendors in dungeons. Dungeon economy is restock-for-coins, not commerce. |
| **WANT: Registry** | ✅ Central VendorRegistry module. Floor blockouts declare positions; registry resolves faction, NPC, refresh cycle, supply catalog. Game.js delegates SHOP handler to VendorRegistry.interact(). | Same | N/A |
| **WANT: Supply↔Restock link** | Vendor supplies (Torch Oil, Trap Kit, Scrub Brush, crate fillers) directly feed D3+ restock loop. RestockSurface compatibility glow should highlight "purchasable at nearby vendor" items. | Same | N/A |

**Delta**: The vendor system's 3-faction economy is architecturally sound (shop.js, vendor-dialog.js, merchant-peek.js are individually clean). The problem is placement fragmentation: vendor positions live in floor blockout `shops[]` arrays, faction resolution is in game.js's SHOP tile handler, NPC sprite spawning is in game.js's floor-load path. A central VendorRegistry should own all three concerns. D1 outdoor vendors are a new placement tier (market stalls with faction-appropriate NPC presets). The "Browse Wares" card shop UI is still TODO in VendorDialog — roadmap item, not a spatial contract issue.

---

### BAR_COUNTER (tile BAR_COUNTER) — separate from vendors

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 | Future (inn) | 0 |
| **HAVE: Interaction** | Tap-based: 3 taps/visit, +energy/HP, speed buff, cleanse. No gold cost. | Same | N/A |
| | | | |
| **WANT** | ❌ Not exterior | ✅ D2-only rest mechanic (inn, tavern, home kitchen). Not a vendor — no gold economy, no inventory. | ❌ Not dungeon |

**Delta**: Bar counters are rest-point mechanics (like bonfires), not economy. The tap-based minigame (+energy, +HP, no gold cost) is fundamentally different from vendor transactions. No modularization needed — bar-counter-peek.js is already self-contained.

---

### TRAP (tile 8)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 | 0 | 6 (3 + 3 in blockouts) |
| **HAVE: Interaction** | Would work (no depth gate) | Would work (no depth gate) | Hero triggers → consumed. Gleaner rearms with Trap Kit/Spring. |
| **HAVE: Readiness** | N/A | N/A | 20% weight in readiness calc |
| | | | |
| **WANT: D1 behavior** | ❌ No traps on exteriors. Traps are dungeon infrastructure. | — | — |
| **WANT: D2 behavior** | — | ❌ No traps in interiors. Same reasoning. | — |
| **WANT: D3+ behavior** | — | — | ✅ Keep current. Core rearm mechanic. |

**Delta**: None needed — traps only exist at D3+ already. Contract is "D3+ only" and the blockouts already comply. Just documenting the constraint for future floor builders.

---

### DETRITUS (tile 39)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 | 0 | 18 (8 + 10 in blockouts) |
| **HAVE: Interaction** | Would work | Would work | Walk-over or face+OK → pickup → bag item |
| | | | |
| **WANT: D1 behavior** | ❓ Open question. Litter on streets after hero battles (Act 2)? Narrative flavor? | — | — |
| **WANT: D2 behavior** | — | ❌ Probably not. Interior shops shouldn't have adventurer debris. | — |
| **WANT: D3+ behavior** | — | — | ✅ Keep current. Crate-fill resources. Quick-fill fuel. |

**Delta**: Detritus is fine at D3+. D1 detritus could serve Act 2 PvE as post-battle litter but that's Act 2 scope. No changes needed now.

---

### PUZZLE (tile 23)

| Aspect | Depth 1 (ext) | Depth 2 (int) | Depth 3+ (dungeon) |
|--------|---------------|---------------|---------------------|
| **HAVE: Placement** | 0 | 0 | 0 (system exists, not placed) |
| **HAVE: Interaction** | Would work | Would work | 3×3 sliding puzzle → reset to earn readiness |
| | | | |
| **WANT** | ❌ Not exterior content | ❌ Not interior content | ✅ D3+ only when placed. Seeker's puzzle panels. |

**Delta**: None — system ready, not yet placed. Contract: D3+ only.

---

### BOOKSHELF (tile 25), TABLE (tile 28), BED (tile 27), BAR_COUNTER, HEARTH (tile 29)

These are furniture tiles — not restockable containers. Included for completeness.

| Tile | D1 | D2 | D3+ | Notes |
|------|----|----|-----|-------|
| BOOKSHELF | 0 placed | Yes (shops, home) | 0 placed | Read-only text interaction. No depth contract needed. |
| TABLE | 0 placed | Yes (shops, home) | Yes (barracks) | Inspect interaction. No depth contract needed. |
| BED | 0 placed | Yes (home 1.6) | Yes (barracks 2.2.2) | Sleep/rest interaction. Home = day advance. Dungeon = short rest. |
| BAR_COUNTER | 0 placed | Future (inn) | 0 placed | Drink interaction. No depth contract needed. |
| HEARTH | 0 placed | Yes (home 1.6) | 0 placed | Rest point (like bonfire). Home-only for now. |

No spatial contract changes needed for furniture tiles.

---

## 2. Priority Delta Summary

### Must Fix (broken/inconsistent behavior)

| # | Tile | Issue | Severity |
|---|------|-------|----------|
| **SC-1** | CHEST D3+ | `demandRefill` routes to RestockSurface immediately even though slots start filled (need withdraw first). Two-phase lifecycle missing. | **High** — D3+ chests are broken post RS-1 |
| **SC-2** | TORCH D2 | Hose can extinguish shop torches — destroys ambient lighting, no gameplay value. | **Medium** — not encountered unless player brings hose to shops |
| **SC-3** | TORCH D2 | TorchPeek refuel interaction available on decorative shop torches — confusing, no purpose. | **Low** — interaction exists but does nothing harmful |

### Must Build (contracted behavior not yet implemented)

| # | Tile | Feature | Scope |
|---|------|---------|-------|
| **SC-4** | BREAKABLE D1 | Smash-only breakables on exteriors. No container, pure loot drop. | **Small** — skip `createCrate()` at D1, add D1 placements |
| **SC-5** | BREAKABLE D2 | Storage crate mode: pre-filled slots, withdraw-only, biome-specific refill on day tick. | **Medium** — new container mode + day-tick refill system |
| **SC-6** | COBWEB D1/D2 | Aesthetic cobwebs: visual-only, respawn on floor load, no interaction. | **Small** — new cobweb type + blockout placements |
| **SC-7** | CORPSE D1/D2 | Harvest-only corpses for Act 2 PvE combat encounters. | **Medium** — depth gate on container creation + Act 2 spawn system |

### Deferred (Act 2 / post-jam scope)

| # | Tile | Feature | Notes |
|---|------|---------|-------|
| **SC-8** | TORCH D1 | Exterior torch contract (decorative? interactive? extinguishable?) | Depends on Act 2 exterior gameplay loop |
| **SC-9** | DETRITUS D1 | Post-battle litter on streets | Act 2 PvE encounter aftermath |
| **SC-10** | CORPSE D1/D2 spawn | PvE combat → corpse placement system | Act 2 combat system |
| **SC-11** | CHEST stash | Migrate home stash grid to RestockSurface mode | Post RS-5 |

---

## 3. Execution Roadmap

### Phase SC-A: Depth-Gate Torches — DONE 2026-04-06

**Goal**: Shop/interior torches become decorative. Hose interaction blocked at D2.

1. ✅ `torch-peek.js` — depth < 3 gate in `update()` suppresses peek entirely at D1/D2
2. ✅ `torch-hit-resolver.js` — depth < 3 early return in `onHoseHit()` blocks hose extinguish at D1/D2
3. No change needed: `spray-system.js` (delegates to TorchHitResolver), `floor-manager.js` (hero damage already depth-gated)

### Phase SC-B: Two-Phase Chest Lifecycle — DONE 2026-04-06

**Goal**: D3+ chests work as withdraw-first, then restock-after-depletion.

1. ✅ `crate-system.js` — `phase` field: `'loot'` → `'empty'` → `'restocked'` (stash = `'stash'`). `lootedDay` stamp on depletion. Per-slot `fixed` flag for hand-authored quest items.
2. ✅ `peek-slots.js` — routes by `container.phase`: loot/stash → CrateUI withdraw, empty + D3+ → RestockSurface deposit. `trySeal()` now allows empty-phase D3+ chests, advances to `'restocked'`.
3. ✅ `chest-peek.js` — phase-aware sub-labels: "→ take loot", "→ restock", "✔ restocked", "→ storage". Empty D1/D2 chests show "⏳ refills in N days".
4. ✅ `crate-ui.js` — auto-close + toast on last-item withdraw for D3+ chests.

**SC-B+ (bonus)**: 7-day rehydration for D1/D2 non-home chests.
- ✅ `crate-system.js` — `tryRehydrate()` / `rehydrateFloor()`: non-fixed slots re-roll frame tags + fresh loot after cooldown. Home floors (floor 1 tree) excluded.
- ✅ `game.js` — floor-load hook calls `rehydrateFloor()` with toast feedback.

### Phase SC-C: Smash-Only Breakables at D1 — DONE 2026-04-06

**Goal**: Exterior breakables are pure loot props with no container system.

1. ✅ `game.js` IO-8 — skip `createCrate()` for BREAKABLE tiles when depth === 1
2. ✅ `breakable-spawner.js` — skip container creation at depth 1
3. ✅ `crate-peek.js` — D1 breakables have no container, so `isSupply = false` → "Smash" labels naturally

**Remaining (content, not code)**:
4. Floor blockouts — add BREAKABLE placements to D1 exteriors (Promenade barrels, Garrison supply boxes)
5. Loot tables — configure D1-specific breakable drops if needed

### Phase SC-D: Storage Crates at D2 — DONE 2026-04-06

**Goal**: Interior breakables act as biome-specific storage with withdraw + daily refill.

1. ✅ `crate-system.js` — `createStorageCrate()`: TYPE.CHEST + `storage: true`, 4-8 slots, biome crate frames, `_hydrateChestLoot` items, `demandRefill: false`. 1-day refill via `tryRehydrate()` (shared with SC-B+ rehydration system, branching on `storage` flag for cooldown period).
2. ✅ `game.js` IO-8 — depth 2 BREAKABLE tiles create storage crates instead of deposit crates
3. ✅ `game.js` interact — D2 storage crates route to PeekSlots withdraw (skip quick-fill deposit logic)
4. ✅ `breakable-spawner.js` — D2 crates create storage crates + are indestructible ("This crate restocks each morning")
5. ✅ `crate-peek.js` — D2 storage crates show "📦 STORAGE" / "Open" (not "Fill Crate" or "Smash")

**Remaining (content, not code)**:
6. Floor blockouts — add BREAKABLE placements to D2 interiors (shop back rooms, guild storage)

### Phase SC-E: Aesthetic Cobwebs at D1/D2 — DONE 2026-04-06

**Goal**: Decorative cobwebs in exteriors and interiors that respawn on map load.

1. ✅ `cobweb-system.js` — new `'aesthetic'` cobweb type:
   - Renders visually (same barrier web as standalone)
   - Breaks when walked through (same as standalone), re-spawns on next floor load
   - No CobwebNode interaction (D1/D2 depth-gated by CobwebNode already)
   - No readiness contribution (excluded from `getReadinessBonus`)
   - `onFloorLoad()` auto-installs from `floorData.aestheticCobwebs[]`
   - `install()` accepts `'aesthetic'` type (skips corridor eligibility, allows overwrite)
2. ✅ Floor blockout format — `aestheticCobwebs: [{ x, y, corridorDir? }]` in floor data
3. ✅ `cobweb-renderer.js` — aesthetic type renders identically to standalone (barrier web)
4. Floor blockouts — add aesthetic cobweb positions to D1/D2 floors (content, not code)

**Depends on**: Nothing
**Risk**: Low — additive, no existing behavior changed

### Phase SC-F: Harvest-Only Corpses at D1/D2 (2h, Act 2 prerequisite)

**Goal**: Corpses from Act 2 PvE combat are harvest-only, no restock obligation.

1. `crate-system.js` — `createCorpse()` depth branch:
   - D1/D2: `demandRefill: false`, pre-filled loot slots, no SUIT_CARD slot
   - D3+: current behavior (restock + suit-card)
2. `corpse-peek.js` — D1/D2: show "Harvest" only (no "Restock" button). Skip BoxAnim coffin (corpses are fresh, not coffined).
3. `game.js` — D1/D2 corpse interact: skip PeekSlots deposit zones, open CrateUI withdraw-only
4. **Act 2 spawn system** (separate design): PvE combat resolver places CORPSE tile + creates harvest container at enemy death position

**Depends on**: Act 2 PvE combat system design
**Partially unblocked by**: SC-B (chest phase lifecycle pattern applies to corpses too)

---

## 4. Phase Dependencies

```
SC-A (Torch gate)          ─── ✅ DONE 2026-04-06
SC-B (Chest lifecycle)     ─── ✅ DONE 2026-04-06 (+ SC-B+ rehydration)
SC-C (D1 smash breakable)  ─── ✅ DONE 2026-04-06 (code; blockout placements pending)
SC-D (D2 storage crate)    ─── ✅ DONE 2026-04-06 (code; blockout placements pending)
SC-E (Aesthetic cobwebs)    ─── ✅ DONE 2026-04-06 (code; blockout placements pending)
SC-F (D1/D2 corpses)       ─── Act 2 PvE (deferred)
SC-G (Vendor registry)     ─── ✅ DONE 2026-04-06

Remaining work:
  Track 1: SC-E  (cobwebs — low risk, standalone, ~1.5h)
  Track 2: SC-F  (deferred to Act 2 PvE system design)
  Content: D1 BREAKABLE placements, D2 BREAKABLE placements, D1/D2 cobweb positions, D1/D2 vendor positions
```

---

## 5. Contract Enforcement Rules

For future floor builders and generated floors:

```
DEPTH 1 (floorN — exteriors):
  BREAKABLE    → smash-only, no container, loot drops
  CHEST        → randomly hydrated, 7-day rehydration (non-home), fixed slots for quest items
  TORCH        → decorative only (undecided — defer to Act 2)
  COBWEB       → aesthetic, respawn on load
  CORPSE       → Act 2 PvE: harvest-only
  TRAP         → not placed
  DETRITUS     → Act 2 post-battle litter (deferred)
  PUZZLE       → not placed
  SHOP         → outdoor stalls (Tide bazaar carts, Foundry forge storefront). VendorRegistry resolves faction.
  BAR_COUNTER  → not placed (exterior)

DEPTH 2 (floorN.N — interiors):
  BREAKABLE    → storage crate: withdraw + daily refill, indestructible
  CHEST        → withdraw-only (stash at home, small at others), 7-day rehydration (non-home)
  TORCH        → decorative only, not interactive, hose-blocked
  COBWEB       → aesthetic, respawn on load
  CORPSE       → Act 2 PvE: harvest-only
  TRAP         → not placed
  DETRITUS     → not placed
  PUZZLE       → not placed
  SHOP         → indoor shops (all 3 factions). VendorRegistry resolves faction + NPC.
  BAR_COUNTER  → tap-based rest mechanic (inn, tavern). 3 taps/visit, +energy/HP. Not a vendor.

DEPTH 3+ (floorN.N.N — dungeons):
  BREAKABLE    → deposit crate: fill slots → seal → coins, indestructible
  CHEST        → dual-phase: withdraw loot → restock empty → seal
  TORCH        → full interaction: refuel, hose-extinguish, hero-damage
  COBWEB       → player-installed, functional, readiness contribution
  CORPSE       → restock + harvest dual mode, suit-card matching
  TRAP         → hero-triggered → gleaner rearms
  DETRITUS     → walk-over pickup, crate-fill fuel
  PUZZLE       → 3×3 slider reset (when placed)
  SHOP         → not placed (no commerce in dungeons)
  BAR_COUNTER  → not placed (no rest stops in dungeons)
```

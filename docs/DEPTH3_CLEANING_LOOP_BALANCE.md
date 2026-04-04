# Depth-3 Cleaning Loop Balance — Dungeon Floor Tuning

**Created**: 2026-04-04
**Scope**: Readiness weight overrides for depth-3 (N.N.N) dungeon floors, new "adventurer detritus" breakable category, indestructible supply crates at depth-3, bag size increase, and the spatial tempo loop that avoids menu churn.
**Depends on**: READINESS_BAR_ROADMAP, SHOP_REFRESH_ECONOMY, PRESSURE_WASHING_ROADMAP, CORE_GAME_LOOP_AND_JUICE, engine/readiness-calc.js, engine/breakable-spawner.js, engine/crate-system.js, engine/card-authority.js
**First application**: Floor 2.2.1 (Deepwatch Cellars B1 / Hero's Wake)

---

## 0. Context — Why Depth-3 Needs Its Own Rules

Depth-3 floors are the player's first dungeon maintenance experience. The surface (depth 1) and interiors (depth 2) have shops, NPCs, and familiar town rhythms. Depth 3 is underground, hostile, and isolated. The player arrives with limited inventory, no shop access during the run, and a cleaning toolkit they're still learning.

The core readiness formula (Crate 35%, Clean 25%, Torch 20%, Trap 20%) was designed for mid-game floors where the player has a full inventory, shop access, and mastery of torch hydration mechanics. Applying it unmodified to the player's first dungeon creates three problems:

1. **Torch prep dominates item demand.** 5 unlit torches × 3 fuel slots = 15 items, plus water bottles for hydration. The player hasn't learned TorchPeek fuel hydration yet and will use the hose (PRESSURE_WASHING_ROADMAP §7), which destroys dry fuel — making careful torch prep impossible on first visit.

2. **Supply crates and loot breakables share the same tile type.** BREAKABLE (11) is both a loot piñata (break for drops) and a CrateSystem container (fill with items for readiness). The discovery flow says "break crates for fun" but readiness says "fill crates carefully." At depth-3, the verbs must separate.

3. **No supply chain during the run.** SHOP_REFRESH_ECONOMY §3.3 specs unlimited consumable supplies at shops, but shops live on depth-2 floors. The player must bring everything with them or find it in-dungeon. The item economy needs to be self-contained within the floor.

---

## 1. Per-Floor Readiness Weight Overrides

### 1.1 The Override Mechanism

ReadinessCalc currently uses hardcoded weights. Extend with a per-floor override table, checked before falling back to defaults:

```javascript
// In readiness-calc.js, new data structure:
var _overrides = {};  // { floorId: { crate, clean, torch, trap } }

function setWeightOverride(floorId, weights) {
  // weights: { crate, clean, torch, trap } — must sum to 1.0
  _overrides[floorId] = Object.freeze(weights);
}

function _getWeights(floorId) {
  // Check exact match first, then pattern match (e.g. '*.*.1' for all depth-3 level-1)
  if (_overrides[floorId]) return _overrides[floorId];
  // Depth-3 default override
  var depth = floorId.split('.').length;
  if (depth >= 3 && _overrides['__depth3']) return _overrides['__depth3'];
  return { crate: C_CRATE, clean: C_CLEAN, torch: C_TORCH, trap: C_TRAP };
}
```

### 1.2 Depth-3 Default Weights

| Sub-score | Standard | Depth-3 | Delta | Rationale |
|-----------|----------|---------|-------|-----------|
| **Crate** | 0.35 | **0.40** | +0.05 | Supply crates are the primary readiness verb at depth-3. New adventurer detritus breakables (§2) feed directly into crate filling. This is the heaviest single weight. |
| **Clean** | 0.25 | **0.30** | +0.05 | Blood cleaning is item-free and teachable. Rewarding it more at depth-3 gives the player a reliable path to readiness without inventory pressure. |
| **Torch** | 0.20 | **0.10** | −0.10 | The hose extinguishes torches as collateral (PW_ROADMAP §7.3). Players won't learn careful TorchPeek hydration until later. Faction narrative: "The Watchmen kept their torches poorly — the faction doesn't penalize sloppy torch work in their own cellars." |
| **Trap** | 0.20 | **0.20** | 0 | No change. Trap rearm is free (no items, 600ms each) and trivially perfect. Keeping it at 20% provides a reliable baseline. |

**Sum check:** 0.40 + 0.30 + 0.10 + 0.20 = 1.00 ✓

### 1.3 Narrative Framing

The reduced torch weight is NOT arbitrary balance tuning — it's a **factional property** of the Watchmen's dungeons. Each faction has different standards for what "ready" means:

- **Watchmen (depth-3 under 2.2):** Poor torch discipline. Torches are secondary. Emphasis on restocking and cleaning. (Torch 10%)
- **Foundry (depth-3 under future):** Precise machinery. Trap re-arm is critical. (Trap could be 30%, torch 15%, etc.)
- **Admiralty (depth-3 under future):** Deep-sea pressurized vaults. Torch prep is paramount for survival. (Torch 30%)

This means readiness weight overrides scale across the game as a **worldbuilding tool**, not just a balance lever. Each faction's dungeon teaches a different pillar of the maintenance loop.

### 1.4 Revised Readiness Math for 2.2.1

With depth-3 weights and the new breakable category (§2):

| Sub-score | Weight | Expected Score | Contribution |
|-----------|--------|---------------|-------------|
| Crate | 0.40 | 0.85–1.0 (see §2.3) | 0.34–0.40 |
| Clean | 0.30 | 0.85–0.95 | 0.255–0.285 |
| Torch | 0.10 | 0.30–0.50 (hose slop) | 0.03–0.05 |
| Trap | 0.20 | 1.0 (trivial) | 0.20 |
| **Core** | | | **0.825–0.935** |
| Corpse extra | 0.30 | 1.0 | 0.30 |
| Cobweb extra | 0.15 | 1.0 | 0.15 |
| Overclean | 0.10 | 0.5 | 0.05 |
| Stubs | 0.45 | 0.0 | 0.00 |
| **Extra** | | | **0.50** |
| **TOTAL** | | | **~132–143%** |

With a motivated player who does careful torch work instead of hosing: torch score jumps to 0.7–0.9, pushing total to **148–167%**. That brackets the 160% target nicely — the "aw bummer, gotta go restock" moment happens when the player is at ~90% core and realizes they need a few more crate fills to cross the threshold.

---

## 2. New Breakable Category: Adventurer Detritus

### 2.1 Concept

Heroes leave a mess. Beyond corpses and blood, they drop **gear fragments and consumable refuse** — dented shields, cracked potion flasks, torn pack straps, broken arrow shafts. These are the adventurer's detritus: not valuable enough for the heroes to carry, but useful to a resourceful janitor.

This is the new breakable category with the **highest readiness weight impact** on the floor, because breaking detritus yields the exact items needed to fill supply crates.

### 2.2 Detritus Types

| Name | Emoji | HP | Drops | Biome |
|------|-------|----|-------|-------|
| **Cracked Flask** | 🧪 | 1 | 1× potion_residue (crate fill: HP_FOOD), 40% water_bottle | dungeon, cellar, catacomb |
| **Dented Shield** | 🛡️ | 2 | 1× scrap_metal (crate fill: WILDCARD), 30% salvage | dungeon, foundry |
| **Torn Satchel** | 👝 | 1 | 1–2× mixed crate fill (random tag), 20% torch_oil | dungeon, all |
| **Broken Arrow Bundle** | 🏹 | 1 | 1× wood_scrap (crate fill: ENERGY), 30% torch_oil | dungeon, all |
| **Hero's Discarded Rations** | 🍖 | 1 | 1× stale_rations (crate fill: HP_FOOD), 40% food item | dungeon, all |

**Design properties:**
- All are 1–2 HP (quick to break, low friction)
- Every detritus item drops at least one crate-fill ingredient
- Secondary drops are utility items (torch oil, water bottles, food) that the player can use OR deposit
- They look obviously different from supply crates (emoji + name distinguish them)
- They spawn from hero carnage data — placed by HeroSystem alongside corpses

### 2.3 How Detritus Closes the Item Gap

Floor 2.2.1 has 7 supply crates with ~12 empty slots to fill. Detritus placement:

| Source | Count | Avg Crate-Fill Items | Avg Utility Items |
|--------|-------|---------------------|-------------------|
| Adventurer detritus (placed) | 8 | 8–10 | 3–4 |
| Rat kills (4 rats) | 4 | 1–2 (food) | 1–2 (salvage) |
| East Vault CHEST | 1 | 2–3 | 1–2 |
| Warden kill | 1 | 1 | 1–2 |
| **Total** | 14 | **12–16** | **6–10** |

12–16 crate-fill items vs 21+ bag slots = the player can hold a full sweep of crate-fill items plus supplies from the shop. The utility items (oil, water, food) provide supplemental torch fuel and healing. The economy is **self-contained** — no shop run needed for a first pass, but a shop run from Watchman's Post (add supply vendor to 2.2) lets a returning player top off for extra credit on subsequent visits.

### 2.4 Detritus Placement on 2.2.1

Detritus spawns alongside corpses — where heroes fought, they dropped things. Place detritus 1–2 tiles away from each CORPSE tile:

```
CORPSE (8,1)  → Cracked Flask at (9,1)
CORPSE (14,1) → Dented Shield at (13,1)
CORPSE (19,1) → Broken Arrow Bundle at (20,1)
CORPSE (2,7)  → Torn Satchel at (3,7)
CORPSE (21,6) → Cracked Flask at (20,6)
CORPSE (8,10) → Hero's Discarded Rations at (9,10)
CORPSE (11,14)→ Torn Satchel at (12,14), Dented Shield at (10,14)
```

8 detritus items from 7 corpse sites. The foyer corpse gets 2 (entry area = more loot to bootstrap the player).

### 2.5 Tile Representation

Detritus uses a new tile constant: `TILES.DETRITUS` (value TBD, suggest 32). It renders at half-height (0.5×) like BREAKABLE but uses distinct textures/sprites. On break, the tile converts to EMPTY and items spill.

Detritus is tracked by BreakableSpawner with a `category: 'detritus'` flag that distinguishes it from supply crates in the breakable state array.

---

## 3. Supply Crate Indestructibility at Depth-3

### 3.1 The Rule

**At depth ≥ 3 (N.N.N floors), BREAKABLE tiles with CrateSystem containers are indestructible.** The player can fill them but not smash them.

At depth 1 (N floors, exterior/town), breakable crates remain destructible — they're loot sources in the surface world.

At depth 2 (N.N floors, interiors), case-by-case per blockout. Default: indestructible (interiors are maintained spaces).

### 3.2 Implementation

In `breakable-spawner.js`, extend `hitBreakable()`:

```javascript
function hitBreakable(x, y, floorId) {
  var b = _getBreakable(x, y);
  if (!b) return null;

  // Depth-3+ supply crates are indestructible
  if (b.category !== 'detritus' && _getDepth(floorId) >= 3) {
    // Toast: "This crate is bolted down. Fill it, don't smash it."
    return { blocked: true, reason: 'crate_bolted' };
  }

  // Normal breakable logic...
  b.hp--;
  if (b.hp > 0) return null;
  // ... destroy, spill loot
}
```

**Detritus is always breakable** regardless of depth — it's debris, not infrastructure.

### 3.3 Player Communication

When the player tries to smash a supply crate at depth-3:
- InteractPrompt changes from `[OK] ⚔️ Break` to `[OK] 📦 Fill`
- If they attack it anyway: toast "This supply crate is bolted to the floor. Use [OK] to fill it."
- CratePeek opens on interact, showing slots to fill

This verb separation is critical: **break** is for detritus, **fill** is for crates. Two different objects, two different actions.

---

## 4. Bag Size: Base 21 + N (Equipped Item Bonus)

### 4.1 The Change

**MAX_BAG: 12 → 21 + N** (where N = sum of `bag_slots` effects from equipped passive items)

Base 21 is generous by design. The cleaning loop at depth-3 generates 10–16 items per sweep (detritus + rat drops + chest loot). With 21 slots the player can hold a full sweep plus supplies brought from the shop, with room for incidental pickups. The loop flows without constant dump-and-return.

N (equipped item bonus) creates the progression hook: early game with no buff items, you have 21. With a Foreman's Harness (+4), you're at 25. A late-game player with two bag-expanding passives might hit 28–30, enough to fully stock a large dungeon in one carry.

### 4.2 Implementation

```javascript
// card-authority.js
var BASE_BAG = 21;

function getMaxBag() {
  var bonus = 0;
  // Sum bag_slots effects from all equipped passive items
  var equipped = _getEquipped();
  for (var i = 0; i < equipped.length; i++) {
    var fx = _getItemEffects(equipped[i]);
    for (var j = 0; j < fx.length; j++) {
      if (fx[j].type === 'bag_slots') bonus += fx[j].value;
    }
  }
  return BASE_BAG + bonus;
}
```

All existing references to MAX_BAG become calls to `getMaxBag()`. Bag UI re-renders when equipment changes.

### 4.3 Stash Implications

MAX_STASH stays at 20 for now. With base bag at 21, stash is actually smaller than bag — this is fine because stash serves a different purpose (death-safe persistent storage, not field carry). Stash may scale via bonfire upgrades (future).

### 4.4 Starting Class Interaction

New players start with 10–100g depending on class (see SHOP_REFRESH_ECONOMY buff tier §). A player who spends their starting gold on a Cargo Sling (+1, 9g) or Pack Mule Strap (+3, 18g) gets immediate bag expansion. The 21+N model means even the cheapest bag buff item has a meaningful impact at game start.

---

## 5. Supply Restock Loop — Floor 2 (Lantern Row)

### 5.1 The Travel Loop

Supplies are purchased on **Floor 2 (Lantern Row, depth-1 exterior)** — the marketplace with 7 existing shop stalls (3 Tide, 2 Foundry, 2 Admiralty). Every shop stall offers the unlimited supply stock alongside its faction card inventory. The restock loop is:

```
2.2.1 (dungeon, fill bags with loot)
  ↑ STAIRS_UP
2.2 (Watchman's Post, transit floor)
  ↑ DOOR_EXIT
2 (Lantern Row — SHOP HERE, buy supplies 1-10g each)
  ↓ DOOR to 2.2
2.2 (transit)
  ↓ STAIRS_DN
2.2.1 (dungeon, unload supplies into crates)
```

Two floor transitions each way. This is deliberate — the trip up to buy cheap junk and back down is a **pace-breaker** that separates dungeon runs into "explore/loot" and "restock/fill" halves. It's the "aw bummer, gotta go restock" moment from the design brief, but supplies are so cheap (30–50g for a full bag) that the cost is travel time, not gold.

### 5.2 Supply Pricing (Updated)

SHOP_REFRESH_ECONOMY §6.5 now defines junk-tier supply prices (1–10g). Key items for the 2.2.1 loop:

| Item | Price | Purpose |
|------|-------|---------|
| stale_rations | 2g | Crate fill (HP_FOOD tag) |
| generic_salvage | 3g | Crate fill (WILDCARD tag) |
| torch_oil | 3g | Torch fuel (generic, partial score) |
| water_bottle | 1g | Hydration / extinguish |
| cleaning_rag | 1g | Cheapest cleaning tool |
| mop_head | 4g | Mid-tier cleaning speed |

A player with 40g (one dungeon loot haul) can buy 12 crate-fill items + a few water bottles and fully stock their bag. The gold barrier to restocking is near zero.

### 5.3 No Shop on 2.2 (Watchman's Post)

Floor 2.2 remains shop-free. It's a military staging area, not a marketplace. The NPC watchman may comment on the player's readiness ("You've been down there a while. Shops are topside if you need supplies.") to nudge the player toward Floor 2, but there's no commercial function on 2.2 itself.

### 5.4 Schedule Independence

Per SHOP_REFRESH_ECONOMY §2.3, supply stock is always available regardless of card refresh schedules. The supply vendor is a utility, not a scarcity mechanic. Card trading creates the economic tension; supply buying is the reliable baseline. A sold-out shop (all 5 card slots bought) still sells supplies.

---

## 6. The Tempo Loop — Spatial Flow, Not Menu Churn

### 6.1 The Problem

Without deliberate tempo design, the cleaning loop degenerates into:

```
MENU-HEAVY (bad):
  open menu → select item → deposit → close menu → walk 1 tile →
  open menu → select item → deposit → close menu → walk 1 tile →
  break thing → open menu → pick up item → close menu → repeat
```

The player spends more time in menus than in the dungeon. Every action requires opening inventory. This kills the spatial flow of exploration.

### 6.2 The Desired Tempo

```
SPATIAL (good):
  walk → fight rat → walk → break detritus (auto-loot) → walk →
  face crate → quick-fill (auto-match) → walk → fight rat → walk →
  break detritus → walk → process corpse → walk → face crate →
  quick-fill → walk → rearm trap → walk → scrub blood → ...
```

Every action is a spatial verb: face a thing, press interact. Items flow in and out of the bag without inventory screens. The dungeon IS the interface.

### 6.3 Enabling Mechanics

#### 6.3a Auto-Loot on Break

When detritus or breakable props are destroyed, dropped items go **directly into bag** if space permits. No loot popup, no "pick up?" dialog. The items appear in the bag immediately with a brief HUD toast: "+1 potion_residue" (fades in 1.5s).

If bag is full: items drop as floor pickups (existing behavior). Toast: "Bag full — items on floor."

This eliminates 1 menu interaction per break.

#### 6.3b Quick-Fill on Crate Interact

When the player interacts with a supply crate, instead of opening CratePeek's full slot UI, a **quick-fill** pass runs first:

```javascript
function quickFill(crateX, crateY, floorId) {
  var crate = CrateSystem.getContainer(crateX, crateY, floorId);
  var filled = 0;
  for (var i = 0; i < crate.slots.length; i++) {
    if (crate.slots[i].state === 'empty') {
      var match = CardAuthority.findBagItemByTag(crate.slots[i].frameTag);
      if (match) {
        CardAuthority.removeFromBag(match.id);
        CrateSystem.fillSlot(crateX, crateY, floorId, i, match.id);
        filled++;
      }
    }
  }
  if (filled > 0) {
    Toast.show('📦 Filled ' + filled + ' slot' + (filled > 1 ? 's' : ''));
  }
  // If crate still has empty slots with no matching bag items: THEN open CratePeek
  if (CrateSystem.hasEmptySlots(crateX, crateY, floorId)) {
    CratePeek.open(crateX, crateY, floorId);  // manual fill for remaining
  } else {
    CrateSystem.seal(crateX, crateY, floorId);  // auto-seal if full
    Toast.show('📦 Crate sealed! +' + sealReward + 'g');
  }
}
```

**Best case:** Player walks up, presses interact, bag items auto-match slots, crate seals, gold awarded. Zero menu time.

**Partial case:** Some slots fill, CratePeek opens for the rest. Player manually chooses from bag.

**Worst case (no matching items):** CratePeek opens normally. Player sees what's needed and goes hunting.

This transforms crate filling from a 4-step menu interaction into a 1-button spatial action.

#### 6.3c Scrub-on-Walk (Passive Cleaning)

When the player walks over a blood tile with a cleaning tool equipped (rag/mop/brush in EQUIP consumable slot), **1 blood layer is automatically scrubbed** per tile traversal. No interaction needed.

- Only triggers when moving (not standing still)
- Only removes 1 layer per tile per traversal (must re-walk for deeper stains)
- Tool durability still decrements
- Toast: subtle red flash on tile, no text

This means exploration IS cleaning. Walking through a blood-stained corridor cleans it. The player doesn't stop to scrub every tile — they explore naturally and cleaning happens.

Active scrubbing (face tile + interact) still exists for 3-layer stains that need focused attention.

### 6.4 Placement Interleave Pattern

The blockout should place readiness objects so the player naturally alternates actions while walking the loop. For 2.2.1's Q-shaped ring:

```
FOYER (entry):
  [detritus] → [rat] → [crate fill] → [detritus]

SOUTH HALL (ring entry):
  [blood walk] → [trap rearm] → [detritus near corpse] → [crate fill]

EAST PASSAGE:
  [rat] → [blood walk] → [cobweb] → [detritus near corpse]

NORTH HALL (back of Q):
  [corpse processing ×3] → [detritus ×3] → [trap rearm] → [VAULT WARDEN]

WEST PASSAGE:
  [rat] → [blood walk] → [cobweb] → [corpse]

WEST QUARTERS (alcove):
  [bed rest] → [table inspect] → [cobweb]

EAST VAULT (alcove):
  [chest loot] → [crate fill] → [detritus]

JUNCTION (back to foyer):
  [crate fill] → [crate fill]
```

The player's clockwise sweep alternates: combat → break → fill → walk/clean → combat → break → fill. No two menu-requiring actions are adjacent. The blood tiles they walk through clean passively. Traps are quick interactions between combat encounters.

---

## 7. Summary of Changes

| Change | Scope | Files Affected | Status |
|--------|-------|----------------|--------|
| Per-floor readiness weight overrides | System | readiness-calc.js | ✅ Done |
| Depth-3 default: Crate 40%, Clean 30%, Torch 10%, Trap 20% | Data | readiness-calc.js (init call) | ✅ Done |
| Adventurer detritus system (tile, sprites, interaction) | New feature | tiles.js, detritus-sprites.js, game.js, interact-prompt.js, minimap.js | ✅ Done |
| 8 detritus placements on 2.2.1 | Blockout | floor-blockout-2-2-1.js | ✅ Done |
| Supply crates indestructible at depth ≥ 3 | Rule | breakable-spawner.js, game.js | ✅ Done |
| MAX_BAG: 12 → 21+N (N from equipped bag_slots) | Constant | card-authority.js, game.js, card-transfer.js, status-bar.js, menu-faces.js | ✅ Done |
| crateFillTag matching in CrateSystem | System | crate-system.js | ✅ Done |
| Supply stock UI on existing Floor 2 shops | System | shop.js (SUPPLY_STOCK + buySupply), vendor-dialog.js (supply menu) | ✅ Done |
| Auto-loot on breakable destroy | UX | game.js (_smashBreakable) | ✅ Done |
| Quick-fill on crate interact | UX | game.js (_quickFillCrate), crate-system.js (doesItemMatch) | ✅ Done |
| Scrub-on-walk passive cleaning | UX | game.js (_onMoveFinish) | ✅ Done |
| InteractPrompt verb split: "Smash" vs "Fill" | UX | interact-prompt.js | ✅ Done |

---

## 8. Cross-References

| Section | Links To |
|---------|----------|
| §1 Weight Overrides | READINESS_BAR_ROADMAP §core weights — extends with per-floor data |
| §1.3 Faction Weights | CORE_GAME_LOOP §2 (Three Pillars) — each faction emphasizes different pillars |
| §2 Detritus | GONE_ROGUE_ASSET_UTILIZATION_ROADMAP — new breakable variant |
| §3 Indestructible Crates | CRATEUI_INTERACTION_OVERHAUL — verb separation in UI |
| §4 Bag Size | B5_INVENTORY_INTERACTION_DESIGN — bag zone capacity |
| §5 Supply Vendor | SHOP_REFRESH_ECONOMY §3.3 — unlimited supply stock spec |
| §6 Tempo | CORE_GAME_LOOP §3 (Kingdom Two Crowns) — "every action moves a bar" |
| §6.3b Quick-Fill | CRATEUI_INTERACTION_OVERHAUL — extends CratePeek flow |
| §6.3c Scrub-on-Walk | PRESSURE_WASHING_ROADMAP §9 — parallels hose passive cleaning |

---

*This document defines the depth-3 cleaning loop balance. It should be implemented alongside the floor 2.2.1 blockout activation (Track B) and references systems from Track A (torch slots, crate UI).*

# Unified Inventory Metadata Contract — Dungeon Gleaner (v1)

**Effective**: 2026-03-27
**Adapted from**: EyesOnly `UNIFIED_INVENTORY_METADATA_CONTRACT.md` + `COLLECTIBLES_CANON.md`
**Biome Plan reference**: v4 — Dungeon Gleaner, DC Jam 2026

---

## Purpose

Defines the canonical schema for every item, card, collectible, and salvage part in Dungeon Gleaner.
All runtime item objects must conform to one of the schemas below. No ad-hoc item shapes allowed.

Two registries live in `data/`:
- `data/items.json` — consumables, equipment, salvage parts, keys (`ITM-###`)
- `data/cards.json` — combat action cards (`ACT-###`)

Enemies are defined in `data/enemies.json` (`ENM-###`).
Drop tables are in `data/loot-tables.json`.

---

## Resource Color Palette

Borrowed directly from EyesOnly `RESOURCE_COLOR_SYSTEM.md`.
These colors are permanent — no percentage-based changes, no overrides.

| Resource    | Symbol | Hex       | Notes                                      |
|-------------|--------|-----------|--------------------------------------------|
| **HP**      | ♥      | `#FF6B9D` | Vibrant pink. Walk-over food restores.     |
| **Energy**  | △      | `#00D4FF` | Electric blue. Used to play cards.         |
| **Battery** | ◈      | `#00FFA6` | Sickly cyan-green. Powers equipment slots. |
| **Gold**    | ¢      | `#FFFF00` | Twinkly gold. Sell at faction shops.       |
| **Cards**   | 🂠     | `#800080` | Card purple. Drops from enemies & chests.  |

### RPS Element Colors (Dungeon Gleaner-specific)

| Element  | Hex       | Beats    | Loses to |
|----------|-----------|----------|----------|
| 🔥 Flame | `#FF6030` | Frost    | Storm    |
| ❄️ Frost  | `#60C8FF` | Storm    | Flame    |
| ⚡ Storm  | `#C060FF` | Flame    | Frost    |

**Combat math**: Elemental advantage = ×1.5 damage. Elemental disadvantage = ×0.75 damage.
Neutral cards deal ×1.0 regardless of enemy element.

---

## Canonical Collectible Categories

Only these categories exist. Walk-over pickups trigger Toast notification + future OverheadAnimator.

| # | Category      | Symbol | Color     | Pickup Behavior                              |
|---|---------------|--------|-----------|----------------------------------------------|
| 1 | **Gold**      | ¢      | `#FFFF00` | Walk-over → `Player.addCurrency(n)`          |
| 2 | **Battery**   | ◈      | `#00FFA6` | Walk-over → future `Player.addBattery(n)`    |
| 3 | **Food**      | emoji  | per type  | Walk-over → HP/Energy restore (HOT for HP)  |
| 4 | **Cards**     | 🂠     | `#800080` | Walk-over → added to hand or deck overflow   |
| 5 | **Salvage**   | emoji  | white     | MenuBox harvest UI → bag                     |
| 6 | **Keys**      | 🗝     | `#FFD700` | Walk-over → Player flag set                  |
| 7 | **Equipment** | emoji  | rarity    | Walk-over → bag (or prompt if full)          |
| 8 | **Restock Supply** | emoji | per frame | Bag item → drag to crate slot |

Walk-over detection happens in `Game._onMoveFinish()` for COLLECTIBLE tiles.
Salvage is MenuBox-mediated (CORPSE tiles), not walk-over.

---

## Item Schema (`data/items.json` — `ITM-###`)

```json
{
  "id":          "ITM-000",
  "name":        "string",
  "emoji":       "string",
  "type":        "consumable | equipment | salvage | key | collectible",
  "subtype":     "food | vice | tool | relic | part | faction_key",
  "rarity":      "common | uncommon | rare | epic | legendary",
  "stackable":   true,
  "maxStack":    10,
  "equipSlot":   "none | passive | active | key",
  "element":     "flame | frost | storm | null",
  "effects": [
    { "type": "hp | energy | battery | currency | damage_bonus", "value": 0 }
  ],
  "synergyTags": ["string"],
  "lootProfile": "undead | construct | organic | marine | breakable | shop",
  "factionValue": {
    "tide":     0,
    "foundry":  0,
    "admiralty": 0
  },
  "description": "string"
}
```

### Field Notes

- `type: "collectible"` — ground-spawn walk-over items (gold, battery, food). Not in bag.
- `type: "salvage"` — generated at runtime by Salvage module. `id` is `partId + '_' + timestamp`.
- `effects` — applied on consume or equip. `damage_bonus` is a flat add to next card played.
- `factionValue` — only on salvage parts. Used by `Salvage.getSellPrice()` logic reference.
- `lootProfile` — matches `enemy_resource_profiles` and `breakable_loot` keys in loot-tables.json.
- `restockValue` — (new, optional) frame tags this item matches for crate slot filling. Array of strings from frame tag enum. Items with matching `subtype` or `synergyTags` are auto-detected, but `restockValue` provides explicit override.

---

## Card Schema (`data/cards.json` — `ACT-###`)

```json
{
  "id":      "ACT-000",
  "name":    "string",
  "emoji":   "string",
  "element": "flame | frost | storm | neutral",
  "rarity":  "common | uncommon | rare | epic",
  "cost": {
    "type":  "free | energy | battery | hp",
    "value": 0
  },
  "effects": [
    {
      "type":   "damage | defense | hp | energy | battery | status",
      "value":  0,
      "target": "enemy | self"
    }
  ],
  "synergyTags": ["string"],
  "description": "string",
  "_designNote": "optional"
}
```

### Starter Deck (replaces hardcoded STARTER_CARDS in card-system.js)

| ID       | Name          | Element | Cost  | Primary Effect              | Tags              |
|----------|---------------|---------|-------|-----------------------------|-------------------|
| ACT-001  | Slash         | neutral | free  | 2 damage                    | melee             |
| ACT-002  | Block         | neutral | free  | 2 defense (temp HP)         | defensive         |
| ACT-003  | Mend          | neutral | free  | +3 HP                       | medical           |
| ACT-004  | Cinder Strike | flame   | free  | 3 damage                    | flame, melee      |
| ACT-005  | Frost Shard   | frost   | free  | 3 damage                    | frost, ranged     |
| ACT-006  | Arc Bolt      | storm   | free  | 3 damage                    | storm, ranged     |
| ACT-007  | Embers        | flame   | free  | 2 damage + 1 burn (dot)     | flame, status     |
| ACT-008  | Glacial Guard | frost   | free  | 3 defense                   | frost, defensive  |
| ACT-009  | Thunder Clap  | storm   | free  | 4 damage                    | storm, melee      |
| ACT-010  | Rummage       | neutral | free  | +1 card drawn this combat   | utility           |

---

## Enemy Schema (`data/enemies.json` — `ENM-###`)

```json
{
  "id":            "ENM-000",
  "name":          "string",
  "emoji":         "string",
  "biomes":        ["cellar", "foundry", "sealab"],
  "tier":          "standard | elite | boss",
  "element":       "flame | frost | storm | neutral",
  "lootProfile":   "undead | construct | organic | marine",
  "hp":            4,
  "str":           1,
  "dex":           1,
  "stealth":       0,
  "awarenessRange": 4,
  "isElite":       false,
  "nonLethal":     false,
  "flavor":        "string",
  "_designNote":   "optional"
}
```

### Loot Profile → Resource Drop Behavior

| lootProfile | Currency | Battery | Food | Gold bias |
|-------------|----------|---------|------|-----------|
| undead      | medium   | low     | none | key_frags |
| construct   | high     | high    | none | none      |
| organic     | low      | none    | high | none      |
| marine      | medium   | medium  | med  | relics    |

---

## Breakable Schema (in `data/loot-tables.json`)

Breakable props live in biome prop lists. Each breakable def:

```json
{
  "name":     "Barrel",
  "emoji":    "🛢️",
  "hp":       2,
  "breakable": true,
  "explosive": false,
  "drops":    "breakable_default",
  "noise":    1.0,
  "_designNote": "optional"
}
```

`drops` references a key in `loot-tables.json:breakable_loot`.
Items that spill out become COLLECTIBLE tiles (walk-over pickup) or CORPSE tiles (salvage).

---

## Crate Slot Schema (Gleaner Pivot)

Crates (and other restockable containers) have an array of **slots** that the player can fill with items. This extends the existing Breakable Schema with a `slots[]` field.

### Restockable Breakable Schema (extends Breakable)

```json
{
  "name":       "Crate",
  "emoji":      "📦",
  "hp":         3,
  "breakable":  true,
  "restockable": true,
  "explosive":  false,
  "drops":      "crate",
  "noise":      1.5,
  "slotCount":  { "min": 2, "max": 5 },
  "frameWeights": {
    "hp_food":     30,
    "energy_food": 20,
    "potion":      15,
    "scroll":      10,
    "weapon":       5,
    "battery":     10,
    "gem":          5,
    "wildcard":     5
  }
}
```

### Runtime Slot Instance

Generated at floor generation time by `CrateSystem.hydrate(breakableDef)`:

```json
{
  "crateId":    "crate_0_1_1_42",
  "breakableRef": "📦",
  "totalSlots": 4,
  "slots": [
    { "index": 0, "frame": "hp_food",     "state": "filled",        "item": "ITM-001" },
    { "index": 1, "frame": "energy_food", "state": "empty",         "item": null },
    { "index": 2, "frame": "scroll",      "state": "empty",         "item": null },
    { "index": 3, "frame": "wildcard",    "state": "player_filled", "item": "ITM-040" }
  ],
  "sealed":     false,
  "sealReward": null
}
```

### Slot Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `crateId` | string | Unique per-instance ID: `crate_{floorId}_{tileIndex}` |
| `breakableRef` | string | Emoji ref to biome_props entry |
| `totalSlots` | number | Rolled from `slotCount.min`–`slotCount.max` at generation |
| `slots[].index` | number | 0-based position in the crate |
| `slots[].frame` | string | Frame tag — the ideal item category for this slot |
| `slots[].state` | enum | `"filled"` (naturally hydrated), `"empty"`, `"player_filled"` |
| `slots[].item` | string\|null | Item ID if filled, null if empty |
| `sealed` | boolean | True once all slots are filled (any state except "empty") |
| `sealReward` | object\|null | `{ coins: N, card: "ACT-###"|null }` — rolled on seal |

### Frame Tag → Resource Color Mapping

Frame tags visually indicate the ideal item category. The frame border color uses the canonical RESOURCE_COLOR system:

| Frame Tag | Color | Hex | Ideal Items | Example IDs |
|-----------|-------|-----|-------------|-------------|
| `hp_food` | ♥ Vibrant Pink | `#FF6B9D` | Food that restores HP | ITM-001 (Smoked Fish), ITM-004 (Sailor's Rum) |
| `energy_food` | △ Electric Blue | `#00D4FF` | Food that restores Energy | ITM-003 (Energy Ration), ITM-005 (Bioluminescent Coral) |
| `battery` | ◈ Sickly Green | `#00FFA6` | Battery cells, power packs | ITM-020 (Battery Cell), ITM-021 (Power Pack) |
| `potion` | ♥ Vibrant Pink | `#FF6B9D` | Health/Energy potions (shop items) | ITM-050+ (future potion range) |
| `scroll` | 🂠 Purple | `#800080` | Arcane scrolls, spell components | ITM-060+ (future scroll range) |
| `weapon` | Element-colored | Per element | Element-tagged equipment | ITM-030 (Wrecker's Mallet), ITM-031 (Frosted Lens) |
| `gem` | ¢ Gold | `#FFFF00` | Gems, relics, valuables | ITM-033 (Bone Hook), future gem items |
| `wildcard` | White | `#FFFFFF` | Accepts any item at base rate | Any |

### Frame Matching Rules

| Condition | Coin Yield | Notes |
|-----------|-----------|-------|
| Item matches frame tag | 2–3 coins | Check item `subtype` or `synergyTags` against frame tag |
| Item has matching element (weapon frame) | 2–3 coins | Item `element` matches frame element |
| Item mismatches frame | 1 coin | Any item fills any slot — no rejection |
| Rare+ item matched | 3–5 coins | `rarity` ≥ uncommon AND frame match |

### Hydration Formula

Natural hydration simulates a post-Hero crate (some items taken, some remaining):

```
filledSlots = floor(totalSlots × random(0.3, 0.7))
```

Hydrated items are drawn from the crate's `drops` loot table (existing `breakable_loot` keys). Each hydrated slot gets a frame-appropriate item from the table.

### Seal Reward Table

Rolled once when all slots transition to non-empty state:

| d100 Roll | Reward |
|-----------|--------|
| 01–50 | Nothing extra |
| 51–75 | +5 bonus coins |
| 76–88 | Common combat card (from biome `card_drops` table) |
| 89–95 | Uncommon combat card |
| 96–99 | Rare combat card |
| 00 | **Legendary combat card** |

---

## Walk-Over Pickup Pipeline

Adapted from EyesOnly's 6-step pipeline (COLLECTIBLES_CANON.md):

```
1. Player moves to tile
2. Game._onMoveFinish() checks tile type:
   - TILES.COLLECTIBLE → WorldItems.pickupAt(x, y)
   - TILES.CORPSE      → Salvage.hasHarvests() → _harvestCorpse()
3. Apply resource: Player.addCurrency() / heal() / addToBag()
```

> **Extraction note:** `_harvestCorpse()` was extracted from `game.js` to `engine/corpse-actions.js` as `CorpseActions.harvestCorpse()`.
4. Remove from floor: grid[y][x] = TILES.EMPTY, WorldItems.removeAt(x, y)
5. Animate: Toast.show(emoji + name, type)
   (future: OverheadAnimator.showGenericExpression with RESOURCE_COLOR)
6. HUD.updatePlayer(Player.state())
```

**Key doctrine**: Walk-over collectibles are REMOVED from the floor immediately on step.
Salvage parts require the harvest MenuBox (CORPSE tile). They are never auto-collected.

---

## Anti-Patterns (DO NOT)

- **DO NOT** add item types outside the canonical categories
- **DO NOT** create ad-hoc item shapes without `id` and `type` fields
- **DO NOT** hardcode item stats in engine modules — read from `data/items.json`
- **DO NOT** use yellow `#FFFF00` for anything that is not gold currency
- **DO NOT** use cyan `#00FFA6` for anything that is not battery
- **DO NOT** treat CORPSE tiles as walk-over — they require interact + MenuBox
- **DO NOT** auto-collect salvage parts — the Gleaner must actively choose what to take
- **DO NOT** create a third overhead animation system (Toast covers jam scope)
- **DO NOT** reject items from crate slots based on frame mismatch — all items fill all slots, frame only affects coin yield
- **DO NOT** allow sealed crates to be re-opened — once sealed, a crate is done until the next Hero cycle destroys it
- **DO NOT** hardcode seal reward tables — read from `data/loot-tables.json:crate_seal_rewards`

---

## Migration Notes

- `STARTER_CARDS` in `card-system.js` will be replaced with a load from `data/cards.json`
- `ENEMY_TYPES` array in `enemy-ai.js` will be replaced with a load from `data/enemies.json`
- `LootTables.generateDrop()` stub will be replaced with a full implementation reading `data/loot-tables.json`
- Salvage PARTS array in `salvage.js` is authoritative for salvage items — no JSON needed (runtime-generated)
- `breakable-spawner.js` breakable instances will gain a `slots[]` array for restockable props
- New `CrateSystem` module will handle slot generation, hydration, fill/seal logic
- `data/loot-tables.json` will add `crate_seal_rewards` and `crate_hydration` sections
- New item range ITM-050 to ITM-069 reserved for shop-sold potions (restock supplies)
- New item range ITM-060 to ITM-079 reserved for scrolls (restock supplies)

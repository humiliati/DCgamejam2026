// ============================================================
// data/loot-tables.js — AUTO-GENERATED (DOC-110 P5.4)
// ------------------------------------------------------------
// Source:     data/loot-tables.json
// Generator:  tools/generate-loot-tables-sidecar.js
// DO NOT hand-edit: the next pre-commit sidecar regen will
// overwrite any changes. Edit the JSON and let the hook (or
// `node tools/generate-loot-tables-sidecar.js` directly) rebuild.
// ============================================================
window.LOOT_TABLES_DATA = {
  "_meta": {
    "generatedAt": "2026-04-18T03:28:55.599Z",
    "generator": "tools/generate-loot-tables-sidecar.js",
    "source": "data/loot-tables.json",
    "profileCount": 4,
    "tierCount": 3,
    "biomeCount": 3
  },
  "_comment": "Dungeon Gleaner loot-tables.json — read by LootTables engine module",
  "version": "1.0.0",
  "enemy_resource_profiles": {
    "_comment": "Per lootProfile type — base drop weights. Tier multipliers applied on top.",
    "undead": {
      "currency": {
        "enabled": true,
        "chance": 0.55,
        "min": 1,
        "max": 4,
        "bias": "key_frags"
      },
      "battery": {
        "enabled": true,
        "chance": 0.2,
        "min": 1,
        "max": 1
      },
      "food": {
        "enabled": false
      },
      "card": {
        "enabled": true,
        "chance": 0.3
      },
      "salvage": {
        "enabled": true,
        "chance": 0.6,
        "pool": [
          "bone",
          "organ",
          "scale"
        ]
      },
      "key_frag": {
        "enabled": true,
        "chance": 0.25
      }
    },
    "construct": {
      "currency": {
        "enabled": true,
        "chance": 0.7,
        "min": 2,
        "max": 6
      },
      "battery": {
        "enabled": true,
        "chance": 0.75,
        "min": 1,
        "max": 2
      },
      "food": {
        "enabled": false
      },
      "card": {
        "enabled": true,
        "chance": 0.25
      },
      "salvage": {
        "enabled": true,
        "chance": 0.65,
        "pool": [
          "scrap",
          "ember",
          "crystal"
        ]
      },
      "key_frag": {
        "enabled": false
      }
    },
    "organic": {
      "currency": {
        "enabled": true,
        "chance": 0.3,
        "min": 1,
        "max": 2
      },
      "battery": {
        "enabled": false
      },
      "food": {
        "enabled": true,
        "chance": 0.7,
        "pool": [
          "common_food",
          "uncommon_food"
        ]
      },
      "card": {
        "enabled": true,
        "chance": 0.2
      },
      "salvage": {
        "enabled": true,
        "chance": 0.5,
        "pool": [
          "bone",
          "organ",
          "ichor"
        ]
      },
      "key_frag": {
        "enabled": false
      }
    },
    "marine": {
      "currency": {
        "enabled": true,
        "chance": 0.55,
        "min": 2,
        "max": 5,
        "bias": "relics"
      },
      "battery": {
        "enabled": true,
        "chance": 0.45,
        "min": 1,
        "max": 2
      },
      "food": {
        "enabled": true,
        "chance": 0.4,
        "pool": [
          "seafood"
        ]
      },
      "card": {
        "enabled": true,
        "chance": 0.35
      },
      "salvage": {
        "enabled": true,
        "chance": 0.55,
        "pool": [
          "crystal",
          "ichor",
          "scale"
        ]
      },
      "key_frag": {
        "enabled": false
      }
    }
  },
  "enemy_tier_multipliers": {
    "_comment": "Multiplied against profile base values. Boss always drops something.",
    "standard": {
      "currency_max_mult": 1,
      "card_chance_add": 0,
      "salvage_chance_add": 0,
      "guaranteed_drop": false,
      "xp": 10
    },
    "elite": {
      "currency_max_mult": 2,
      "card_chance_add": 0.15,
      "salvage_chance_add": 0.2,
      "guaranteed_drop": true,
      "guaranteed_type": "card",
      "xp": 30
    },
    "boss": {
      "currency_max_mult": 4,
      "card_chance_add": 0.5,
      "salvage_chance_add": 0.5,
      "guaranteed_drop": true,
      "guaranteed_type": "key",
      "xp": 100,
      "bonus_relic": true
    }
  },
  "card_drops": {
    "_comment": "Weighted card rarity pools per biome. Sum of weights doesn't need to equal 100.",
    "cellar": {
      "common": 70,
      "uncommon": 22,
      "rare": 7,
      "epic": 1
    },
    "foundry": {
      "common": 55,
      "uncommon": 30,
      "rare": 12,
      "epic": 3
    },
    "sealab": {
      "common": 40,
      "uncommon": 35,
      "rare": 18,
      "epic": 7
    },
    "_element_bias": {
      "_comment": "When a card drops in a biome, element weights favor biome theme.",
      "cellar": {
        "flame": 10,
        "frost": 40,
        "storm": 30,
        "neutral": 20
      },
      "foundry": {
        "flame": 50,
        "frost": 10,
        "storm": 20,
        "neutral": 20
      },
      "sealab": {
        "flame": 10,
        "frost": 35,
        "storm": 40,
        "neutral": 15
      }
    }
  },
  "breakable_loot": {
    "_comment": "Drop tables for breakable props. 'drops' field on breakable def references a key here.",
    "breakable_default": {
      "currency": {
        "chance": 0.6,
        "min": 1,
        "max": 4
      },
      "battery": {
        "chance": 0.2,
        "min": 1,
        "max": 1
      },
      "food": {
        "chance": 0.25,
        "pool": "common_food"
      },
      "card": {
        "chance": 0.1
      },
      "nothing": {
        "chance": 0.25
      }
    },
    "barrel": {
      "_biome_variant": "cellar",
      "currency": {
        "chance": 0.5,
        "min": 1,
        "max": 3
      },
      "food": {
        "chance": 0.4,
        "pool": "common_food"
      },
      "battery": {
        "chance": 0.1,
        "min": 1,
        "max": 1
      },
      "nothing": {
        "chance": 0.3
      }
    },
    "crate": {
      "_biome_variant": "cellar",
      "currency": {
        "chance": 0.7,
        "min": 2,
        "max": 6
      },
      "card": {
        "chance": 0.2
      },
      "food": {
        "chance": 0.2,
        "pool": "common_food"
      },
      "salvage": {
        "chance": 0.15,
        "pool": [
          "bone",
          "organ"
        ]
      },
      "supply": {
        "chance": 0.2,
        "pool": [
          "ITM-115"
        ]
      },
      "nothing": {
        "chance": 0.15
      }
    },
    "furnace_drum": {
      "_biome_variant": "foundry",
      "currency": {
        "chance": 0.65,
        "min": 2,
        "max": 5
      },
      "battery": {
        "chance": 0.5,
        "min": 1,
        "max": 2
      },
      "salvage": {
        "chance": 0.3,
        "pool": [
          "scrap",
          "ember"
        ]
      },
      "supply": {
        "chance": 0.25,
        "pool": [
          "ITM-116",
          "ITM-120",
          "ITM-124",
          "ITM-128",
          "ITM-132"
        ]
      },
      "nothing": {
        "chance": 0.2
      }
    },
    "slag_bin": {
      "_biome_variant": "foundry",
      "salvage": {
        "chance": 0.8,
        "pool": [
          "scrap",
          "ember",
          "crystal"
        ]
      },
      "battery": {
        "chance": 0.4,
        "min": 1,
        "max": 2
      },
      "currency": {
        "chance": 0.3,
        "min": 1,
        "max": 3
      },
      "explosive_radius": 1,
      "nothing": {
        "chance": 0.1
      }
    },
    "lab_cabinet": {
      "_biome_variant": "sealab",
      "currency": {
        "chance": 0.6,
        "min": 2,
        "max": 6
      },
      "card": {
        "chance": 0.35
      },
      "battery": {
        "chance": 0.45,
        "min": 1,
        "max": 2
      },
      "salvage": {
        "chance": 0.25,
        "pool": [
          "crystal",
          "ichor"
        ]
      },
      "supply": {
        "chance": 0.2,
        "pool": [
          "ITM-115",
          "ITM-116",
          "ITM-121",
          "ITM-125",
          "ITM-129",
          "ITM-133"
        ]
      },
      "nothing": {
        "chance": 0.15
      }
    },
    "specimen_tank": {
      "_biome_variant": "sealab",
      "food": {
        "chance": 0.5,
        "pool": "seafood"
      },
      "salvage": {
        "chance": 0.6,
        "pool": [
          "ichor",
          "crystal",
          "scale"
        ]
      },
      "currency": {
        "chance": 0.4,
        "min": 1,
        "max": 4
      },
      "explosive_radius": 0,
      "nothing": {
        "chance": 0.1
      }
    },
    "chest_common": {
      "_note": "Placed by GridGen in rooms. Always drops something.",
      "currency": {
        "chance": 1,
        "min": 3,
        "max": 8
      },
      "card": {
        "chance": 0.7
      },
      "battery": {
        "chance": 0.4,
        "min": 1,
        "max": 2
      },
      "food": {
        "chance": 0.4,
        "pool": "common_food"
      },
      "salvage": {
        "chance": 0.3,
        "pool": [
          "bone",
          "scrap",
          "crystal"
        ]
      },
      "supply": {
        "chance": 0.35,
        "pool": [
          "ITM-115",
          "ITM-116",
          "ITM-122",
          "ITM-126",
          "ITM-130",
          "ITM-134"
        ]
      }
    }
  },
  "biome_props": {
    "_comment": "Breakable prop lists per biome. Matched by GridGen/BreakableSpawner.",
    "cellar": [
      {
        "name": "Barrel",
        "emoji": "🛢️",
        "hp": 2,
        "breakable": true,
        "explosive": false,
        "drops": "barrel",
        "noise": 1
      },
      {
        "name": "Crate",
        "emoji": "📦",
        "hp": 3,
        "breakable": true,
        "explosive": false,
        "drops": "crate",
        "noise": 1.5
      },
      {
        "name": "Bone Pile",
        "emoji": "🦴",
        "hp": 1,
        "breakable": true,
        "explosive": false,
        "drops": "breakable_default",
        "noise": 0.5
      },
      {
        "name": "Rotten Shelf",
        "emoji": "🗄️",
        "hp": 2,
        "breakable": true,
        "explosive": false,
        "drops": "crate",
        "noise": 1
      },
      {
        "name": "Torch Stand",
        "emoji": "🕯️",
        "hp": 1,
        "breakable": true,
        "explosive": false,
        "drops": "breakable_default",
        "noise": 0.5
      }
    ],
    "foundry": [
      {
        "name": "Furnace Drum",
        "emoji": "🛢️",
        "hp": 3,
        "breakable": true,
        "explosive": false,
        "drops": "furnace_drum",
        "noise": 2
      },
      {
        "name": "Slag Bin",
        "emoji": "🗑️",
        "hp": 2,
        "breakable": true,
        "explosive": true,
        "drops": "slag_bin",
        "noise": 3
      },
      {
        "name": "Gear Stack",
        "emoji": "⚙️",
        "hp": 2,
        "breakable": true,
        "explosive": false,
        "drops": "furnace_drum",
        "noise": 1.5
      },
      {
        "name": "Metal Pipe",
        "emoji": "🔧",
        "hp": 1,
        "breakable": true,
        "explosive": false,
        "drops": "breakable_default",
        "noise": 2
      },
      {
        "name": "Anvil",
        "emoji": "🔩",
        "hp": 4,
        "breakable": false,
        "explosive": false,
        "drops": null,
        "noise": 0
      }
    ],
    "sealab": [
      {
        "name": "Lab Cabinet",
        "emoji": "🗄️",
        "hp": 2,
        "breakable": true,
        "explosive": false,
        "drops": "lab_cabinet",
        "noise": 1
      },
      {
        "name": "Specimen Tank",
        "emoji": "🧪",
        "hp": 2,
        "breakable": true,
        "explosive": false,
        "drops": "specimen_tank",
        "noise": 1.5
      },
      {
        "name": "Server Rack",
        "emoji": "💻",
        "hp": 3,
        "breakable": true,
        "explosive": false,
        "drops": "lab_cabinet",
        "noise": 2
      },
      {
        "name": "Coolant Drum",
        "emoji": "🛢️",
        "hp": 2,
        "breakable": true,
        "explosive": false,
        "drops": "breakable_default",
        "noise": 1
      },
      {
        "name": "Pressure Tank",
        "emoji": "⚗️",
        "hp": 3,
        "breakable": true,
        "explosive": true,
        "drops": "specimen_tank",
        "noise": 3.5
      }
    ]
  },
  "walk_over_collectibles": {
    "_comment": "Gold, battery, food that spawn on floor as COLLECTIBLE tiles. Walk-over pickup.",
    "food_pools": {
      "common_food": [
        {
          "itemId": "ITM-001",
          "weight": 30
        },
        {
          "itemId": "ITM-002",
          "weight": 25
        },
        {
          "itemId": "ITM-003",
          "weight": 20
        },
        {
          "itemId": "ITM-004",
          "weight": 15
        },
        {
          "itemId": "ITM-005",
          "weight": 10
        }
      ],
      "uncommon_food": [
        {
          "itemId": "ITM-003",
          "weight": 30
        },
        {
          "itemId": "ITM-004",
          "weight": 30
        },
        {
          "itemId": "ITM-005",
          "weight": 25
        },
        {
          "itemId": "ITM-006",
          "weight": 15
        }
      ],
      "seafood": [
        {
          "itemId": "ITM-005",
          "weight": 40
        },
        {
          "itemId": "ITM-006",
          "weight": 40
        },
        {
          "itemId": "ITM-004",
          "weight": 20
        }
      ]
    },
    "gold_amounts": {
      "cellar": {
        "min": 1,
        "max": 4
      },
      "foundry": {
        "min": 2,
        "max": 6
      },
      "sealab": {
        "min": 3,
        "max": 9
      }
    },
    "battery_amounts": {
      "cellar": {
        "min": 1,
        "max": 1
      },
      "foundry": {
        "min": 1,
        "max": 2
      },
      "sealab": {
        "min": 1,
        "max": 2
      }
    }
  },
  "torch_fuel": {
    "_comment": "Torch fuel drop pools per biome. Rolled when crates/chests on torch-heavy floors drop fuel.",
    "cellar": [
      {
        "itemId": "torch_oil_deep",
        "weight": 30
      },
      {
        "itemId": "torch_oil",
        "weight": 50
      },
      {
        "itemId": "water_bottle",
        "weight": 20
      }
    ],
    "foundry": [
      {
        "itemId": "torch_oil_deep",
        "weight": 35
      },
      {
        "itemId": "torch_oil",
        "weight": 40
      },
      {
        "itemId": "water_bottle",
        "weight": 25
      }
    ],
    "sealab": [
      {
        "itemId": "torch_oil_deep",
        "weight": 40
      },
      {
        "itemId": "torch_oil",
        "weight": 30
      },
      {
        "itemId": "water_bottle",
        "weight": 30
      }
    ],
    "bazaar": [
      {
        "itemId": "torch_oil_coral",
        "weight": 40
      },
      {
        "itemId": "torch_oil",
        "weight": 35
      },
      {
        "itemId": "water_bottle",
        "weight": 25
      }
    ],
    "inn": [
      {
        "itemId": "torch_oil_drift",
        "weight": 40
      },
      {
        "itemId": "torch_oil",
        "weight": 35
      },
      {
        "itemId": "water_bottle",
        "weight": 25
      }
    ],
    "_default": [
      {
        "itemId": "torch_oil",
        "weight": 50
      },
      {
        "itemId": "water_bottle",
        "weight": 50
      }
    ]
  },
  "floor_currency_scale": {
    "1": 1,
    "2": 1.2,
    "3": 1.5,
    "4": 1.8,
    "5": 2,
    "6": 2.5,
    "7": 3,
    "8": 3.5,
    "_comment": "Applied to all currency rolls. Floor number is key (string), value is multiplier.",
    "_default": 1
  },
  "economy_settings": {
    "item_decay_enabled": false,
    "max_floor_items": 24,
    "corpse_loot_count": {
      "min": 2,
      "max": 5
    },
    "chest_always_has_card": true,
    "faction_sell_bonus": {
      "_comment": "When selling to matching faction, apply this on top of getSellPrice(). Flat mult.",
      "tide": 1.1,
      "foundry": 1.1,
      "admiralty": 1.1
    }
  }
};

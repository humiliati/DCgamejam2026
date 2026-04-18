// ============================================================
// data/enemy-decks.js — AUTO-GENERATED (DOC-110 P5.2)
// ------------------------------------------------------------
// Source:     data/enemy-decks.json
// Generator:  tools/generate-enemy-decks-sidecar.js
// DO NOT hand-edit: the next pre-commit sidecar regen will
// overwrite any changes. Edit the JSON and let the hook (or
// `node tools/generate-enemy-decks-sidecar.js` directly) rebuild.
// ============================================================
window.ENEMY_DECKS_DATA = {
  "_meta": {
    "generatedAt": "2026-04-18T00:14:34.617Z",
    "generator": "tools/generate-enemy-decks-sidecar.js",
    "source": "data/enemy-decks.json",
    "deckCount": 26
  },
  "_schema": {
    "key": "ENM-### from data/enemies.json — exact match, NOT enemy.name",
    "cards": "Array of EATK-### ids. Duplicates mean multiple copies in the shuffle.",
    "greed": "Optional override for CardStack enemy stack size (default 2)",
    "pattern": "random (default) | sequence — sequence plays cards in listed order, random shuffles each round",
    "_note": "Design intent for the deck"
  },
  "decks": {
    "ENM-001": {
      "cards": [
        "EATK-002",
        "EATK-001",
        "EATK-014"
      ],
      "_note": "Cobweb Crawler: opens with Gnaw bleed, then Rend / Feral Swipe. ♠ cellar teacher — shows bleed early."
    },
    "ENM-002": {
      "cards": [
        "EATK-001",
        "EATK-001",
        "EATK-003"
      ],
      "_note": "Shambling Corpse: steady 3-dmg Rend loop with an occasional Bone Brace. Slow but tanky."
    },
    "ENM-003": {
      "cards": [
        "EATK-014",
        "EATK-014",
        "EATK-002"
      ],
      "_note": "Dungeon Rat: tiny, fast. Mostly Feral Swipes, rare Gnaw. 4 HP pest — never an existential threat."
    },
    "ENM-004": {
      "cards": [
        "EATK-001",
        "EATK-003",
        "EATK-004"
      ],
      "_note": "Bone Guard: Rend → Brace → Crushing Slam. Telegraphs the heavy hit after bracing, rewards patient players."
    },
    "ENM-005": {
      "cards": [
        "EATK-005",
        "EATK-006",
        "EATK-006"
      ],
      "_note": "Mold Wraith: ♣ DoT specialist. Spore Burst + Corrosive Spit. Forces the player to out-tempo poison."
    },
    "ENM-006": {
      "cards": [
        "EATK-006",
        "EATK-001",
        "EATK-006"
      ],
      "_note": "Cave Toad: ♦ suit flavor, but uses ♣ poison (muddy mix — toads are weird). Light pressure."
    },
    "ENM-007": {
      "cards": [
        "EATK-002",
        "EATK-002",
        "EATK-001"
      ],
      "_note": "Rot Hound: double bleed opener. Stacks bleed fast — players learn to bring cleanse or burst."
    },
    "ENM-008": {
      "cards": [
        "EATK-004",
        "EATK-003",
        "EATK-001",
        "EATK-013"
      ],
      "greed": 3,
      "_note": "Bone Sovereign (boss): Crushing Slam, Bone Brace, Rend, Rupture. 4-card rotation, greed 3 — stacks harder."
    },
    "ENM-010": {
      "cards": [
        "EATK-010",
        "EATK-001",
        "EATK-010"
      ],
      "_note": "Soot Imp: burn-heavy ♦. Ember Flare x2 + Rend. Teaches burn DoT in the foundry."
    },
    "ENM-011": {
      "cards": [
        "EATK-011",
        "EATK-004",
        "EATK-001"
      ],
      "_note": "Iron Golem: Magma Carapace + Crushing Slam. Classic brace-then-slam read."
    },
    "ENM-012": {
      "cards": [
        "EATK-010",
        "EATK-009",
        "EATK-001"
      ],
      "_note": "Slag Hound: ♦ burn + precision lance. Mid-tier foundry runner."
    },
    "ENM-013": {
      "cards": [
        "EATK-007",
        "EATK-001",
        "EATK-001"
      ],
      "_note": "Clockwork Guard: ♣ stun bite + baseline rends. Stun forces player to burn their brace early."
    },
    "ENM-014": {
      "cards": [
        "EATK-010",
        "EATK-010",
        "EATK-014"
      ],
      "_note": "Ember Sprite: 2 HP glass cannon. Spams Ember Flare — burn ticks longer than the fight does."
    },
    "ENM-015": {
      "cards": [
        "EATK-004",
        "EATK-001",
        "EATK-003"
      ],
      "_note": "Scrap Brute: pure ♠ bruiser. Slam, Rend, Brace."
    },
    "ENM-016": {
      "cards": [
        "EATK-010",
        "EATK-011",
        "EATK-009"
      ],
      "_note": "Smelt Master: ♦ DoT + heavy brace + lance. Mini-boss feel."
    },
    "ENM-017": {
      "cards": [
        "EATK-004",
        "EATK-010",
        "EATK-011",
        "EATK-009"
      ],
      "greed": 3,
      "_note": "The Amalgam (foundry boss): full ♦ toolkit + crushing slam. Greed 3."
    },
    "ENM-020": {
      "cards": [
        "EATK-002",
        "EATK-001",
        "EATK-008"
      ],
      "_note": "Tide Stalker: bleed + root. Sealab ambusher."
    },
    "ENM-021": {
      "cards": [
        "EATK-007",
        "EATK-007",
        "EATK-001"
      ],
      "_note": "Shock Eel: double stun. Brutally annoying — forces player to stack outside their turn."
    },
    "ENM-022": {
      "cards": [
        "EATK-009",
        "EATK-001",
        "EATK-003"
      ],
      "_note": "Lab Drone: clean ♣ pattern using ♦/♠ tricks (precision + brace)."
    },
    "ENM-023": {
      "cards": [
        "EATK-004",
        "EATK-002",
        "EATK-001"
      ],
      "_note": "Deep Crawler: heavy slam + bleed. High-tier ♠ sealab bruiser."
    },
    "ENM-024": {
      "cards": [
        "EATK-012",
        "EATK-001",
        "EATK-002"
      ],
      "_note": "Brine Wraith: ♥ Blood Drain self-heal. Long attrition fight if you don’t burst it down."
    },
    "ENM-025": {
      "cards": [
        "EATK-005",
        "EATK-006",
        "EATK-008"
      ],
      "_note": "Bio-Hazard Slime: poison + root. Pure CC/DoT — 8 HP fragile but infuriating."
    },
    "ENM-026": {
      "cards": [
        "EATK-009",
        "EATK-003",
        "EATK-007"
      ],
      "_note": "Admiralty Enforcer: precise lance + brace + stun bite. Disciplined ♣."
    },
    "ENM-027": {
      "cards": [
        "EATK-004",
        "EATK-011",
        "EATK-001"
      ],
      "_note": "Cryo-Brute: heavy slam + magma-tier brace. ♠ elite."
    },
    "ENM-028": {
      "cards": [
        "EATK-009",
        "EATK-007",
        "EATK-005",
        "EATK-011"
      ],
      "greed": 3,
      "_note": "The Archivist (sealab boss): lance + stun + spores + heavy brace. Greed 3 — rotates through every ♣/♦ trick."
    },
    "ENM-090": {
      "cards": [
        "EATK-013",
        "EATK-012",
        "EATK-004",
        "EATK-001"
      ],
      "greed": 3,
      "_note": "Hero’s Shadow: ♥ signature. Rupture + Blood Drain + Crushing Slam. Boss-tier ♥ encounter for the janitor hero-day hazard."
    }
  }
};

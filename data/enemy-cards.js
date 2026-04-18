// ============================================================
// data/enemy-cards.js — AUTO-GENERATED (DOC-110 P5.2)
// ------------------------------------------------------------
// Source:     data/enemy-cards.json
// Generator:  tools/generate-enemy-cards-sidecar.js
// DO NOT hand-edit: the next pre-commit sidecar regen will
// overwrite any changes. Edit the JSON and let the hook (or
// `node tools/generate-enemy-cards-sidecar.js` directly) rebuild.
// ============================================================
window.ENEMY_CARDS_DATA = {
  "_meta": {
    "generatedAt": "2026-04-18T00:14:34.690Z",
    "generator": "tools/generate-enemy-cards-sidecar.js",
    "source": "data/enemy-cards.json",
    "cardCount": 14
  },
  "_schema": {
    "id": "EATK-### — enemy attack card id (distinct namespace from ACT-### player cards)",
    "suit": "spade | club | diamond | heart — for EnemyIntent telegraph coloring + player RPS read",
    "effects": "Same schema as player cards: { type: 'damage'|'defense'|'status'|'heal', value, duration?, status? }",
    "intentType": "High-level telegraph category: BASIC | BRACE | DOT | BURST | CC | DRAIN — raycaster/HUD can use this for glyph hints",
    "synergyTags": "Tag intersection for any future enemy stacking rules (parallel to player synergyTags)",
    "_note": "Design intent — why this card exists and which enemies should use it"
  },
  "cards": [
    {
      "id": "EATK-001",
      "name": "Rend",
      "emoji": "⚔️",
      "suit": "spade",
      "intentType": "BASIC",
      "effects": [
        {
          "type": "damage",
          "value": 3,
          "target": "player"
        }
      ],
      "synergyTags": [
        "melee",
        "spade"
      ],
      "_note": "Baseline ♠ strike. Assigned to most cellar grunts as their go-to beat."
    },
    {
      "id": "EATK-002",
      "name": "Gnaw",
      "emoji": "🦷",
      "suit": "spade",
      "intentType": "DOT",
      "effects": [
        {
          "type": "damage",
          "value": 2,
          "target": "player"
        },
        {
          "type": "status",
          "status": "bleeding",
          "value": 1,
          "duration": 3,
          "target": "player"
        }
      ],
      "synergyTags": [
        "melee",
        "bleed",
        "spade"
      ],
      "_note": "Light bite + 1 dmg/turn bleed for 3 rounds. Rats and hounds open with this."
    },
    {
      "id": "EATK-003",
      "name": "Bone Brace",
      "emoji": "🛡️",
      "suit": "spade",
      "intentType": "BRACE",
      "effects": [
        {
          "type": "defense",
          "value": 4,
          "target": "self"
        }
      ],
      "synergyTags": [
        "defensive",
        "spade"
      ],
      "_note": "Skeletal enemies use this when HP drops. Turns a round into a bracing read — player must either out-stack or pivot."
    },
    {
      "id": "EATK-004",
      "name": "Crushing Slam",
      "emoji": "💥",
      "suit": "spade",
      "intentType": "BURST",
      "effects": [
        {
          "type": "damage",
          "value": 6,
          "target": "player"
        }
      ],
      "synergyTags": [
        "melee",
        "heavy",
        "spade"
      ],
      "_note": "Big telegraphed spike. Elite / boss signature. Players must commit defense when they see it."
    },
    {
      "id": "EATK-005",
      "name": "Spore Burst",
      "emoji": "🍄",
      "suit": "club",
      "intentType": "DOT",
      "effects": [
        {
          "type": "damage",
          "value": 2,
          "target": "player"
        },
        {
          "type": "status",
          "status": "poisoned",
          "value": 2,
          "duration": 3,
          "target": "player"
        }
      ],
      "synergyTags": [
        "status",
        "poison",
        "club"
      ],
      "_note": "Mold/fungus attackers. 2 dmg + 2 poison/turn x3 — heaviest DoT enemy card."
    },
    {
      "id": "EATK-006",
      "name": "Corrosive Spit",
      "emoji": "🤢",
      "suit": "club",
      "intentType": "DOT",
      "effects": [
        {
          "type": "damage",
          "value": 1,
          "target": "player"
        },
        {
          "type": "status",
          "status": "poisoned",
          "value": 1,
          "duration": 2,
          "target": "player"
        }
      ],
      "synergyTags": [
        "status",
        "poison",
        "club"
      ],
      "_note": "Lighter poison variant. Toads, slimes."
    },
    {
      "id": "EATK-007",
      "name": "Shock Bite",
      "emoji": "⚡",
      "suit": "club",
      "intentType": "CC",
      "effects": [
        {
          "type": "damage",
          "value": 2,
          "target": "player"
        },
        {
          "type": "status",
          "status": "stunned",
          "value": 1,
          "duration": 1,
          "target": "player"
        }
      ],
      "synergyTags": [
        "cc",
        "stun",
        "club"
      ],
      "_note": "Eels, shock beasts. Stuns player 1 round — skips their next draw. Used sparingly, feels nasty."
    },
    {
      "id": "EATK-008",
      "name": "Ensnare",
      "emoji": "🕸️",
      "suit": "club",
      "intentType": "CC",
      "effects": [
        {
          "type": "damage",
          "value": 1,
          "target": "player"
        },
        {
          "type": "status",
          "status": "rooted",
          "value": 0,
          "duration": 2,
          "target": "player"
        }
      ],
      "synergyTags": [
        "cc",
        "root",
        "club"
      ],
      "_note": "Webs the player. Rooted is currently a visual tag (no tick damage) — foundation for future movement-lock mechanic."
    },
    {
      "id": "EATK-009",
      "name": "Crystal Lance",
      "emoji": "🔷",
      "suit": "diamond",
      "intentType": "BASIC",
      "effects": [
        {
          "type": "damage",
          "value": 4,
          "target": "player"
        }
      ],
      "synergyTags": [
        "ranged",
        "precision",
        "diamond"
      ],
      "_note": "Precise ♦ strike. Foundry constructs. Slightly above baseline because ♦ enemies tend to have fewer moves."
    },
    {
      "id": "EATK-010",
      "name": "Ember Flare",
      "emoji": "🔥",
      "suit": "diamond",
      "intentType": "DOT",
      "effects": [
        {
          "type": "damage",
          "value": 2,
          "target": "player"
        },
        {
          "type": "status",
          "status": "burning",
          "value": 2,
          "duration": 2,
          "target": "player"
        }
      ],
      "synergyTags": [
        "fire",
        "burn",
        "diamond"
      ],
      "_note": "Ember sprites, forge creatures. Burning ticks 2 dmg/turn for 2 rounds."
    },
    {
      "id": "EATK-011",
      "name": "Magma Carapace",
      "emoji": "🪨",
      "suit": "diamond",
      "intentType": "BRACE",
      "effects": [
        {
          "type": "defense",
          "value": 5,
          "target": "self"
        }
      ],
      "synergyTags": [
        "defensive",
        "diamond"
      ],
      "_note": "Golems and slag hounds. Bigger brace than Bone Brace to read as ‘this thing is tough.’"
    },
    {
      "id": "EATK-012",
      "name": "Blood Drain",
      "emoji": "🩸",
      "suit": "heart",
      "intentType": "DRAIN",
      "effects": [
        {
          "type": "damage",
          "value": 3,
          "target": "player"
        },
        {
          "type": "heal",
          "value": 2,
          "target": "self"
        }
      ],
      "synergyTags": [
        "drain",
        "heart"
      ],
      "_note": "♥ signature. Deals damage AND heals enemy. Wraiths, vampiric enemies."
    },
    {
      "id": "EATK-013",
      "name": "Rupture",
      "emoji": "🩸",
      "suit": "heart",
      "intentType": "DOT",
      "effects": [
        {
          "type": "damage",
          "value": 3,
          "target": "player"
        },
        {
          "type": "status",
          "status": "bleeding",
          "value": 2,
          "duration": 3,
          "target": "player"
        }
      ],
      "synergyTags": [
        "bleed",
        "heart"
      ],
      "_note": "Heavy bleed opener. Bosses and elites that want to pressure a long fight."
    },
    {
      "id": "EATK-014",
      "name": "Feral Swipe",
      "emoji": "🐾",
      "suit": "spade",
      "intentType": "BASIC",
      "effects": [
        {
          "type": "damage",
          "value": 2,
          "target": "player"
        }
      ],
      "synergyTags": [
        "melee",
        "fast",
        "spade"
      ],
      "_note": "Low-HP ‘weak enemy’ baseline strike — rats, imps, small pests."
    }
  ]
};

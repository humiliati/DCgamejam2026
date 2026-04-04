# Resource Design — Dungeon Gleaner

## Three Resources, Three Pressures

| Resource | What It Controls | Spend Rate | Recovery |
|----------|-----------------|------------|----------|
| **HP** (♥ Heart) | *Survival budget.* How many hits you can absorb before death. Spending HP on cards is a gamble — you're trading runway for power. | Enemy damage per round, HP-cost cards | Bonfire rest (full), Mend/heal cards, food items, HOT ticks |
| **Energy** (♣ Club) | *Action budget per combat.* Limits how many "powered" cards you play before falling back to free basics. Resets each combat — spend it or lose it. | 1-3 per powered card, 1 to flee | Full refill at combat start (per-combat resource), bonfire/bed rest |
| **Battery** (♦ Diamond) | *Session budget across combats.* Persistent tech charge that does NOT refill between fights. Spending battery is an investment — powerful effects now, scarcity later. | 1-3 per tech card | World pickups only, Battery Pack/Power Cell cards, NOT restored at rest |

### Design Intent

- **HP** is the *threat*. Every combat chips away at it. Recovery is slow (bonfire = time cost, cards = hand slot cost). Running low on HP should feel dangerous.
- **Energy** is the *tempo*. Fully refilled each combat. Decides how many premium cards you can fire before falling back to free basics. Fleeing costs energy. Energy-cost cards are your "normal good" plays.
- **Battery** is the *investment*. Scarce, cross-combat. Finding a Battery Pack should feel like finding ammo in a survival game. Battery-cost cards are the strongest effects (EMP, Ghost Protocol, Smoke Screen) but you can't spam them.

### Why Three?

Each resource creates a different decision:
- "Do I spend HP for burst damage, or save it to survive?" (risk tolerance)
- "Do I spend energy on offense or defense this round?" (round-level tactics)
- "Do I use my battery charge now or save it for the boss?" (session-level strategy)

## Recovery Loops

### In-Combat Recovery
| Source | HP | Energy | Battery |
|--------|-----|--------|---------|
| Mend (ACT-003, starter) | +3 | - | - |
| Medical Kit (ACT-207) | +6 | costs 2 | - |
| Stim Pack (ACT-208) | +4 | - | costs 1 |
| Rations (ACT-209) | +3 | net 0 | - |
| Overcharge (ACT-202) | - | costs 1 | +3 |
| Coffee Break (ACT-206) | - | +3 | costs 1 |
| Battery Pack (ACT-200) | - | - | +2 |
| Power Cell (ACT-201) | - | +1 | +1 |
| Adrenaline Surge (ACT-204) | costs 2 | +3 | - |
| Salvage Core (ACT-203) | costs 2 | - | +3 |

### Between-Combat Recovery
| Trigger | HP | Energy | Battery |
|---------|-----|--------|---------|
| Combat ends (victory) | - | **full refill** | - |
| Bonfire rest | **full** | **full** | - |
| Bed rest | - | **full** | - |
| Food pickup (world) | +3-5 | - | - |
| Battery pickup (world) | - | - | +1 |
| Non-lethal defeat | **full** | **full** | - |

### Key Design Rule
**Battery never recovers passively.** This is what makes ♦ Diamond cards feel premium. If battery recovered at bonfires, the whole scarcity tension collapses.

## Starter Deck Cost Audit

Current: all 10 starter cards are free. This means zero resource pressure.

### Proposed Starter Costs (4 free → 6 costed)

| Card | Current | Proposed | Rationale |
|------|---------|----------|-----------|
| ACT-001 Slash | free | **free** | Basic attack, always available |
| ACT-002 Block | free | **free** | Basic defense, always available |
| ACT-003 Mend | free | **free** | Basic heal, always available |
| ACT-004 Cinder Strike | free | **energy: 1** | ♦ suit → introduces cost concept |
| ACT-005 Frost Shard | free | **free** | Keep one free elemental for RPS tutorial |
| ACT-006 Arc Bolt | free | **energy: 1** | ♣ suit → energy cost makes thematic sense |
| ACT-007 Embers | free | **energy: 1** | DoT effect warrants cost |
| ACT-008 Glacial Guard | free | **energy: 1** | Premium defense should cost |
| ACT-009 Thunder Clap | free | **energy: 2** | Highest starter damage (4) should cost most |
| ACT-010 Rummage | free | **free** | Utility/draw stays free |

**Result:** 5 free + 4 cost-1 + 1 cost-2 = 8 energy budget needed for full rotation. Player starts with 5 energy → forces choices about which 4-5 powered cards to play.

## Enemy HP Audit (Tier 1 — Cellar)

### Current Problem
Player STR (2) + best starter card (Thunder Clap: 4 dmg) = 6 base damage. Stack 2 cards = 9+ damage. Every tier-1 enemy dies in round 1.

### Proposed Tier-1 HP Bump

| Enemy | Current HP | Proposed HP | Rationale |
|-------|-----------|------------|-----------|
| ENM-001 Cobweb Crawler | 3 | **5** | Should survive 1 round of single-card play |
| ENM-002 Shambling Corpse | 5 | **8** | Tank archetype, should take 2-3 rounds |
| ENM-003 Dungeon Rat | 2 | **3** | Non-lethal tutorial, still quick |
| ENM-004 Bone Guard | 4 | **6** | Standard 2-round fight |
| ENM-005 Mold Wraith | 4 | **6** | Match Bone Guard tier |
| ENM-006 Cave Toad | 4 | **6** | Match Bone Guard tier |
| ENM-007 Rot Hound (elite) | 8 | **12** | Elite should feel dangerous, 3-4 rounds |
| ENM-008 Bone Sovereign (boss) | 16 | **20** | Boss encounter, multi-round slugfest |

### Target Combat Length
- **Standard enemy:** 2 rounds (spend resources, take 1-2 hits)
- **Elite:** 3-4 rounds (must heal, must manage resources)
- **Boss:** 5+ rounds (full resource management, card cycling)

## Player HP Audit

### Current: 10 HP, 10 maxHP

With enemies dealing 1-2 damage per round and combat lasting 2 rounds, player loses 2-4 HP per fight. With 10 HP that's 2-5 combats before needing rest. That's actually reasonable IF fights last 2 rounds.

**Verdict: 10 HP is fine.** The issue isn't max HP — it's that fights end too fast for HP to matter. Fixing enemy HP (above) and adding starter card costs fixes this naturally.

### HP Math After Rebalance
- 2-round fight vs Bone Guard (str 2): take 4 damage → 6 HP remaining
- Use Mend (+3): back to 9 HP, but Mend used a hand slot (opportunity cost)
- Next fight: 9 HP → take 4 more → 5 HP → getting dangerous
- Bonfire rest: full heal (reward for exploration, finding rest points)

This creates the tension loop: explore → fight → chip HP → find bonfire → heal → push deeper.

## Energy Per-Combat Budget

### Current: 5 energy, refills each combat

With proposed starter costs:
- Slash (free) + Cinder Strike (1) + Arc Bolt (1) + Embers (1) = 3 energy for offense
- Block (free) or Glacial Guard (1) for defense = 0-1 energy
- Thunder Clap (2) as finisher = 2 energy
- **Total offensive burst: 5 energy exactly** = one full rotation

This means: you can go all-in for one big round, OR spread across 2 rounds with some free basics mixed in. That's the decision.

### Energy Overflow
Cards like Quick Reload (+1 energy + draw) and Coffee Break (+3 energy for 1 battery) let you extend your energy budget — but at the cost of hand slots or battery. This is the resource exchange in action.

## Battery Session Budget

### Current: 3 battery, 10 maxBattery

3 starting battery = 1-3 tech card uses before you're dry. Battery cards (EMP Blast: 3 battery, System Crash: 2 battery, Smoke Screen: 1 battery) are powerful but limited.

Finding Battery Pack (+2) or Power Cell (+1) in the world or shops is meaningful because it directly extends your session capability. This scarcity is correct and intentional.

### Battery Recovery Sources
- World pickups (breakable crates, loot): +1 per pickup
- Battery Pack card (ACT-200): +2 (if you find/buy one)
- Power Cell card (ACT-201): +1 battery + 1 energy
- Chain Lightning card (ACT-225): +1 battery as combat byproduct
- **NOT from bonfires, NOT from beds, NOT from combat end**

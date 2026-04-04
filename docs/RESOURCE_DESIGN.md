# Resource Design — Dungeon Gleaner

## Core Philosophy: Flee First

Dungeon Gleaner is a **janitor sim**, not a combat RPG. Heroes are hazards.
Enemies are obstacles you route around, not XP piñatas you farm.

At game start, **most enemies will kill or nearly kill the player**. The correct
early-game response to combat is: **flee**. Fleeing costs 1 energy and leaves
the enemy in place — you have to find another route or come back prepared.

Combat becomes viable only after the player earns better cards through labor
(cleaning loops, restocking, dungeon reset tasks). The deck you build through
work is what makes you strong enough to stand and fight — and even then,
picking your battles matters.

### Difficulty Curve
- **Floors 1-2 (Cellar):** Standard enemies deal 3 dmg/round, have 10-14 HP.
  Player (10 HP, starter deck) survives 2-3 rounds at best. Flee or die.
- **Floors 3-5 (Foundry):** STR 3-5, HP 12-18. Need upgraded deck to compete.
- **Floors 6-8 (Sealab):** STR 4-6, HP 12-20. Endgame deck required.
- **Elites/Bosses:** Always threatening regardless of deck quality.

### When Combat Becomes Viable
- After 3-5 labor cycles earning better cards from shops/drops
- With resource-exchange cards enabling multi-round sustain
- With suit advantage (1.5x multiplier) against the right enemy type
- After investing battery in tech cards for burst turns

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

## Enemy Stats (Flee-First Balance)

### Design: Enemies Outclass the Starter Deck

Player best-case round: Thunder Clap + Arc Bolt = 10 dmg (costs 3 energy).
That's ONE good round. Most cellar enemies have 10-14 HP and deal 3-4/round.
The math says: you CAN kill them, but you'll lose 60-80% HP doing it. Not worth it.

### Cellar (Floors 1-2) — STR 3, HP 10-14

| Enemy | HP | STR | Role |
|-------|-----|-----|------|
| Cobweb Crawler | 10 | 3 | Fast ambusher. Barely winnable. |
| Shambling Corpse | 14 | 4 | Slow tank. Hits hard, won't chase. |
| Dungeon Rat | 4 | 1 | Non-lethal. Learning encounter. |
| Bone Guard | 12 | 3 | Armored. 2-round fight = -6 HP. |
| Mold Wraith | 10 | 3 | Poison theme. Flee or regret. |
| Cave Toad | 10 | 3 | Lunges. Blocks corridors. |
| Rot Hound (elite) | 18 | 5 | **Instant flee.** 5 dmg/round = dead in 2. |
| Bone Sovereign (boss) | 30 | 5 | **Impossible without built deck.** |

### Target Outcomes (Starter Deck)
- **vs Standard:** Pyrrhic victory at best. -6 to -8 HP. One more fight = death.
- **vs Elite:** Player dies in 2 rounds. Flee immediately.
- **vs Boss:** Don't even try. 30 HP / 5 STR = need 4+ rounds while taking 20+ damage.
- **vs Non-lethal:** Safe tutorial fights. Learn mechanics risk-free.

## Player HP Audit

### Current: 10 HP, 10 maxHP

With enemies dealing 3-4 per round, a single fight costs 6-8 HP. One fight
and you're nearly dead. Two fights without healing = death.

**Verdict: 10 HP is correct for flee-first.** Low HP makes every encounter
life-or-death and rewards avoidance. The Mend card (+3 HP) heals 30% — meaningful
but not enough to chain fights. Bonfire rest (full heal) becomes the critical
waypoint between excursions.

### HP Pressure Loop
1. **Explore** — clean floors, restock shelves, earn gold/cards
2. **Encounter** — enemy blocks path. Flee (1 energy) or fight (6-8 HP)
3. **Fight (if forced)** — 2-round slug. Survive with 2-4 HP. Burn heal card.
4. **Retreat** — limp to bonfire. Full heal. Push deeper or continue labor.
5. **Upgrade** — buy better cards. Now fights cost 3-4 HP instead of 6-8.
6. **Mastery** — built deck handles standard enemies. Elites still dangerous.

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

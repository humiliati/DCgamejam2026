# Dungeon Gleaner — Staggered Shop Refresh & Scarcity Economy

**Created**: 2026-03-30
**Scope**: Biome-staggered shop inventory refresh cycles independent of the hero cycle, sold-out states as a core economic mechanic, and the "gamble your capital on cards" pressure design.
**Depends on**: DOC-7 (Core Game Loop), DOC-2 (Tutorial World), engine/shop.js, engine/day-cycle.js

---

## 1. The Problem with Instant Refresh

The current shop system regenerates 5 cards on every floor-open. This means the player always has cards available whenever they have gold. There's no scarcity, no urgency, and no reason to choose between spending now vs saving. The economy has no pulse — it's an always-available vending machine.

Stardew Valley's shops work because the traveling merchant only appears twice a week, Pierre's stock rotates seasonally, and some items are genuinely unavailable most of the time. The player learns to buy when they see something good because it might not be there tomorrow.

Dungeon Gleaner needs the same pressure: **shops should feel like opportunities, not utilities.**

---

## 2. Staggered Biome Refresh Cycles

Each shop faction refreshes its inventory on its own independent cycle. The cycles are staggered so that on any given day, some shops are fresh, some are picked-over, and some are sold out. This is deliberate — the player can never buy everything they want on the same day.

### 2.1 Refresh Schedule

| Faction | Biome | Refresh Interval | Stagger Offset | Fresh On (Cycle 1) |
|---------|-------|-----------------|----------------|---------------------|
| **Tide Council** | Coral (boardwalk) | Every 2 days | Day 0 | Day 0, 2, 4, 6... |
| **The Foundry** | Iron (lantern row) | Every 3 days | Day 1 | Day 1, 4, 7, 10... |
| **The Admiralty** | Deep (frontier) | Every 4 days | Day 2 | Day 2, 6, 10, 14... |

**Key design properties:**
- Tide (the starter shop) refreshes most frequently — reliable but common stock
- Foundry refreshes on a 3-day cycle that sometimes aligns with Hero Days, sometimes doesn't
- Admiralty refreshes slowest — rare stock, long waits, highest gamble value
- The stagger offsets mean all three shops are NEVER fresh on the same day
- Some days have zero fresh shops (Day 3, 5, 8...) — these are pure work days with no shopping temptation

### 2.2 Refresh Mechanics

On refresh:
1. All unsold slots refill with new weighted-random picks from the faction's card pool
2. Sold-out slots are cleared and repopulated
3. The "FRESH STOCK" indicator appears on the shop facade (Toast bark from merchant NPC)
4. Previously unsold cards from the old inventory are gone — if you didn't buy it, you missed it

Between refreshes:
- The shop displays whatever remains from the last refresh
- Bought slots show "SOLD OUT" (not replaced until next refresh)
- If all 5 slots are sold out, the merchant has a defeated bark: "Come back when I've restocked, Gleaner."
- Approaching a sold-out shop triggers a specific bark pool: `merchant.<faction>.soldout`

### 2.3 Why Independent of Hero Cycle

The hero cycle is 3 days. If shop refresh was tied to hero cycles, the player would always have fresh stock on the same cadence as their payout. That's too comfortable. By making shop refresh independent:

- Sometimes you get paid (Hero Day) but the shops are picked over — you sit on gold
- Sometimes shops refresh on a work day when you're broke — you see cards you can't afford
- The Foundry's 3-day cycle creates occasional alignments with Hero Day payouts — those are jackpot shopping days
- The Admiralty's 4-day cycle means some hero cycles have no Admiralty refresh at all — rare cards stay rare

---

## 3. Sold-Out States as Core Mechanic

### 3.1 The Slot Economy

Each shop has 5 inventory slots. The rarity distribution per refresh:

| Slot | Tide (2-day) | Foundry (3-day) | Admiralty (4-day) |
|------|-------------|----------------|-------------------|
| 1 | Common (60%) / Uncommon (40%) | Common (40%) / Uncommon (50%) / Rare (10%) | Uncommon (30%) / Rare (50%) / Epic (20%) |
| 2 | Common (60%) / Uncommon (40%) | Common (40%) / Uncommon (50%) / Rare (10%) | Uncommon (30%) / Rare (50%) / Epic (20%) |
| 3 | Common (80%) / Uncommon (20%) | Uncommon (60%) / Rare (30%) / Epic (10%) | Rare (40%) / Epic (40%) / Legendary (20%) |
| 4 | Uncommon (50%) / Rare (40%) / Epic (10%) | Rare (50%) / Epic (40%) / Legendary (10%) | Epic (50%) / Legendary (50%) |
| 5 | **Wildcard** — any rarity, weighted by rep tier | **Wildcard** — any rarity, weighted by rep tier | **Wildcard** — any rarity, weighted by rep tier |

**Design intent:** Slots 1-2 are bread-and-butter. Slot 3 is the mid-tier impulse buy. Slot 4 is the aspirational card the player might not afford yet. Slot 5 is the gamble — it could be anything.

### 3.2 Sold-Out Frequency

With 5 slots and a staggered refresh, the expected sold-out pattern is:

- **Day of refresh:** 5/5 slots available. Player buys 1-2 if they have gold.
- **Day after refresh:** 3-4/5 slots remain. Good cards may already be gone.
- **Two days after refresh (Tide only):** 1-3/5 slots remain. Slim pickings.
- **Three+ days after refresh (Foundry/Admiralty):** 0-2/5 slots remain. Mostly sold out.

The player who visits a shop every day sees the inventory depleting. This creates FOMO: "That Rare ♠ Riposte was there yesterday... should I have bought it?"

### 3.3 Non-Stocking Items (Card Slots)

Cards are the primary non-stocking shop item. They don't restock between refreshes — once bought, the slot is empty until the next refresh cycle. This is the core scarcity mechanic.

**Restocking supplies** (crate fill ingredients, trap components, cleaning supplies) use a separate system: they're always available in unlimited quantity at fixed prices. The player can always buy supplies. They can NOT always buy cards.

This split creates the gamble: **do you spend your gold on guaranteed utility (supplies for restocking) or speculative power (cards that might not appear again for days)?**

### 3.4 The Card Gamble

The player with instant capital (e.g., fresh mailbox payout of 200 coins) faces this choice:

```
OPTION A: Buy supplies (guaranteed value, cheap)
  → 3g × 12 crate ingredients + 5× water bottles (1g) = ~41g spent
  → Guaranteed: all crate slots filled next dungeon run
  → Guaranteed: ~15-35 coins back from seal rewards + readiness payout
  → Net: roughly break-even on gold, but readiness jumps 30-40%
  → This is the SAFE play. Supplies are so cheap it barely dents capital.

OPTION B: Buy cards (speculative power, expensive)
  → 200g buys 1 Rare card (100g) + 1 Uncommon (60g) + 1 Common (30g)
  → IF the cards synergize with your deck: combat power jumps significantly
  → IF the cards don't synergize: 190g spent on dead weight
  → But: those specific cards might not appear again for 3-4 days
  → And: the Admiralty had a Legendary in slot 4 that costs 300g...
  → Supplies cost so little you can ALSO buy a handful (10-20g) and
     still afford the Uncommon. The gamble is card vs card, not card vs work.

OPTION C: Save for the Legendary (delayed gamble)
  → Hold your 200g. Buy 40g of supplies (covers a full dungeon run).
  → Earn 100g more from the restocked dungeon.
  → IF the Legendary is still in stock when you have 300g: jackpot
  → IF someone else buys it (NPC shoppers? future feature): devastating
  → IF the shop refreshes before you save enough: it's gone
  → Supplies are so cheap that saving for cards never means skipping work.
```

This is the Stardew Valley traveling merchant problem. The player who buys impulsively stays competitive but never gets ahead. The player who saves takes a risk — but the jackpot card can carry them through 3+ hero cycles.

---

## 4. Shop NPC Barks (Scarcity-Aware)

### 4.1 Bark Pools

```
merchant.tide.fresh       — "New shipment! Coral Traders got fresh cards today."
merchant.tide.soldout     — "Picked clean, Gleaner. Try again in a couple days."
merchant.tide.lowstock    — "Only a few left. The good stuff goes fast around here."

merchant.foundry.fresh    — "Foundry forge ran overnight. New stock just arrived."
merchant.foundry.soldout  — "All out. Next batch is... let me check... couple days."
merchant.foundry.lowstock — "Down to the dregs. Take it or leave it."

merchant.admiralty.fresh  — "Rare goods from the deep fleet. Don't see these often."
merchant.admiralty.soldout — "The Admiral's supply lines are long. Patience, Gleaner."
merchant.admiralty.lowstock — "Last of the Admiral's shipment. Won't see this again soon."
```

### 4.2 Proximity Bark Triggers

When the player walks within 3 tiles of a shop facade:
- **Fresh stock (refresh today):** Fire `merchant.<faction>.fresh` bark. Once per day.
- **Low stock (1-2 slots remaining):** Fire `merchant.<faction>.lowstock` bark. Once per visit.
- **Sold out (0 slots):** Fire `merchant.<faction>.soldout` bark. Once per visit.

This means the player walking through town hears the economic state of the world. "Fresh stock!" creates urgency. "Picked clean" creates regret.

---

## 5. Interaction with Hero Day Payouts

### 5.1 The Payout-to-Shop Pipeline

```
HERO DAY EVENING:
  Payout arrives in mailbox ─────────── Gold in hand
                                         │
                                    ┌────┴────┐
                                    │ WHICH   │
                                    │ SHOPS   │
                                    │ ARE     │
                                    │ FRESH?  │
                                    └────┬────┘
                                         │
              ┌──────────────┬───────────┴───────────┐
              ▼              ▼                        ▼
         Tide fresh?    Foundry fresh?          Admiralty fresh?
         (2-day cycle)  (3-day cycle)           (4-day cycle)
              │              │                        │
         Maybe yes      Rare alignment          Very rare alignment
         Common cards   Mid-tier cards          Premium cards
         Affordable     Stretch budget          All-in or nothing
```

The staggered cycles mean the player's payout-to-purchase pipeline is different every Hero Day:
- **Lucky alignment (Foundry + Hero Day):** Player can buy mid-tier cards immediately after payout. Feels rewarding.
- **Unlucky alignment (no fresh shops):** Player sits on gold for 1-2 days. Builds anticipation. Tempts them to buy supplies instead.
- **Admiralty alignment (rare):** The richest shopping opportunity. Player may blow their entire payout on one Legendary card.

### 5.2 The Accumulated Mailbox Interaction

When a player opens 3+ accumulated mailbox reports at once (the big payout explosion from GAP_ANALYSIS.md §3.1), they suddenly have massive capital. But:

- The shops haven't refreshed any faster — they're still on their own cycles
- The player has more gold than any single shop can absorb
- They must spread their spending across multiple refresh windows
- OR blow it all at the Admiralty on that one Legendary if it's in stock
- This creates a delicious "problem of abundance" — too much gold, not enough cards to buy

---

## 6. Implementation Spec

### 6.1 Shop State Extension

```javascript
// In shop.js, add per-faction refresh tracking:
var _refreshState = {
  tide:      { lastRefreshDay: 0, interval: 2, inventory: [] },
  foundry:   { lastRefreshDay: 1, interval: 3, inventory: [] },
  admiralty:  { lastRefreshDay: 2, interval: 4, inventory: [] }
};

function _shouldRefresh(factionId, currentDay) {
  var state = _refreshState[factionId];
  if (!state) return true;
  var daysSince = currentDay - state.lastRefreshDay;
  return daysSince >= state.interval;
}

function _refreshIfNeeded(factionId) {
  if (typeof DayCycle === 'undefined') return;
  var currentDay = DayCycle.getDay();
  if (_shouldRefresh(factionId, currentDay)) {
    _refreshState[factionId].lastRefreshDay = currentDay;
    _refreshState[factionId].inventory = _generateInventory(factionId);
  }
}
```

### 6.2 Sold-Out Slot Rendering

```javascript
// In merchant-peek.js or shop UI, render sold-out slots as:
// ┌─────────┐
// │  SOLD   │  (dimmed, grey text)
// │  OUT    │
// │ ░░░░░░ │  (empty card silhouette)
// └─────────┘
// Remaining slots show the card with price as normal.
```

### 6.3 DayCycle Integration

```javascript
// In game.js init, wire shop refresh to day change:
DayCycle.setOnDayChange(function (newDay) {
  // Check each faction — refresh if its interval has elapsed
  Shop.checkRefresh(newDay);  // New method
});
```

### 6.4 Bark Wiring

```javascript
// In en.js, register new bark pools:
BarkLibrary.register('merchant.tide.fresh', [
  { text: 'New shipment in! Coral Traders got fresh cards today.', speaker: 'Coral Merchant', weight: 2 },
  { text: 'Just unpacked a new crate. Come see what the tides brought in.', speaker: 'Coral Merchant' }
]);
BarkLibrary.register('merchant.tide.soldout', [
  { text: 'Picked clean, Gleaner. Try again in a couple days.', speaker: 'Coral Merchant' },
  { text: 'Nothing left. Tides come and go — check back soon.', speaker: 'Coral Merchant' }
]);
// ... similar for foundry and admiralty
```

### 6.5 Restocking Supplies (Always Available)

Supplies use a separate unlimited pool, not subject to refresh cycles. Supply prices are deliberately cheap (1–10g) — these are junk items, not power cards. The player should never hesitate to buy a mop refill. The real spending decision is cards.

```javascript
// Supply types available at every shop regardless of card stock.
// Prices are junk-tier (1-10g). Card prices start at 30g common.
// The gap between supply cost and card cost IS the gamble.
var SUPPLY_STOCK = {
  // ── Crate fill items (tag-matched to crate frame slots) ──
  stale_rations:     { price: 2,  unlimited: true, tags: ['HP_FOOD']  },
  dead_cell:         { price: 3,  unlimited: true, tags: ['BATTERY']  },
  weak_tonic:        { price: 2,  unlimited: true, tags: ['ENERGY']   },
  scrap_parchment:   { price: 4,  unlimited: true, tags: ['SCROLL']   },
  glass_bead:        { price: 5,  unlimited: true, tags: ['GEM']      },
  generic_salvage:   { price: 3,  unlimited: true, tags: ['WILDCARD'] },

  // ── Torch fuel ──
  torch_oil:         { price: 3,  unlimited: true },  // generic fuel, partial score
  water_bottle:      { price: 1,  unlimited: true },  // hydration + extinguish

  // ── Cleaning supplies ──
  cleaning_rag:      { price: 1,  unlimited: true },  // slowest tool, cheapest
  mop_head:          { price: 4,  unlimited: true },  // mid-tier speed
  scrub_brush:       { price: 8,  unlimited: true },  // fastest, most expensive supply

  // ── Misc maintenance ──
  bone_powder:       { price: 3,  unlimited: true },  // corpse processing ingredient
  trap_spring:       { price: 2,  unlimited: true }   // spare parts (future use)
};
```

**Price design rationale:**
- A single corpse loot (1–2g) buys a water bottle or a rag. The very first thing the player loots pays for the very first thing they need.
- A sealed crate (2–5g reward) pays for 1–2 crate ingredients. Sealing pays for restocking — the loop is self-funding at small scale.
- A full bag of supplies (16 items × avg 3g) costs ~48g — roughly one floor-completion payout (10–30g) plus a few corpse loots. One good dungeon run funds the next supply haul.
- The most expensive supply (scrub_brush at 8g) is still cheaper than the cheapest combat card (Common at 30g). The spending tiers never overlap.

This ensures the player can always work even when card shops are empty. The scarcity is in power (cards), not in capability (supplies).

---

## 7. Buff Item Tier (9–30g) — Passive Equipment

### 7.1 The Gap and Its Purpose

The price landscape has three tiers with a deliberate gap between them:

```
1–8g    SUPPLIES        junk, always available, no thought
───────  GAP  ──────────
9–30g   BUFF ITEMS      passive equipment, meaningful decisions
───────  GAP  ──────────
30–300g COMBAT CARDS    speculative power, refresh-gated
```

Buff items fill the 9–30g range. They are **passive equipment** the player equips for permanent bonuses — bag expansion, cleaning speed, loot range, item preservation. Unlike cards (which are combat-only and speculative), buff items improve the maintenance loop directly. Unlike supplies (which are consumed), buff items persist.

Buff items are always available at shops alongside supplies. They don't rotate with card refresh cycles — if you can see the shop, you can buy the buff. The decision is which buff to buy first with limited starting gold.

### 7.2 Buff Item Catalog (from Gone Rogue adaptations + Gleaner originals)

**Sourced from Gone Rogue item patterns** (re-skinned for janitor fantasy). Item IDs continue the ITM-0XX equipment range.

#### Bag Expansion (passive, equipSlot: "passive")

| Item | Price | Effect | Gone Rogue Source | Gleaner Fantasy |
|------|-------|--------|-------------------|----------------|
| **Cargo Sling** | 9g | `bag_slots: +1` | ITM-060 Cargo Webbing (preservation) | Shoulder strap. Cheap, immediate +1 slot. |
| **Pack Mule Strap** | 18g | `bag_slots: +3` | ITM-061 Tactical Harness (scaled) | Heavy-duty carry harness. The first "wow" purchase. |
| **Foreman's Harness** | 28g | `bag_slots: +4, item_save: 0.15` | ITM-061 Tactical Harness (direct) | Boss-tier carry rig. +4 slots AND 15% chance items survive death. |

#### Cleaning Efficiency (passive)

| Item | Price | Effect | Gone Rogue Source | Gleaner Fantasy |
|------|-------|--------|-------------------|----------------|
| **Elbow Grease** | 10g | `clean_speed: +0.25` | — (new) | Scrubbing is 25% faster. Stacks with tool tier. |
| **Mop Wringer** | 15g | `tool_durability: +0.30` | ITM-084 Bandolier (resource refund) | Cleaning tools last 30% longer before breaking. |
| **Industrial Solvent** | 22g | `clean_radius: +1` | ITM-085 Demolition Vest (aoe_splash) | Each scrub cleans adjacent tile too. The mop becomes a broom. |

#### Loot & Collection (passive)

| Item | Price | Effect | Gone Rogue Source | Gleaner Fantasy |
|------|-------|--------|-------------------|----------------|
| **Loot Magnet** | 12g | `auto_collect: currency+items, range: 3` | ITM-050 Magnet | Walk past loose coins and items — they fly to you. |
| **Keen Eye** | 10g | `interact_range: +1` | ITM-095 Patience Module (adapted) | See interactable objects from 1 tile further. Highlights crates/detritus. |
| **Salvage Gloves** | 14g | `salvage_bonus: +1` | ITM-086 Recycler (adapted) | +1 item from corpse processing. More loot per body. |

#### Dungeon Navigation (passive)

| Item | Price | Effect | Gone Rogue Source | Gleaner Fantasy |
|------|-------|--------|-------------------|----------------|
| **Watchman's Lamp** | 9g | `light_radius: +1` | ITM-094 Proximity Sensor | See 1 tile further in darkness. Cheap, meaningful in dungeons. |
| **Cobweb Sensor** | 11g | `cobweb_highlight: true` | ITM-087 Pattern Lens (adapted) | Cobwebs glow faintly on minimap. Helps find extra credit. |
| **Readiness Sense** | 20g | `readiness_per_tile: true` | ITM-087 Pattern Lens (direct) | Each tile shows its readiness contribution. The perfectionist's tool. |

#### Torch & Trap Specialization (passive)

| Item | Price | Effect | Gone Rogue Source | Gleaner Fantasy |
|------|-------|--------|-------------------|----------------|
| **Fuel Pouch** | 12g | `torch_fuel_save: 0.25` | ITM-080 Surge Protector (resource save) | 25% chance torch fuel isn't consumed on fill. Stretch your oil. |
| **Steady Hand** | 15g | `trap_rearm_speed: +0.50` | ITM-082 Recoil Dampener (adapted) | Traps rearm 50% faster. 600ms → 300ms. |
| **Torch Tongs** | 18g | `torch_extinguish_no_water: true` | — (new) | Extinguish torches without water bottle. Bare-hand dousing. |

#### Combat Survival (passive — for the hero encounters)

| Item | Price | Effect | Gone Rogue Source | Gleaner Fantasy |
|------|-------|--------|-------------------|----------------|
| **Rat Guard** | 9g | `defense: +1 vs rat` | ITM-080 Surge Protector (tag_risk_reduction) | +1 defense against vermin-type enemies. Starter armor. |
| **Quick Dodge** | 16g | `evasion: +0.10` | ITM-998 Amazon Box (sightline_evasion) | 10% chance to dodge enemy attacks entirely. |
| **Thick Apron** | 25g | `defense: +2` | ITM-035 Pressure Suit Fragment | Foundry-grade work apron. Flat +2 defense. The big defensive buy. |

### 7.3 Starting Class Gold (Hidden at Selection)

New players choose a class at game start. The class determines starting gold, but the amount is **not displayed during selection** — the player discovers their budget when they first check their wallet. This creates an early discovery moment: "Oh, I can afford that harness!" or "Hmm, only 10 coins... gotta prioritize."

| Class | Starting Gold | Design Intent |
|-------|-------------|---------------|
| **Scrubber** (entry-level janitor) | 10g | Can buy 1 cheap buff (Watchman's Lamp 9g, Cargo Sling 9g, Rat Guard 9g) OR a pile of supplies. Forces an early choice. |
| **Stockhand** (warehouse background) | 40g | Comfortable. Buys 1–2 mid-tier buffs + a full supply haul. The "I know what I'm doing" start. |
| **Foreman** (experienced, promoted) | 75g | Can kit out with Foreman's Harness (28g) + Loot Magnet (12g) + supplies (35g). Or save for a card. |
| **Legacy** (previous employee's gear) | 100g | Can buy almost anything in the buff tier. The "fresh start with advantages" class. May carry a pre-equipped item instead of gold. |

**Class stat differences** (beyond gold) are out of scope for this doc — documented separately in CLASS_SELECTION_ROADMAP (TODO: create).

### 7.4 Price Tier Summary (Complete)

```
TIER 1 — SUPPLIES (1-8g)
  water_bottle 1g | cleaning_rag 1g | stale_rations 2g | torch_oil 3g
  generic_salvage 3g | mop_head 4g | scrap_parchment 4g | glass_bead 5g
  scrub_brush 8g
  Always available. Junk. Buy without thinking.

TIER 2 — BUFF ITEMS (9-30g)
  Cargo Sling 9g | Watchman's Lamp 9g | Rat Guard 9g | Keen Eye 10g
  Elbow Grease 10g | Cobweb Sensor 11g | Loot Magnet 12g | Fuel Pouch 12g
  Salvage Gloves 14g | Mop Wringer 15g | Steady Hand 15g | Quick Dodge 16g
  Pack Mule Strap 18g | Torch Tongs 18g | Readiness Sense 20g
  Industrial Solvent 22g | Thick Apron 25g | Foreman's Harness 28g
  Always available. Meaningful. Think before buying.

TIER 3 — COMBAT CARDS (30-300g)
  Common 30g | Uncommon 60g | Rare 100g | Epic 200g | Legendary 300g
  Refresh-gated. Speculative. Gamble your capital.
```

---

## 8. Economy Balance Implications

### 8.1 Gold Sink Tuning

With staggered refreshes, gold accumulates faster than it can be spent on cards. This is intentional — it creates the "gamble your capital" moment when a good card finally appears. But it also means the economy needs additional gold sinks:

| Sink | Cost Range | Purpose | Frequency |
|------|-----------|---------|-----------|
| Supplies | 1–8g per item | Guaranteed value, always available, junk-tier pricing | Every dungeon run (~30-50g haul) |
| Cards | 30–300g each | Speculative power, refresh-gated | 1-2 per refresh window |
| Bonfire upgrades (future) | 50–200g | Permanent quality-of-life | Milestone purchases |
| Tool upgrades (Phase F) | 100–500g | Guild-rank gated, one-time | Progression milestones |
| Reanimation components | 5–15g | Readiness investment | Per hero cycle |

### 7.2 The "Ideal Week" Economy Flow

```
Day 0 (Hero Day): Payout arrives. 60-200g depending on readiness.
  → Tide shop is fresh (offset 0). Buy 1-2 common/uncommon cards. 30-120g spent.
  → Grab supplies for next dungeon run (~30-50g, barely dents payout).
  → Foundry is stale (offset 1, refreshes tomorrow). Hold remaining gold.

Day 1 (Work Day): Foundry refreshes.
  → Check Foundry stock. If good rare card: buy (100g). If mediocre: skip.
  → Top off supplies if needed (another 20-30g — cheap enough to not think about).
  → Descend. Work.

Day 2 (Work Day): Admiralty refreshes. Tide refreshes again.
  → Admiralty has premium stock. Do I have enough for that Epic?
  → Tide has fresh commons — grab any cheap utility cards.
  → Final dungeon push before tomorrow's Hero Day.

Day 3 (Hero Day): Payout arrives again.
  → Foundry stale. Admiralty still has yesterday's stock (1-2 slots left).
  → That Legendary in Admiralty slot 4... 300g... I only have 250...
  → Do one emergency dungeon scavenge run for 50g. Race back to buy.
```

This creates exactly the Stardew Valley "one more thing before bed" energy. The shops drive the player's daily priorities as much as the dungeons do.

---

## 9. Edge Cases

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| Player never visits a shop | No inventory depletion, no FOMO | Merchant proximity barks fire in town. "Fresh stock" bark is hard to ignore. |
| All shops sold out on Hero Day | Player can't spend payout on cards | By design. Supplies are always available. Gold sits until next refresh. |
| Player buys all 5 slots immediately | Shop has nothing for 2-4 days | Correct behavior. The sold-out state IS the mechanic. |
| Shop refresh on a day nobody visits | Cards go un-bought, replaced next refresh | Intended. Creates the "missed the window" regret. |
| Multiple visits same day | Player returns to check if stock changed | No change within a day. Bark reminds: "Same stock as this morning, Gleaner." |
| Day counter reset (new game) | Refresh offsets must re-anchor | Reset `_refreshState.lastRefreshDay` to initial offsets on `Shop.reset()`. |

---

## 10. Cross-References

| Section | Links To |
|---------|----------|
| §2 Refresh Schedule | DOC-7 §4.2 (Hero Cycle) — deliberately misaligned |
| §3 Sold-Out | DOC-7 §3.3 ("Just One More Crate") — scarcity creates the same pull for cards |
| §4 Barks | DOC-9 §6 (Vendor Barks) — extend bark taxonomy with stock-awareness |
| §5 Payout Pipeline | GAP_ANALYSIS §3.1 (Accumulated Mailbox) — big payouts meet limited shops |
| §6 Implementation | engine/shop.js — extend with refresh state, engine/day-cycle.js — wire day change |
| §7 Buff Items | DEPTH3_CLEANING_LOOP_BALANCE §4 (bag 21+N) — buff items drive bag expansion |
| §7.3 Starting Classes | CLASS_SELECTION_ROADMAP (TODO) — gold ranges, stat differences |
| §8 Balance | DOC-7 §3.1 (Drip→Jackpot) — card purchases are the jackpot layer |

---

*This document defines the shop refresh economy. It should be implemented alongside or immediately after the bed/sleep mechanic (GAP_ANALYSIS Sprint 1), as the day counter drives all refresh timing.*

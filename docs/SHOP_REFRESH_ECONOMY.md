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
OPTION A: Buy supplies (guaranteed value)
  → 40g × 5 crate ingredients = 200g spent
  → Guaranteed: 5 crates sealed next dungeon run
  → Guaranteed: ~25-40 coins back from seal rewards
  → Net: -160g but readiness improved → larger hero payout next cycle

OPTION B: Buy cards (speculative power)
  → 200g buys 1 Rare card (100g) + 1 Uncommon (60g) + 1 Common (30g)
  → IF the cards synergize with your deck: combat power jumps significantly
  → IF the cards don't synergize: 190g spent on dead weight
  → But: those specific cards might not appear again for 3-4 days
  → And: the Admiralty had a Legendary in slot 4 that costs 300g...

OPTION C: Save for the Legendary (delayed gamble)
  → Hold your 200g. Earn 100g more from dungeon runs.
  → IF the Legendary is still in stock when you have 300g: jackpot
  → IF someone else buys it (NPC shoppers? future feature): devastating
  → IF the shop refreshes before you save enough: it's gone
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

Supplies use a separate unlimited pool, not subject to refresh cycles:

```javascript
// Supply types available at every shop regardless of card stock:
var SUPPLY_STOCK = {
  crate_ingredient:  { price: 25, unlimited: true },
  trap_component:    { price: 35, unlimited: true },
  cleaning_solvent:  { price: 15, unlimited: true },
  bone_component:    { price: 20, unlimited: true },
  mechanical_parts:  { price: 30, unlimited: true }
};
```

This ensures the player can always work even when card shops are empty. The scarcity is in power (cards), not in capability (supplies).

---

## 7. Economy Balance Implications

### 7.1 Gold Sink Tuning

With staggered refreshes, gold accumulates faster than it can be spent on cards. This is intentional — it creates the "gamble your capital" moment when a good card finally appears. But it also means the economy needs additional gold sinks:

| Sink | Purpose | Frequency |
|------|---------|-----------|
| Supplies | Guaranteed value, always available | Every dungeon run |
| Cards | Speculative power, refresh-gated | 1-2 per refresh window |
| Bonfire upgrades (future) | Permanent quality-of-life | Milestone purchases |
| Tool upgrades (Phase F) | Guild-rank gated, one-time | Progression milestones |
| Reanimation components | Readiness investment | Per hero cycle |

### 7.2 The "Ideal Week" Economy Flow

```
Day 0 (Hero Day): Payout arrives. 60-200g depending on readiness.
  → Tide shop is fresh (offset 0). Buy 1-2 common/uncommon cards. 30-120g spent.
  → Foundry is stale (offset 1, refreshes tomorrow). Hold remaining gold.

Day 1 (Work Day): Foundry refreshes.
  → Check Foundry stock. If good rare card: buy (100g). If mediocre: skip.
  → Spend remaining gold on supplies for dungeon restocking.
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

## 8. Edge Cases

| Edge Case | Risk | Mitigation |
|-----------|------|-----------|
| Player never visits a shop | No inventory depletion, no FOMO | Merchant proximity barks fire in town. "Fresh stock" bark is hard to ignore. |
| All shops sold out on Hero Day | Player can't spend payout on cards | By design. Supplies are always available. Gold sits until next refresh. |
| Player buys all 5 slots immediately | Shop has nothing for 2-4 days | Correct behavior. The sold-out state IS the mechanic. |
| Shop refresh on a day nobody visits | Cards go un-bought, replaced next refresh | Intended. Creates the "missed the window" regret. |
| Multiple visits same day | Player returns to check if stock changed | No change within a day. Bark reminds: "Same stock as this morning, Gleaner." |
| Day counter reset (new game) | Refresh offsets must re-anchor | Reset `_refreshState.lastRefreshDay` to initial offsets on `Shop.reset()`. |

---

## 9. Cross-References

| Section | Links To |
|---------|----------|
| §2 Refresh Schedule | DOC-7 §4.2 (Hero Cycle) — deliberately misaligned |
| §3 Sold-Out | DOC-7 §3.3 ("Just One More Crate") — scarcity creates the same pull for cards |
| §4 Barks | DOC-9 §6 (Vendor Barks) — extend bark taxonomy with stock-awareness |
| §5 Payout Pipeline | GAP_ANALYSIS §3.1 (Accumulated Mailbox) — big payouts meet limited shops |
| §6 Implementation | engine/shop.js — extend with refresh state, engine/day-cycle.js — wire day change |
| §7 Balance | DOC-7 §3.1 (Drip→Jackpot) — card purchases are the jackpot layer |

---

*This document defines the shop refresh economy. It should be implemented alongside or immediately after the bed/sleep mechanic (GAP_ANALYSIS Sprint 1), as the day counter drives all refresh timing.*

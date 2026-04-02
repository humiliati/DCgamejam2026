# Gap Coverage to Deployability — Dungeon Gleaner

> **Last Updated:** 2026-03-27
> **Scope:** All inventory, card, combat, and economy systems audited against EyesOnly patterns
> **Engine:** Dungeon Gleaner · DC Jam 2026 · Vanilla JS IIFE · LG webOS target
> **Reference:** EyesOnly `CARD_HAND_HARMONIZATION_ROADMAP`, `CROSS_ROADMAP_EXECUTION_ORDER`

---

## System Inventory — Current State

| # | Module | Lines | Layer | Status | EyesOnly Analogue |
|---|--------|-------|-------|--------|-------------------|
| 1 | `card-system.js` | ~180 | L2 | ✅ Live | CardStateAuthority + GAMESTATE card arrays |
| 2 | `player.js` | ~440 | L1 | ✅ Live (patched) | GAMESTATE inventory containers |
| 3 | `shop.js` | ~400 | L3 | ✅ Live (patched) | Shop + economy transactions |
| 4 | `salvage.js` | ~445 | L1 | ✅ Live | Loot pipeline + faction economy |
| 5 | `combat-bridge.js` | ~250 | L3 | ✅ Live | STR combat integration layer |
| 6 | `combat-engine.js` | ~200 | L2 | ✅ Live | Core RPS combat resolution |
| 7 | `nch-widget.js` | ~180 | L2 | ✅ Live | NCH capsule overlay |
| 8 | `combat-report.js` | ~150 | L2 | ✅ Live | Post-combat overlay |
| 9 | `enemy-sprites.js` | ~140 | L1 | ✅ Live | Enemy visual state machine |
| 10 | `death-anim.js` | ~160 | L2 | ✅ Live | Fold/poof death animations |
| 11 | `card-fan.js` | ~200 | L2 | ✅ Live | Hand fan component |
| 12 | `synergy-engine.js` | ~120 | L2 | ✅ Live | Tag combo resolution |
| 13 | `menu-box.js` | ~350 | L2 | ✅ Live | OoT rotating box menu |
| 14 | `menu-faces.js` | ~400 | L3 | ✅ Live | Face content renderers |
| 15 | `quick-bar.js` | ~130 | L2 | ✅ Live | 3 equipped-item quick-slots |
| 16 | `debrief-feed.js` | ~170 | L2 | ✅ Live | CRT debrief panel |
| 17 | `loot-tables.js` | ~100 | L1 | ✅ Live | Floor loot generation |

**Total engine:** 58 modules, ~7,500 lines (estimated).

---

## Bugs Fixed This Session

| # | Bug | Module | Fix | Risk |
|---|-----|--------|-----|------|
| B1 | `Player.spendCurrency()` missing — Shop.buy() crashes | player.js | Added `spendCurrency(amount)` method + exposed in API | ✅ Zero — additive |
| B2 | `Player.hand[]` vs `CardSystem._hand` duplication | player.js | Player.getHand/addToHand/removeFromHand now proxy to CardSystem | ⚠ Low — fallback preserved |
| B3 | No sell path for salvage parts | shop.js | Added `Shop.sellPart(itemId)` — bag → gold + Salvage.recordSale | ✅ Zero — additive |
| B4 | Card sales don't build faction reputation | shop.js | `Shop.sell()` now calls `Salvage.recordSale()` | ✅ Zero — additive |
| B5 | No game.js handler for part selling | game.js | Added `_shopSellPart(bagIndex)` with HUD/widget/debrief refresh | ✅ Zero — additive |

---

## Gap Analysis — EyesOnly Alignment

### Architecture Comparison

| Concept | EyesOnly | Dungeon Gleaner | Gap |
|---------|----------|----------------|-----|
| Single source of truth | CardStateAuthority → GAMESTATE | CardSystem (canonical hand/deck) | ⚠ No event bus — direct calls |
| Event-driven re-render | `_emit()` → subscriber re-render | `_refreshPanels()` → NchWidget.refresh() | Functional but tightly coupled |
| Card identity | CardRef `{ id, qty, meta }` everywhere | Full card objects in hand/deck | 🔴 No ref abstraction |
| Dynamic card persistence | CI-* instances in `cardInstances` map | None — rolled cards are ephemeral | 🔴 Cards lost on save/load |
| Hydration | `hydrateCard(ref)` universal resolver | `CardSystem.getById(id)` — registry only | ⚠ No dynamic card hydration |
| Zone boundaries | Hand / Backup / Vault / Active Item / Discard | Hand / Deck / Bag / Stash / Equipped | ✅ Comparable containers |
| Transfer manager | CardTransferManager — all cross-container | Direct array mutations | ⚠ No transfer validation layer |
| Inventory management | InventoryManagement — stash/retrieve/equip | Player.equip/unequip (not yet wired to UI) | ⚠ UI not connected |
| Policy flags | stealable/plantable/destroyable/triggerable | None | 🟡 Not needed for jam scope |
| GC for orphaned cards | `gcCardInstances()` scans all containers | None needed (no persistent instances) | 🟡 Post-jam concern |

### Severity Legend

- ✅ **Aligned** — matches EyesOnly or functionally equivalent
- ⚠ **Divergent but functional** — works for jam scope, technical debt for post-jam
- 🔴 **Blocking gap** — will cause visible bugs or data loss if not addressed
- 🟡 **Post-jam** — not needed for DC Jam 2026 deployability

---

## Execution Tiers to Deployability

Modeled after EyesOnly's CROSS_ROADMAP_EXECUTION_ORDER: 4 tiers, independently shippable steps, dependencies flow downward.

### Tier 0 — Critical Path (Jam Blocker Fixes)

Must be complete before April 5 submission. Each item is independently shippable.

| # | Work Item | Module(s) | Depends On | Status | Est. |
|---|-----------|-----------|------------|--------|------|
| T0.1 | ~~Add Player.spendCurrency()~~ | player.js | — | ✅ DONE | — |
| T0.2 | ~~Unify hand authority (Player → CardSystem proxy)~~ | player.js | — | ✅ DONE | — |
| T0.3 | ~~Add Shop.sellPart() for salvage items~~ | shop.js, game.js | T0.1 | ✅ DONE | — |
| T0.4 | ~~Wire card sales to faction reputation~~ | shop.js | — | ✅ DONE | — |
| T0.5 | ~~Wire equip/unequip to MenuFaces Face 2~~ | menu-faces.js, game.js | — | ✅ DONE | — |
| T0.6 | ~~Add "Sell Parts" sub-face to shop Face 2~~ | menu-faces.js | T0.3 | ✅ DONE | — |
| T0.7 | ~~Battery pip row in HUD~~ | hud.js, index.html | — | ✅ DONE | — |
| T0.8 | ~~DialogBox vendor greetings (NPC interaction)~~ | game.js | — | ✅ DONE | — |

**Critical path:** T0.5 → T0.6 (equip UI enables sell-parts UI in same face).
**Tier 0 complete:** 8/8 ✅ — all jam blockers resolved.

### Tier 1 — Combat Polish (Jam Quality Bar)

Improves the combat loop to feel complete. Not strictly blocking but affects jam scoring.

| # | Work Item | Module(s) | Depends On | Status | Est. |
|---|-----------|-----------|------------|--------|------|
| T1.1 | Enemy sprite particle FX (CSS/canvas) | enemy-sprites.js, raycaster.js, game.js | — | ✅ DONE | — |
| T1.2 | Suit-based synergy system (♣>♦>♠>♣ RPS + ♥ rule-breaker) | synergy-engine.js, combat-engine.js, card-fan.js, data/*.json | — | ✅ DONE | — |
| T1.3 | Drag-to-reorder + drag-drop-to-stack + swipe-to-fire | card-fan.js, card-stack.js, combat-bridge.js | — | ✅ DONE | — |
| T1.4 | Suit advantage toast + visual feedback during resolution | suit-toast.js, combat-bridge.js | T1.2 | ✅ DONE | — |
| T1.5 | Enemy attack telegraph (intent display) | enemy-intent.js, raycaster.js | — | ✅ DONE | — |
| T1.6 | Death anim corpse tile rendering in raycaster | death-anim.js, combat-bridge.js | — | ✅ DONE | — |

### Tier 2 — Economy Loop Closure (Playable End-to-End)

Completes the harvest → sell → buy → equip → fight loop.

| # | Work Item | Module(s) | Depends On | Status | Est. |
|---|-----------|-----------|------------|--------|------|
| T2.1 | Bag inventory viewer (Face 2 sub-pane) | menu-faces.js | T0.5 | ✅ DONE | — |
| T2.2 | Stash transfer at bonfire tiles | menu-faces.js, player.js | T2.1 | ✅ DONE | — |
| T2.3 | Faction rep tier unlock feedback in shop | menu-faces.js, shop.js | T0.4 | ✅ DONE | — |
| T2.4 | Floor transition deck reshuffle + hand redraw | game.js, card-system.js | — | ✅ DONE | — |
| T2.5 | Victory/Game Over stat summaries from SessionStats | victory-screen.js, game-over-screen.js | — | ✅ DONE | — |
| T2.6 | NCH widget drag-to-reorder cards | nch-widget.js | — | ❌ TODO | 2h |

### Tier 3 — Post-Jam / LG Content Store

Not needed for jam submission. Aligns with EyesOnly's long-term architecture.

| # | Work Item | Module(s) | EyesOnly Pattern | Est. |
|---|-----------|-----------|-----------------|------|
| T3.1 | CardRef abstraction (`{ id, qty, meta }`) | card-system.js, all consumers | CHH Step 1–3 | 4h |
| T3.2 | Event bus for card state changes | new: card-events.js | CardStateAuthority `_emit()` | 3h |
| T3.3 | Dynamic card instance persistence (CI-* IDs) | card-system.js, player.js | CHH Step 1B | 3h |
| T3.4 | Universal hydration function | new: card-hydrator.js | CHH Step 2 `hydrateCard()` | 2h |
| T3.5 | Transfer validation layer | new: card-transfer.js | CardTransferManager | 3h |
| T3.6 | Save/load system (GAMESTATE serialization) | new: save-system.js | GAMESTATE persistence | 4h |
| T3.7 | Policy flags on card definitions | card-system.js, data/cards.json | CHH Step 6 | 2h |
| T3.8 | Magic Remote gyro box rotation | menu-box.js | LG webOS API | 2h |
| T3.9 | Per-biome skybox presets | skybox.js | — | 3h |
| T3.10 | i18n additional language packs | data/strings/*.json | LG Content Store req | varies |

---

## Dependency Graph

```
                 ┌──────────────────────────────────────────────┐
                 │         TIER 0: JAM BLOCKERS  ✅ COMPLETE     │
                 │                                              │
  ┌────────┐    │  ┌────────┐   ┌────────┐   ┌────────┐       │
  │ T0.1-4 │    │  │  T0.5  │──►│  T0.6  │   │ T0.7-8 │       │
  │  ✅✅  │    │  │  ✅    │   │  ✅    │   │  ✅✅  │       │
  │  ✅✅  │    │  └───┬────┘   └────────┘   └────────┘       │
  └────────┘    │      │                                        │
                └──────┼────────────────────────────────────────┘
                       │
         ┌─────────────┼──────────────────────────┐
         │  TIER 1     │      TIER 2              │
         │             v                           │
         │  ┌────────┐ ┌────────┐  ┌────────┐     │
         │  │ T1.1-6 │ │  T2.1  │─►│  T2.2  │     │
         │  │combat  │ │bag view│  │stash   │     │
         │  │polish  │ └────────┘  └────────┘     │
         │  └────────┘ ┌────────┐  ┌────────┐     │
         │             │  T2.3  │  │ T2.4-6 │     │
         │             │rep fbk │  │misc    │     │
         │             └────────┘  └────────┘     │
         └────────────────────────────────────────┘

  ┌────────────────────────────────────────────────┐
  │             TIER 3: POST-JAM / LG STORE        │
  │                                                │
  │  ┌────────┐  ┌────────┐  ┌────────┐           │
  │  │ T3.1   │─►│ T3.3   │─►│ T3.4   │           │
  │  │CardRef │  │CI-* IDs│  │hydrate │           │
  │  └────────┘  └────────┘  └────────┘           │
  │  ┌────────┐  ┌────────┐  ┌────────┐           │
  │  │ T3.2   │  │ T3.5   │  │ T3.6   │           │
  │  │evt bus │  │transfer│  │save/ld │           │
  │  └────────┘  └────────┘  └────────┘           │
  │  ┌────────┐  ┌────────┐  ┌────────┐           │
  │  │ T3.7   │  │ T3.8-9 │  │ T3.10  │           │
  │  │policy  │  │LG APIs │  │ i18n   │           │
  │  └────────┘  └────────┘  └────────┘           │
  └────────────────────────────────────────────────┘
```

---

## Completion Summary

```
T0  ████████████████  8/8  100%   Jam blockers ✅
T1  ████████░░░░░░░░  3/6   50%   Combat polish
T2  ░░░░░░░░░░░░░░░░  0/6    0%   Economy loop closure
T3  ░░░░░░░░░░░░░░░░  0/10   0%   Post-jam / LG Store
```

**Totals:** 30 work items. 11 complete (Tier 0 ✅ + T1.1–T1.3), 19 remaining.
Jam-critical (T1+T2): 9 remaining items, ~12h estimated work.

---

## Recommended Sprint Schedule

| Day | Primary | Secondary | Milestone |
|-----|---------|-----------|-----------|
| ~~Mar 27~~ | ~~T0.5-T0.8, T1.1–T1.3~~ | — | ~~Tier 0 ✅ + Suit system + Drag-stack~~ |
| Mar 28 | T1.4 suit advantage toast | T1.5 enemy telegraph, T2.1 bag viewer | Combat feedback polished |
| Mar 29 | T1.6 corpse render | T2.2-T2.3 stash + rep feedback | Combat + economy |
| Mar 30 | T2.4 floor reshuffle | T2.5 victory stats | Economy loop closed |
| Mar 31 | T2.6 NCH reorder | Audio asset pass (Pass 7) | All Tier 2 done |
| Apr 1-3 | — | Playtesting, suit balance tuning, SFX | Submission ready |
| Apr 4 | — | Final build, webOS packaging | 📦 |
| Apr 5 | — | **DC Jam 2026 submission** | 🎯 |

---

## Data Mutation Map — Widget Coverage

All paths that mutate player inventory and their refresh wiring:

| Mutation | Caller | Triggers Refresh? | Via |
|----------|--------|-------------------|-----|
| `CardSystem.drawHand()` | CombatBridge._beginCombat | ✅ | NchWidget.enterCombat() |
| `CardSystem.playFromHand()` | CombatBridge.playCard | ✅ | NchWidget.updateCombat() |
| `CardSystem.addCard()` | Shop.buy | ✅ | game.js _shopBuy → _refreshPanels |
| `CardSystem.removeCard()` | Shop.sell | ✅ | game.js _shopSellFromHand → _refreshPanels |
| `Player.addToBag()` | game.js harvest handler | ✅ | _refreshPanels() |
| `Player.removeFromBag()` | Shop.sellPart | ✅ | game.js _shopSellPart → _refreshPanels |
| `Player.equip()` | (not yet wired) | ❌ | Needs T0.5 |
| `Player.unequip()` | (not yet wired) | ❌ | Needs T0.5 |
| `Player.useItem()` | QuickBar._onSlotClick | ✅ | Direct NchWidget.refresh() |
| `Shop.buy()` | game.js _shopBuy | ✅ | _refreshPanels() |
| `Shop.sell()` | game.js _shopSellFromHand | ✅ | _refreshPanels() |
| `Shop.sellPart()` | game.js _shopSellPart | ✅ | _refreshPanels() |
| `Salvage.takeLoot()` | game.js harvest handler | ✅ | _refreshPanels() |
| `Player.addCurrency()` | pickups, shop sell | ✅ | HUD.updatePlayer() |
| `Player.spendCurrency()` | Shop.buy | ✅ | HUD.updatePlayer() |

**Coverage:** 13/15 mutation paths wired. 2 pending (equip/unequip — blocked on T0.5 UI).

---

## Files Referenced

| File | Layer | Purpose | Patched? |
|------|-------|---------|----------|
| `engine/player.js` | L1 | Player state, inventory containers, currency | ✅ This session |
| `engine/card-system.js` | L2 | Card registry, collection, deck, hand | — |
| `engine/shop.js` | L3 | Faction shop buy/sell + NEW sellPart | ✅ This session |
| `engine/salvage.js` | L1 | Harvest, loot staging, faction economy | — |
| `engine/combat-bridge.js` | L3 | Combat flow orchestrator | — |
| `engine/nch-widget.js` | L2 | NCH capsule overlay | — |
| `engine/game.js` | L4 | Orchestrator, _shopSellPart handler | ✅ This session |
| `engine/menu-faces.js` | L3 | Face content renderers | Needs T0.5/T0.6 |
| `engine/quick-bar.js` | L2 | Equipped item quick-slots | — |
| `engine/combat-report.js` | L2 | Post-combat overlay | — |
| `engine/enemy-sprites.js` | L1 | Enemy visual state machine | — |
| `engine/death-anim.js` | L2 | Fold/poof death animations | — |
| `engine/synergy-engine.js` | L2 | Tag combo resolution | — |
| `engine/debrief-feed.js` | L2 | CRT debrief panel | — |

---

**Document Version:** 1.1
**Author:** Engine audit session 2026-03-27
**EyesOnly Refs:** CARD_HAND_HARMONIZATION_ROADMAP v2.0, CROSS_ROADMAP_EXECUTION_ORDER v3.0

---

## § Cross-References

> Master index: **[CROSS_ROADMAP.md](CROSS_ROADMAP.md)** — dependency-ordered execution for playable prototype

| This Section | Links To | Relationship |
|--------------|----------|-------------|
| Tier 0 (complete) | → DOC-2 §9 Phase 1–4 | T0 gates all Tutorial World phases |
| T1.5 Enemy telegraph | → DOC-5 AUDIT §2.2 | Base engine has AI behaviors; telegraph is new |
| T1.6 Corpse tile render | → DOC-2 §6.3 Wake of Carnage | Corpses feed monster reassembly in Gleaner pivot |
| T2.1 Bag viewer | → DOC-4 §17.2 Restocking | Players need to see inventory to choose restock items |
| T2.2 Stash transfer | → DOC-4 §19.2 Rep Economy | Bonfire stash enables cross-floor item strategy |
| T2.3 Rep feedback | → DOC-4 §19.1 Three Factions | Tide/Foundry/Admiralty rep drives shop gating |
| T2.5 Victory stats | → DOC-4 §17.3 Readiness Score | End-of-run readiness % is the primary score metric |
| Sprint Schedule | → DOC-6 CROSS_ROADMAP Phases A–G | Superseded by cross-roadmap daily schedule |
| Gap Analysis | → DOC-3 GONE_ROGUE Pass 3 | Stealth extraction closes "detection modifier" gap |
| Data Mutation Map | → DOC-2 §13 Gleaner Pivot | Crate slot mutations are new paths not yet in map |

**⊕ Cross-Roadmap Phase mapping:**
- T1.5 → Phase A.1 | T1.6 → Phase A.2
- T2.1 → Phase B.6 | T2.2 → Phase B.7 | T2.3 → Phase E.3
- T2.4 → Phase C.6 | T2.5 → Phase E.5 | T2.6 → Phase E.6

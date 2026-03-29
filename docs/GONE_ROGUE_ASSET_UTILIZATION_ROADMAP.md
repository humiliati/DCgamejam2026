# Gone Rogue → Dungeon Gleaner: Asset Utilization Roadmap

**Date**: 2026-03-27 (updated 2026-03-28, stealth promoted for Gleaner pivot)
**Project**: Dungeon Gleaner — DC Jam 2026
**Source**: EyesOnly `public/js/` — Gone Rogue engine modules

---

## Overview

Dungeon Gleaner was bootstrapped from EyesOnly's Gone Rogue codebase. This document maps every Gone Rogue JS module to one of four statuses:

| Status | Meaning |
|--------|---------|
| ✅ **PORTED** | Already running in Dungeon Gleaner. May be renamed. |
| 🔄 **PORT NOW** | High-value, low-friction extraction. Do this pass. |
| 🛠️ **PORT LATER** | Valuable but needs significant adaptation. Post-jam. |
| ❌ **OUT OF SCOPE** | Gone Rogue-specific. No DG equivalent needed. |

---

## ✅ PORTED — Already In Engine

These modules were extracted, renamed, and are live in `engine/`.

| EyesOnly Module | DG Module | Notes |
|----------------|-----------|-------|
| `seeded-rng.js` | `engine/rng.js` | Identical IIFE. `SeededRNG` global. Used across GridGen, Salvage, LootTables. |
| `synergy-engine.js` | `engine/synergy-engine.js` | Tag synergy logic intact. DG uses `synergyTags[]` on items and cards. |
| `card-system.js` | `engine/card-system.js` | Stripped of quality-tier/affix system. DG uses flat card stats from `data/cards.json`. |
| `enemy-ai-system.js` | `engine/enemy-ai.js` | Awareness states, patrol routes, sight range. Biome names updated. ENEMY_TYPES → `data/enemies.json` migration pending. |
| `audio-system.js` | `engine/audio-system.js` | Identical. Web Audio API wrapper, no Gone Rogue dependencies. |
| `splash-screen.js` | `engine/splash-screen.js` | Adapted for LG webOS 22 canvas rendering. |
| `status-effects.js` | (embedded in `combat-engine.js`) | Burn DOT logic extracted inline. Full port not needed at jam scope. |

---

## ✅ PORT NOW — All Complete (audited 2026-03-28)

All PORT NOW extractions are live in `engine/`. Total estimated ~12.5h — completed.

| EyesOnly Module | DG Module | Lines | Status |
|----------------|-----------|-------|--------|
| `world-items.js` | `engine/world-items.js` | 139 | ✅ Simplified to single `_groundItems[]`. `spawnAt()`, `pickupAt()`, `getAt()`, `getAllForRendering()`. |
| `loot-table-manager.js` | `engine/loot-tables.js` | 260 | ✅ Full replacement. Sync XHR load, `rollBreakableLoot()`, `rollEnemyLoot()`, `getBiomeProps()`, `rollGold/Battery/Food()`. |
| `breakable-spawner.js` + `breakable-system.js` | `engine/breakable-spawner.js` | 232 | ✅ Merged both files. Self-contained `_breakables[]`, loot spill via `WorldItems.spawnAt()`, explosive chain reactions. |
| `pickup-system.js` | `engine/game.js` (`_applyPickup`) | ~50 | ✅ Walk-over detection in `_onMoveFinish()`. Gold/battery/food dispatch with Toast + audio feedback. |
| `food-database.js` | `data/items.json` | — | ✅ Data-only. ITM-001→006 mapped in `_applyPickup()` HOT table. |
| `health-system.js` HOT | `engine/player.js` | ~20 | ✅ `applyHOT(amount, ticks)` + `tickHOT()`. Called each step from `_onMoveFinish()`. |

---

## 🛠️ PORT LATER — Status Update (audited 2026-03-28)

Several items previously marked PORT LATER were found to be already complete.

---

### ✅ `overhead-animator.js` — DONE (simplified)

Jam-scope overhead awareness indicators are **baked into `engine/raycaster.js`**:
- `_AWARENESS_GLYPHS` map: 💤 Unaware, ❓ Suspicious, ❗ Alerted, ⚔️ Engaged
- World-space rendering above enemy sprites with distance scaling + fog
- Bobbing animation (2.5 Hz, 3px amplitude)
- EnemySprites `overlayText` / `particleEmoji` also rendered (status effects)

Full OverheadAnimator (currency pickup anims, PancakeStack) remains post-jam.

---

### ✅ `shop-system.js` + `vendor-system.js` — DONE

`engine/shop.js` (406 lines) is a complete faction card shop:
- `open(factionId, floor)` / `buy(slot)` / `sell(cardId)` / `sellPart(itemId)`
- Weighted rarity inventory generation from CardSystem pools
- Rep-tier pricing discounts (0.70x–1.0x)
- Faction rep progression via Salvage.recordSale()
- MenuFaces shop context wired in `engine/menu-faces.js`

---

### ✅ `loot-spill-system.js` — DONE (merged)

Already merged into `engine/breakable-spawner.js` as `_spillDrops()`:
- Adjacent empty tile detection via `_adjacentEmpties()`
- Walk-over drops via `WorldItems.spawnAt()`
- Salvage parts via `Salvage.addLoosePartToFloor()`
- Floor item cap enforcement

---

### 🔄 `stealth-system.js` → `engine/stealth.js` — PROMOTED (Gleaner Pivot)

**What it does**: Detection modifier stack (shadow -30%, grass -20%, smoke -40%, darkness up to -50%). Player stealth bonus calculation from tile types, lighting, equipment, and passive items.

**Why promoted**: The Gleaner pivot makes stealth central to gameplay. Heroes patrol dungeons with 60° sight cones. The player must hide, dodge, and avoid detection while cleaning/restocking. Stealth *is* the core tension loop — without it, Heroes are just timers.

**Extraction scope (jam-feasible)**:

| Component | Source | Target | Effort |
|-----------|--------|--------|--------|
| Detection modifier stack | `stealth-system.js` | `engine/stealth.js` | 2h |
| Awareness config (thresholds, states) | `awareness-config.js` | `engine/awareness-config.js` | 1h |
| Sight cone math (60° FOV, Bresenham LOS) | `enemy-ai-system.js` lines 214–266 | Already in `engine/enemy-ai.js` | ✅ Ported |
| Minimap sight cone rendering | New | `engine/minimap.js` render pass | 2h |
| Tile-based stealth bonuses | `stealth-system.js` tile checks | `engine/stealth.js` simplified | 1h |

**Jam-scope simplification**: Skip TILES.SHADOW and LightingSystem deps. Instead use a lightweight approach:
- **Darkness tiles** (`TILES.EMPTY` in unlit dungeon corridors) give flat -30% detection
- **Crate cover** (adjacent to BREAKABLE/restockable) gives -20% detection ("hiding behind your work")
- **Smoke** deferred — Foundry biome smoke tiles remain post-jam
- **Equipment bonus**: Gleaner's Apron (passive) gives -10% detection while in "restock mode"

**Detection state machine** (already ported in `enemy-ai.js`):
```
UNAWARE (0-30) → SUSPICIOUS (31-70) → ALERTED (71-100) → ENGAGED (100+)
Decay: 5 points/sec when player leaves sight cone
```

**Minimap integration**: Render Hero sight cones as semi-transparent wedges on the minimap canvas. Color follows awareness state (green → yellow → red → magenta). This gives the player a tactical overhead view for planning movement.

---

### 🔄 `awareness-config.js` → `engine/awareness-config.js` — NEW EXTRACTION

**What it does**: Single source of truth for awareness thresholds (UNAWARE 0–30, SUSPICIOUS 31–70, ALERTED 71–100, ENGAGED 100+), color codes per state, and state resolver function.

**Why needed**: `enemy-ai.js` already has awareness states but the thresholds are hardcoded. Extracting this as a shared config lets minimap, HUD, and stealth system all reference canonical values.

**Extraction**: ~80 lines. Pure config + resolver, zero deps. Estimated 30min.

---

### `pet-follower.js` → `engine/companion.js`

**What it does**: Companion entity that follows the player, has its own HP, and can interact with items.

**Why post-jam**: No companion in DG jam scope. Interesting long-term mechanic for a "Gleaner's familiar" archetype.

---

### `puzzle-state.js` + `tutorial-floor-gen.js` → future

**What they do**: Hand-crafted floor templates and puzzle state tracking. EyesOnly uses these for Commandos-style stealth puzzle floors.

**Why post-jam**: DG floors are fully procedural (GridGen). Handcrafted puzzle floors would be a mode or biome-specific variant. Long-horizon feature.

---

## ❌ OUT OF SCOPE — Gone Rogue Specific

These modules solve problems unique to EyesOnly's ARG/tactical systems. No DG equivalent.

| Module | Reason |
|--------|--------|
| `agent-api-system.js` | EyesOnly ARG agent integration. |
| `str-combat-engine.js` | Street Chronicles turn-based combat. DG has its own card combat. |
| `constellation-*.js` (10 files) | Constellation meta-progression. Not in DG. |
| `booking.js`, `partners.js` | Real-world event booking. |
| `smart-watch-widget.js` | WebSocket peripheral integration. |
| `awol-difficulty.js` | AWOL-mode difficulty scaling. |
| `satellite-scrubber.js` | ARG narrative system. |
| `ropeManager.js` | Physics-based rope for climbing. No climbing in DG. |
| `key-loot-gen.js` | Gone Rogue tiered key system. DG uses simple faction_key items. |
| `account-inventory.js` | Persistent cross-session Cloudflare KV inventory. DG is local. |
| `save-load.js` | EyesOnly's server-backed save system. DG uses `localStorage` or ephemeral. |
| `auth-gate.js`, `user-account.js` | Authentication systems. Single-player jam game. |
| `card-disposal-system.js` | EyesOnly burn pile economy. DG salvage replaces this. |
| `boss-encounters.js` | Full boss scenario scripting. DG bosses are standard enemies with high HP. |
| `active-item-system.js` | D2-style active item slots. DG uses equipment + card slots. |
| `passive-items-system.js` | Passive charm system. Post-jam consideration. |

---

## Extraction Status (updated 2026-03-28)

```
Pass 1 — ✅ COMPLETE (all jam-scope extractions done):
  1. ✅ pickup-system.js → Game._onMoveFinish() integration
  2. ✅ world-items.js → engine/world-items.js (139 lines)
  3. ✅ loot-table-manager.js → engine/loot-tables.js (260 lines)
  4. ✅ breakable-spawner.js → engine/breakable-spawner.js (232 lines)
  5. ✅ health-system.js HOT → engine/player.js

Pass 2 — ✅ COMPLETE (found already ported during audit):
  6. ✅ shop-system.js → engine/shop.js (406 lines) + menu-faces.js shop context
  7. ✅ loot-spill-system.js → merged into breakable-spawner.js _spillDrops()
  8. ✅ overhead-animator.js → simplified into raycaster.js _AWARENESS_GLYPHS

Pass 3 — 🔄 IN PROGRESS (Gleaner Pivot — stealth is now jam-scope):
  9. 🔄 stealth-system.js → engine/stealth.js (simplified: skip SHADOW/SMOKE tiles, use darkness + crate cover)
  10. 🔄 awareness-config.js → engine/awareness-config.js (thresholds, colors, state resolver)
  11. 🔄 minimap sight cones → engine/minimap.js (render Hero FOV wedges)

Pass 4 (future — post-jam):
  12. 🛠️ pet-follower.js → engine/companion.js (no companion in jam scope)
```

---

## Data File Status

| File | Status |
|------|--------|
| `data/items.json` | ✅ Complete — ITM-000 through ITM-107 |
| `data/enemies.json` | ✅ Complete — ENM-001 through ENM-091 |
| `data/loot-tables.json` | ✅ Complete — all profiles, biome props, breakable tables |
| `data/cards.json` | ✅ Complete — 63 cards migrated to suit system (♠24/♦16/♣17/♥6) |
| `data/strings/en.js` | ✅ Updated with harvest, faction strings |

---

*Adapted from EyesOnly `ITEM-PIPELINE-ROADMAP.md`, `LOOT_TABLE_SYSTEM.md`, `ENEMY_AI.md`, `OVERHEAD-ANIMATION-UNIFIED-ROADMAP.md`*

---

## § Cross-References

> Master index: **[CROSS_ROADMAP.md](CROSS_ROADMAP.md)** — dependency-ordered execution for playable prototype

| This Section | Links To | Relationship |
|--------------|----------|-------------|
| ✅ PORTED enemy-ai-system.js | → DOC-2 §14 Hero Path, DOC-4 §18.3 Sight Cones | Sight cone math + awareness states already in engine |
| ✅ PORTED synergy-engine.js | → DOC-4 §10 RPS Suits | getAdvantage() drives suit combat |
| ✅ PORT NOW breakable-spawner.js | → DOC-2 §13 Gleaner Pivot, DOC-4 §17.2 Restocking | Crate system extends breakable-spawner |
| ✅ PORT NOW shop-system.js | → DOC-4 §19.2 Rep Economy | Shop.js has faction rep pricing |
| 🔄 Pass 3.9 stealth-system.js | → DOC-2 §14, §16 Phase 5 | Enables Hero detection + player stealth bonuses |
| 🔄 Pass 3.10 awareness-config.js | → DOC-4 §18.3 Stealth & Sight Cones | Shared thresholds for minimap + HUD + enemy AI |
| 🔄 Pass 3.11 minimap cones | → DOC-5 AUDIT §1.3 (minimap 76→320px) | ✅ Already implemented in engine/minimap.js |
| ❌ OUT OF SCOPE str-combat-engine.js | → DOC-1 GAP §Combat System | DG card combat fully replaces Gone Rogue STR timer |
| Data: cards.json | → DOC-4 §10 Suit Distribution | 63 cards mapped to ♠24/♦16/♣17/♥6 |
| Data: enemies.json | → DOC-4 §12 Enemy Populations | Suit assignments per biome |

**⊕ Cross-Roadmap Phase mapping:**
- Pass 3.9 (stealth) → **Phase A.3**
- Pass 3.10 (awareness) → **Phase A.4**
- Pass 3.11 (minimap cones) → **Phase A.5 ✅ DONE**

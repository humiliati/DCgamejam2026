# Post-Jam Item Roadmap

**Created**: 2026-04-04
**Context**: DC Jam 2026 deadline April 5. Items below are designed but deferred because they depend on systems not yet built, or are upgrades that don't need to exist for the jam build to feel complete.

---

## 1. Deferred Buff Items (designed in SHOP_REFRESH_ECONOMY §7, not in items.json)

These 5 items were part of the original 18-item buff tier but require mechanics that don't exist in the jam build.

| Item | Price | Effect | Why Deferred | Blocker |
|------|-------|--------|--------------|---------|
| **Industrial Solvent** | 22g | `clean_radius: +1` (AoE scrub) | Needs area-of-effect clean system. Current clean is single-tile. | Clean AoE system |
| **Cobweb Sensor** | 11g | `cobweb_highlight: true` (minimap glow) | Needs minimap overlay for interactable highlighting. | Minimap system |
| **Torch Tongs** | 18g | `torch_extinguish_no_water: true` | Currently all torch extinguish routes use water/hose. New input path needed. | Torch interaction refactor |
| **Quick Dodge** | 16g | `evasion: +0.10` (flat dodge) | Combat system needs dodge resolution. Current combat is card-based, no evasion roll. | Combat dodge mechanic |
| **Readiness Sense** | 20g | `readiness_per_tile: true` | Each tile shows readiness contribution in a HUD overlay. Heavy UI work. | Per-tile readiness UI |

**Suggested implementation order**: Cobweb Sensor (cheapest, minimap is useful for many things) → Industrial Solvent (clean QoL) → Quick Dodge (combat depth) → Torch Tongs (niche) → Readiness Sense (perfectionist endgame).

When built, these slot into ITM-049 through ITM-053 in items.json (equipment range has room through ITM-059).

---

## 2. Gone Rogue Items — Earmarked for Adaptation

These Gone Rogue items were reviewed during the buff tier design and flagged as interesting but not jam-scope. Each needs either a new system or enough combat depth to justify.

### 2.1 Combat Passives (need deeper card combat)

| GR Item | GR ID | Proposed Gleaner Version | Notes |
|---------|-------|--------------------------|-------|
| **Surge Protector** | ITM-080 | _Already adapted as Rat Guard (ITM-046)_ | Done — tag-based defense reduction |
| **Recoil Dampener** | ITM-082 | _Already adapted as Steady Hand (ITM-045)_ | Done — trap rearm speed |
| **Bump Stock** | ITM-083 | Burst Broom (multi-hit clean/attack) | Needs multi-strike mechanic. "Three quick scrubs" = three quick strikes |
| **Auto Sears** | ITM-081 | Full Auto Mop (continuous clean on hold) | Needs hold-to-clean input mode |

### 2.2 Utility / Exploration (need map systems)

| GR Item | GR ID | Proposed Gleaner Version | Notes |
|---------|-------|--------------------------|-------|
| **Pattern Lens** | ITM-087 | _Partially adapted as Cobweb Sensor (deferred §1)_ and _Keen Eye (ITM-043)_ | Two items from one source |
| **Proximity Sensor** | ITM-094 | _Already adapted as Watchman's Lamp (ITM-042)_ | Done — light radius |
| **Patience Module** | ITM-095 | _Already adapted as Keen Eye (ITM-043)_ | Done — interact range |
| **Wire Tap** | ITM-089 | Eavesdrop Charm (hear NPC schedules through walls) | Needs NPC schedule system. Wax-on: listening for dripping pipes = hearing enemy movement |
| **Thermal Goggles** | ITM-091 | Heat Sense Visor (see heat signatures / recent activity) | Needs heat-trail rendering. Wax-on: finding which torches burned recently = tracking enemies |

### 2.3 Economy / Collection (need faction trading depth)

| GR Item | GR ID | Proposed Gleaner Version | Notes |
|---------|-------|--------------------------|-------|
| **Recycler** | ITM-086 | _Already adapted as Salvage Gloves (ITM-048)_ | Done — salvage bonus |
| **Archive Indexer** | ITM-092 | Catalog Charm (auto-sort crate fills by tag) | Needs crate-fill sorting UI. Would pair well with quick-fill |
| **Lucky Penny** | ITM-096 | Janitor's Coin (gold find +10%) | Simple to implement but gold economy needs tuning first. Post-jam balancing |
| **Amazon Box** | ITM-998 | _Already adapted as Quick Dodge (deferred §1)_ | Evasion mechanic |

### 2.4 Not Adaptable (mechanic doesn't translate)

| GR Item | Why | Gleaner Equivalent |
|---------|-----|--------------------|
| **Cargo Webbing** (ITM-060) | Inventory layout system, Gleaner uses flat bag | _Adapted concept as Cargo Sling (ITM-037)_ — flat bag_slots instead |
| **Tactical Harness** (ITM-061) | Same — grid inventory | _Adapted as Foreman's Harness (ITM-039)_ |
| **Demolition Vest** (ITM-085) | AoE explosion mechanic, no equivalent in maintenance loop | Potentially: Industrial Solvent (deferred §1) captures the AoE spirit |
| **Stealth Box** (various) | Stealth/espionage mechanics don't exist in Gleaner | No equivalent planned. Heroes don't sneak, janitors don't hide |

---

## 3. Supply Consumables — Jam-Complete

All 13 supply items from SHOP_REFRESH_ECONOMY §6.5 are now in items.json (ITM-080–092). No deferred supply items.

## 4. Detritus Drops — Jam-Complete

All 5 detritus breakable drop items from DEPTH3_CLEANING_LOOP_BALANCE §2.2 are now in items.json (ITM-110–114). No deferred detritus items.

---

## 5. Item Count Summary

| Category | Jam-Scope (in items.json) | Deferred | Total Designed |
|----------|---------------------------|----------|----------------|
| Food (walk-over) | 6 (ITM-001–006) | — | 6 |
| Batteries | 2 (ITM-020–021) | — | 2 |
| Equipment (loot) | 6 (ITM-030–035) | — | 6 |
| Buff items (passive) | 13 (ITM-036–048) | 5 (§1) | 18 |
| Keys & passes | 4 (ITM-060–063) | — | 4 |
| Supply consumables | 13 (ITM-080–092) | — | 13 |
| Salvage parts | 8 (ITM-100–107) | — | 8 |
| Detritus drops | 5 (ITM-110–114) | — | 5 |
| **Total** | **57** | **5 + GR backlog** | **62+** |

---

## 6. Wax-On-Wax-Off Tracker

Every jam-scope buff item (ITM-036–048) has a `_waxOnWaxOff` field documenting its dual nature. The deferred items should follow the same pattern when implemented:

| Deferred Item | Maintenance Face | Combat Face |
|---------------|-----------------|-------------|
| Industrial Solvent | AoE scrub (clean adjacent tiles) | AoE attack splash |
| Cobweb Sensor | Find cobwebs for extra credit | Detect enemy traps/ambushes |
| Torch Tongs | Bare-hand torch management | Disarm fire-based enemies |
| Quick Dodge | Dodge falling debris while cleaning | Dodge enemy attacks |
| Readiness Sense | See per-tile readiness scores | See enemy health/weakness |

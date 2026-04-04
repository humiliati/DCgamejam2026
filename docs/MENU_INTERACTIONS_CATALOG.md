# Menu & System Settings — Interactions Catalog

> Complete catalog of all interactive elements across the 4-face rotating box menu,
> HUD footer bar (StatusBar), and system settings. Status: stub/wired/complete.
>
> Generated 2026-04-01 during Sprint 0 visual overhaul.
> Updated 2026-04-03: Click-Everything Phase 1 audit — Face 3 interactions, dialog buttons.
> Updated 2026-04-03: Keyboard/Hover/Tooltip pass — dialog keyboard nav, slider hover, HUD button hover, crate-ui hover, door-peek action button.

---

## Face 0 — Minimap / Context

### Pause Context (`_renderMinimap`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Floor label + depth | Display | **Complete** | `FloorManager.getFloorLabel()` |
| Minimap canvas | Display | **Complete** | Scaled from `Minimap.getCanvas()` |
| Compass pips (N/S/E/W) | Display | **Complete** | Decorative |
| Floor stack breadcrumb | Display | **Complete** | `Minimap.getFloorStack()` |
| Progress stats row | Display | **Complete** | `SessionStats.get()` + tile count |
| Quest objective | Display | **Complete** | `_getQuestObjective()` |
| Time display | Display | **Complete** | `DayCycle.getTimeString()` |
| Fast-travel markers | Clickable | **Stub needed** | Post-jam: click map tile → warp. Needs: tile hit zones on minimap canvas, `FloorManager.warpTo()` |
| Hint bar | Display | **Complete** | `[Q/E] Browse  [ESC] Resume` |

### Bonfire Context (`_renderBonfireRest`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| HP / Energy bars | Display | **Complete** | Player state |
| "Restored" text | Display | **Complete** | i18n |
| Floor info | Display | **Complete** | |
| Warp button | Clickable | **Complete** | Hit zone 900, hover state, routes to `FloorTransition` |
| Hint bar | Display | **Complete** | |

### Shop Context (`_renderShopInfo`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Faction identity header | Display | **Complete** | `Shop.getCurrentFaction()` |
| Rep tier rows (3 factions) | Display | **Complete** | Color-coded, active highlight |
| Currency display | Display | **Complete** | `Player.state().currency` |
| Current rep badge | Display | **Complete** | |
| Faction row hover/click | Clickable | **Stub needed** | Click to view faction lore/rewards |
| Hint bar | Display | **Complete** | |

### Harvest Context (`_renderHarvestLoot`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Loot item tiles (5 max) | Clickable | **Complete** | `Salvage.getStagedLoot()`, hit zones |
| Empty tile placeholders | Display | **Complete** | Dashed border |
| Hint bar | Display | **Complete** | |

---

## Face 1 — Journal / Skills / Context

### Pause Context (`_renderJournal`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Operative dossier header | Display | **Complete** | Callsign, class, emoji |
| Active status effects | Display | **Complete** | `StatusEffect.getActive()` (max 4) |
| Books read grid | Clickable | **Complete** | Thumbnail tiles, hit zone for re-read |
| Book hover tooltip | Display | **Complete** | `_hoverDetail` on hover |
| Day/session stats | Display | **Complete** | `DayCycle` integration |
| **Skill tree** | Section | **Stub needed** | GAME_FLOW_ROADMAP: branching stat upgrades (post-jam). Jam scope: flat stat display (STR, DEX, Stealth) with +/- from level-ups |
| **Quest log** | Section | **Stub needed** | GAME_FLOW_ROADMAP: active objectives, completed quests. Show `_getQuestObjective()` plus quest history |
| **Dialog history** | Section | **Stub needed** | GAME_FLOW_ROADMAP: scrollable past NPC conversations. Data source: `StatusBar._history` (filtered for dialogue) |
| **Lore entries** | Section | **Stub needed** | GAME_FLOW_ROADMAP: collectible lore found via interact. Needs `Player.getLoreEntries()` or flag system |
| **Character stats panel** | Section | **Stub needed** | HP, EN, STR, DEX, defense, speed — full stat breakdown. Currently only in DebriefFeed |
| Hint bar | Display | **Complete** | |

### Bonfire Context (`_renderStash`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Stash description | Display | **Complete** | i18n |
| Stash grid (4×5) | Clickable | **Complete** | Hit zones for unstash |
| Stash capacity counter | Display | **Complete** | |
| Stash slot hover | Hover | **Needs polish** | Has hover state but no tooltip |
| Hint bar | Display | **Complete** | |

### Shop Context (`_renderShopBuy`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Currency display | Display | **Complete** | |
| Buy tiles (5 slots) | Clickable | **Complete** | Affordability dimming, rarity dots |
| Sold overlay | Display | **Complete** | |
| Tile hover glow | Hover | **Complete** | Phosphor glow on hover |
| Buy price tag | Display | **Complete** | Per tile |
| Hint bar | Display | **Complete** | |

### Harvest Context (`_renderHarvestBag`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Bag grid (4 col) | Display | **Complete** | Player bag contents |
| Capacity header | Display | **Complete** | |
| Currency display | Display | **Complete** | |

---

## Face 2 — Inventory / Equipment

### Pause + Harvest Context (`_renderInventory`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Equipped slots (3) | Drag+Drop | **Complete** | DragDrop zones `inv-eq-0..2` |
| Bag wheel (adaptive) | Drag+Drop | **Complete** | Scroll chevrons, expander |
| Bag expander (+N) | Clickable + Drop target | **Complete** | `toggleBagExpand()` |
| Hand slots (5) | Drag+Drop | **Complete** | Combat cards |
| Deck wheel (adaptive) | Drag+Drop | **Complete** | Backup cards |
| Incinerator | Drop target | **Complete** | Two-phase: tease → burn |
| Scroll chevrons (bag) | Clickable | **Complete** | Left/right navigation |
| Scroll chevrons (deck) | Clickable | **Complete** | |
| Focus indicator (bag/deck) | Display | **Complete** | `_invFocus` toggle |
| Section titles | Display | **Complete** | Scale-aware fonts |
| Currency footer | Display | **Complete** | |
| Incinerator confirmation | Interaction | **Stub needed** | FACE2_POLISH: one tap/drop = gone, no confirm dialog |
| Hover tooltips per slot | Hover | **Needs polish** | FACE2_POLISH: no tooltip on hover — item details only via name truncation |
| Scroll wheel support | Interaction | **Stub needed** | FACE2_POLISH: only chevron clicks and Q/E currently |
| Combat lock overlay | CSS animation | **Complete** | `InventoryOverlay.updateCombatLock()` |
| Context classes (buy/sell/dispose) | CSS animation | **Complete** | `inventory-drag.css` |

### Shop Context (`_renderShopSell`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Sell tiles (hand cards) | Clickable | **Complete** | Rarity-based sell values |
| Sell price display | Display | **Complete** | |
| Sell pre-confirmation | Interaction | **Stub needed** | No visual of sell price before commit |

### Bonfire Context (`_renderBag`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Bag view for stash transfer | Display | **Complete** | Simplified bag grid |

---

## Face 3 — System Settings

### All Contexts (`renderFace3`)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| Master volume slider | Slider (W/S select, ←/→ adjust) | **Complete** | `AudioSystem.setMasterVolume()` |
| SFX volume slider | Slider | **Complete** | `AudioSystem.setSFXVolume()` |
| BGM volume slider | Slider | **Complete** | `AudioSystem.setMusicVolume()` |
| Slider click-to-set | Clickable | **Complete** | Click on track → jump to position. `handleSettingsSetValue()` calculates pct from pointer x vs track bounds |
| Language selector | Display | **Stub** | Shows "English" only. Needs: locale picker, string pack loading |
| Screen Shake toggle | Toggle | **Complete** | Hit zone 810+, click dispatches `handleSettingsToggle(key)` via game.js |
| Show FPS toggle | Toggle | **Complete** | Hit zone 811, same dispatch path |
| Minimap Visible toggle | Toggle | **Complete** | Hit zone 812, same dispatch path |
| Toggle click handler | Clickable | **Complete** | All toggles have hit zones (810+ti), hover states, and game.js dispatch to `handleSettingsToggle()` |
| Controls reference | Display | **Complete** | Static key mapping |
| **Controls rebinding** | Interaction | **Stub needed** | Post-jam: `InputManager.rebind()` |
| **Display settings** | Section | **Stub needed** | GAME_FLOW_ROADMAP: render resolution, pixelation toggle |
| "Return to Game" | Clickable | **Complete** | Hit zone 820, action `resume` → `MenuBox.close()` via game.js dispatch |
| "Quit to Title" | Clickable | **Complete** | Hit zone 821, action `quit_title` → `ScreenManager.toTitle()` via game.js dispatch |
| Hint bar | Display | **Complete** | |

---

## HUD Footer Bar (StatusBar)

| Element | Type | Status | Notes |
|---------|------|--------|-------|
| DEBRIEF button | Clickable | **Complete** | `DebriefFeed.cycleMode()` |
| MAP button | Clickable | **Complete** | `Minimap.toggle()` / FLEE in combat |
| **BAG button** | Clickable | **Needs fix** | Opens Face 2 but doesn't set `_invFocus='bag'`. Should toggle-close if already paused on Face 2 with bag focus |
| **DECK button** | Clickable | **Needs fix** | Same issue — opens Face 2 but doesn't set `_invFocus='deck'`. Should toggle-close if already paused on Face 2 with deck focus |
| **Gold/Currency button** | Clickable | **Needs fix** | Has coin-wheel animation + hover pulse but click does nothing. Should route to menu face showing currency (Face 2 inventory footer or Face 1 character stats) |
| Floor label | Display | **Complete** | `FloorManager` |
| Biome label | Display | **Complete** | |
| Heading indicator | Display | **Complete** | Compass direction |
| Tooltip area (rolodex) | Clickable | **Complete** | Click to expand/collapse history |
| Tooltip history entries | Display | **Complete** | Scrollable past entries |
| Dialogue inline | Clickable | **Complete** | Choice buttons within tooltip |
| Bag count badge | Display | **Complete** | `X/12` with urgency colors |
| Deck count badge | Display | **Complete** | Card count |
| Combat mode swap | Display | **Complete** | FLEE button replaces MAP |

---

## Cross-Cutting Interactions Needed

### Hover System

| Area | Status | Notes |
|------|--------|-------|
| Face 0 warp button | **Complete** | hover slot 900 |
| Face 1 book tiles | **Complete** | hover + tooltip |
| Face 2 all slots | **Complete** | Via DragDrop |
| Face 3 slider rows | **Complete** | Pointer hover + click-to-set value |
| Face 3 toggle rows | **Complete** | Pointer hover + click dispatches toggle |
| Face 3 exit buttons | **Complete** | Pointer hover + click dispatches resume/quit |
| HUD buttons | **Complete** | CSS hover states |

### Keyboard Navigation

| Area | Status | Notes |
|------|--------|-------|
| Face 0 | N/A | Read-only display |
| Face 1 book tiles | **Stub needed** | No keyboard selection of individual books |
| Face 2 slot selection | **Complete** | Tab-based via `_invFocus` |
| Face 3 W/S row nav | **Complete** | |
| Face 3 ←/→ adjust | **Complete** | |
| Face 3 Enter to toggle | **Complete** | Enter/Space fires toggle or language cycle via game.js settings interact handler |

### Scale-Aware Sizing (S-factor)

| Face | Status | Notes |
|------|--------|-------|
| Face 0 | **Needs upgrade** | Hardcoded 11-14px fonts, fixed mapSize formula |
| Face 1 | **Needs upgrade** | Hardcoded 11-13px fonts, fixed 36px book tiles |
| Face 2 | **Complete** | S = min(w,h)/400, all dims derived |
| Face 3 | **Needs upgrade** | Hardcoded 10-13px fonts, 38px rows, 7px tracks |

---

## Priority Order (Sprint 0 Remaining)

1. **S-factor scaling** — Face 0, 1, 3 (visual consistency with Face 2)
2. **HUD button routing** — BAG → Face 2 + bag focus, DECK → Face 2 + deck focus, Gold → Face 1 or Face 2
3. **Stub sections** — Face 1 skill tree, quest log, lore, dialog history
4. ~~**Face 3 clickable interactions**~~ — ✅ DONE (Apr 3): Toggle click, slider click-to-set, exit buttons all wired with hit zones and game.js dispatch
5. ~~**Hover interactions (Face 3)**~~ — ✅ DONE: All Face 3 rows have pointer hover states. Face 1 section hover still pending.
6. **Incinerator confirmation** — FACE2_POLISH backlog item
7. **Scroll wheel on Face 2** — Additional input method

### Deferred (Post-Sprint 0)

- Fast-travel on minimap (Face 0)
- Faction lore click (Face 0 shop)
- Controls rebinding (Face 3)
- Display settings section (Face 3)
- Language selector functional (Face 3)
- Keyboard nav for Face 1 books
- Full tooltip system for all slots

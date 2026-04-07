# Unified Restock Surface Roadmap

**Created**: 2026-04-06 | **Status**: Design doc for evaluation
**Trigger**: DC Jam 2026 playtest feedback — players couldn't discover restock mechanics
**Depends on**: PeekSlots, CrateUI, CrateSystem, TorchState, CardAuthority, DragDrop, HoseState

---

## 0. Jam Feedback Summary

> "Amazing how much you got done in the timespan of the jam. The game looks and sounds very good. And it seems to be really big and deep. And I really like the premise of 'somebody's gotta set up the dungeon for the next wannabe hero'. And I guess that's my biggest issue. Other than talking to people and the combat, I was not really able to do any of the interactions like refilling stuff. And I was really looking forward to that, a reversal like that. It's like I don't understand the UI or maybe it just didn't work correct on my machine?"

**Root cause**: The player *wanted* to restock but couldn't figure out *how*. The restocking mechanics are spread across multiple peek overlays (CratePeek, TorchPeek, CorpsePeek) each with its own bespoke UI, and the inventory items needed to fill them live on separate menu faces or are accessible only through non-obvious key combos (1-5 number keys, S to seal). There is no single visible surface that says "here is the thing to fill, and here are the things you can fill it with — drag one to the other."

---

## 1. Current State — Restock Audit Matrix

### Interactions that require filling a container with player inventory

| Interaction | Tile | Peek Module | Container UI | Bag Source | Drag Support | Discovery Problem |
|-------------|------|-------------|-------------|------------|-------------|-------------------|
| **Crate fill** | BREAKABLE | CratePeek → PeekSlots | CrateUI canvas (slot row top, bag strip bottom) | CardAuthority.getBag() | YES (CrateUI bag strip → slot) | Bag strip below viewport fold. Number keys (1-5) undiscoverable. |
| **Torch refuel** | TORCH_LIT/UNLIT | TorchPeek | 3 emoji indicators in label layer | CardAuthority selected card only | NO (click slot directly) | Player must pre-select item. No visible inventory. No hint of what goes where. |
| **Corpse restock** | CORPSE | CorpsePeek → PeekSlots | CrateUI canvas (same as crate) | CardAuthority.getBag() + hand cards | YES (same as crate) | Mode confusion: same coffin peek for harvest vs restock. Bag strip same problem. |
| **Hose spray** | Any grimed | SpraySystem | No container — continuous effect | HoseState (hose equipped) | NO (hold interact) | Hose pickup is on a truck the player hasn't been taught to find. |

### Interactions that do NOT involve inventory restocking (excluded from unification)

| Interaction | Tile | Reason Excluded |
|-------------|------|----------------|
| Chest withdraw | CHEST | One-way OUT (loot → player). No deposit. |
| Puzzle reset | PUZZLE | Pure puzzle minigame — no items involved. |
| Bookshelf read | BOOKSHELF | Text content — no items involved. |
| Bar counter drink | BAR_COUNTER | Environmental — no items involved. |
| Bed sleep | BED | Binary action — no items involved. |

### How bags are currently distributed across menu faces

| Face | Pause Context | Bonfire Context | Shop Context |
|------|--------------|-----------------|--------------|
| **Face 0** | Minimap | Rest status | Vendor info |
| **Face 1** | Journal / Skills | Stash grid (8-col) | Buy pane (vendor inv) |
| **Face 2** | Equip + Bag grid | Hand/Bag management | Sell pane |
| **Face 3** | System settings | System settings | System settings |

**Problem**: Bag items live on Face 2 (Gear). Container slots live in CrateUI (canvas overlay, NOT a menu face). The player is never on both surfaces simultaneously. They either see their items OR see the container — never side-by-side.

---

## 2. Design Vision — The Restock Wheel

Replace the scattered peek-specific UIs with a **single unified restock surface** that opens whenever the player interacts with a fillable container. The surface has two halves:

```
┌──────────────────────────────────────────────────┐
│                RESTOCK SURFACE                    │
│                                                   │
│   ┌─────────────────┐  ┌──────────────────────┐  │
│   │  CONTAINER WHEEL │  │   SUPPLY ROWS        │  │
│   │                  │  │                       │  │
│   │   ╭──╮ ╭──╮     │  │  🎒 Bag:              │  │
│   │   │🪵│ │💧│     │  │  [item] [item] [item] │  │
│   │   ╰──╯ ╰──╯     │  │  [item] [item] [item] │  │
│   │   ╭──╮           │  │                       │  │
│   │   │◯ │ ← empty   │  │  🃏 Hand:             │  │
│   │   ╰──╯           │  │  [card] [card] [card] │  │
│   │                  │  │                       │  │
│   │  [ 🔥 torch ]    │  │  🔧 Tools:            │  │
│   │  readiness: 67%  │  │  [nozzle] [mop] [rag] │  │
│   │                  │  │                       │  │
│   └─────────────────┘  └──────────────────────┘  │
│                                                   │
│  [SEAL / CLOSE]              context hint line    │
└──────────────────────────────────────────────────┘
```

### 2.1 Container Wheel (Left Half)

A persistent panel showing the current container's slots. The "wheel" rotates contextually — facing a crate shows crate slots, facing a torch shows torch fuel slots, facing a corpse shows corpse slots. The layout adapts but the interaction model is always the same: **each slot is a drop target**.

**Slot states** (visual, universal across container types):
- **Empty** (`◯`): accepts drag-drop from any supply row. Highlighted border pulses.
- **Filled** (`✅`): grayed out, item emoji visible. No further interaction.
- **Burning** (`🔥`, torch flame slot): does NOT accept drag-drop. Instead, shows a small "spray to extinguish" icon if hose is active, or "drop water" if water bottle is selected. Click applies the contextual action.
- **Dry** (`🪵`, torch fuel_dry): accepts water bottle drag to hydrate. Also accepts hose spray (but destructive — spec §7).
- **Hydrated** (`💧`, torch fuel_hydrated): fully ready. No interaction.
- **Locked** (`🔒`): slot exists but requires a prerequisite (e.g., corpse restock locked until specific item type available). Tooltip explains.

**Slot interactivity tiers** (from the user's "different levels of interactivity" request):
1. **Drop target** — default. Any valid item from supply rows fills it.
2. **Tool target** — requires a specific tool action (hose spray, water bottle pour).
3. **Auto-fill** — fills automatically when the player walks over (floor grime with hose).
4. **Read-only** — already filled, shows contents. No interaction.

### 2.2 Supply Rows (Right Half)

A vertical stack of labeled rows, each showing items from a different source. All items are **drag sources**. The rows are always visible — no face-switching needed.

| Row | Source | Contents | When Visible |
|-----|--------|----------|-------------|
| **🎒 Bag** | CardAuthority.getBag() | All bag items, scrollable | Always during restock |
| **🃏 Hand** | CardAuthority.getHand() | Combat cards (for corpse suit-matching) | Corpse restock only |
| **🔧 Tools** | CardAuthority.getEquipped() | Equipped cleaning tools, nozzles | Always (shows what you're working with) |
| **🏪 Quick-Buy** | Nearest vendor catalog | Shop items purchasable on the spot | Only if vendor is within N tiles (stretch) |

Each item in a supply row shows: emoji, name (truncated), and a **compatibility glow** — green border if the item matches a demand frame in the container wheel, amber if it's a generic fill, no glow if incompatible.

### 2.3 Drag-Drop Interaction

The core interaction is always:
1. **Pick up** an item from a supply row (click/tap, or Magic Remote point + OK)
2. **Drop** it on a container wheel slot (drag to slot, or click slot while holding)
3. **Feedback**: slot fills with animation, readiness % updates, optional coin sparkle

Alternative: **Number keys 1-N** still work as quick-fill shortcuts (fills the next empty slot with the best-matching bag item). These are now labeled in the hint line so they're discoverable.

### 2.4 Contextual Awareness

The surface adapts based on what the player is facing:

| Facing | Container Wheel Shows | Supply Rows Show | Special Behavior |
|--------|----------------------|-----------------|-----------------|
| BREAKABLE (crate) | 2-5 crate slots (frame-tagged) | Bag + Tools | [S] Seal button when all filled |
| TORCH_LIT | 3 torch slots (flame + fuel) | Bag (water, fuel items) + Tools | Burning slot = tool-target (hose/water) |
| TORCH_UNLIT | 3 torch slots (no flame) | Bag (fuel items) + Tools | All slots are drop targets |
| CORPSE | 2-3 corpse slots | Bag + Hand (suit cards) | Suit-match bonus visible per slot |
| Grimed wall/floor | Grime % meter (not slots) | Tools only | Spray system HUD (not drag-drop) |

### 2.5 The "Revolving" Aspect

The container wheel isn't literally animated as a carousel (that would be disorienting). The "revolving" means:

- **When the player turns** to face a different interactable while the surface is open, the wheel **transitions** to show the new container's slots with a brief slide animation (old slots slide left, new slide in from right, 200ms).
- **If the player walks** to a new tile while the surface is open, the surface stays open as long as they're still adjacent to a fillable container. Turning to face a wall with grime switches the wheel to the grime meter. Turning to face nothing closes the surface.

This creates the feeling of a **persistent work tool** rather than a menu that must be opened and closed for each container. The player walks along a corridor, and the restock surface smoothly updates as they face each dirty wall, broken crate, dead torch in sequence.

---

## 3. Restock Audit → Unification Mapping

How each current interaction maps into the unified surface:

### 3.1 Crate Fill (CratePeek → PeekSlots → CrateUI)

**Current**: CratePeek BoxAnim opens → click [Smash/Fill] → CrateUI canvas overlay renders slot row at top + bag strip at bottom → number keys or drag to fill → S to seal.

**Unified**: Player faces BREAKABLE → unified surface opens (no BoxAnim gate). Container wheel shows crate slots with frame tags. Supply rows show bag items with compatibility glow. Drag-drop to fill. [S] Seal button appears when all slots are filled.

**Migration**: CrateUI's slot rendering + bag strip rendering are absorbed into the unified surface's two halves. CratePeek's BoxAnim 3D crate animation becomes a **decorative background** behind the container wheel (optional, skippable). PeekSlots state machine (IDLE → FILLING → SEALED) is preserved but the FILLING state now means "unified surface is open" instead of "CrateUI canvas overlay is active."

### 3.2 Torch Refuel (TorchPeek — autonomous)

**Current**: TorchPeek BoxAnim opens → 3 emoji indicators in label layer → click slot or press 1-3 → if holding water/fuel, fill. No visible inventory.

**Unified**: Player faces TORCH → unified surface opens. Container wheel shows 3 torch slots with state-specific visuals (flame=burning, fuel_dry=🪵, fuel_hydrated=💧, empty=◯). Supply rows show bag items filtered to water bottles and fuel items (with compatibility glow). Drag water → flame slot to extinguish (careful method). Drag fuel → empty slot to fill. If hose is active, burning slot shows a "spray" icon — click to pressure-wash extinguish (destructive method, §7 rules apply).

**Migration**: TorchPeek's 3 emoji indicators become container wheel slots. TorchState.getSlots() already provides the data. The autonomous overlay is replaced by the unified surface. TorchPeek's BoxAnim torch-bracket becomes decorative background.

### 3.3 Corpse Restock (CorpsePeek → PeekSlots → CrateUI)

**Current**: CorpsePeek BoxAnim opens → [Restock] or [Harvest] button → CrateUI canvas (same as crate).

**Unified**: Player faces CORPSE → unified surface opens. If container exists and is unsealed, container wheel shows corpse slots. Supply rows show Bag + Hand (hand row visible for suit-card matching). If container is sealed or doesn't exist, surface shows a "Harvest" mode with loot preview (simpler view, no drag-drop).

**Migration**: CorpsePeek's mode detection (restock vs harvest) becomes a container wheel mode. The harvest mode is a simplified read-only view within the same surface (container wheel shows loot items as withdrawable, supply rows hidden).

### 3.4 Hose Spray (SpraySystem — continuous)

**Current**: Hold interact while hose is active and facing grimed tile → SpraySystem cleans continuously. No menu/overlay involved.

**Unified**: Spray stays outside the unified surface — it's a continuous hold-to-clean mechanic, not a container-slot interaction. However, when the hose is active and the player faces a torch, the unified surface's burning slot shows the spray option. This bridges the two systems.

**No migration needed**: SpraySystem is already well-isolated. The only integration point is the torch burning-slot tool target in the unified surface.

---

## 4. Module Plan

### New Modules

| Module | Layer | File | Purpose |
|--------|-------|------|---------|
| RestockSurface | 3 | `engine/restock-surface.js` | Unified DOM/canvas panel — container wheel + supply rows |
| RestockWheel | 2 | `engine/restock-wheel.js` | Container wheel renderer — slot layout, state visuals, drop targets |
| SupplyRows | 2 | `engine/supply-rows.js` | Right-half renderer — bag/hand/tools rows, drag sources, compatibility glow |
| RestockBridge | 3 | `engine/restock-bridge.js` | Adapter between PeekSlots/CrateSystem/TorchState and RestockSurface |

### Modified Modules

| Module | Changes |
|--------|---------|
| `peek-slots.js` | FILLING state opens RestockSurface instead of CrateUI. State machine preserved. |
| `crate-ui.js` | Rendering logic migrated to RestockWheel + SupplyRows. CrateUI becomes a thin wrapper that delegates to RestockSurface. Kept alive for backward compat during transition. |
| `torch-peek.js` | 3-slot emoji UI replaced by RestockSurface torch mode. BoxAnim → decorative background. |
| `crate-peek.js` | BoxAnim → decorative background. Action button → RestockSurface open. |
| `corpse-peek.js` | BoxAnim → decorative background. Mode detection feeds RestockBridge. |
| `drag-drop.js` | Zone registration extended for RestockSurface's two-half layout. |
| `menu-faces.js` | Face 2 (Gear/Bag) unaffected — the unified surface shows bag items independently. No face-switching needed during restock. |
| `game.js` | Interact handler routes fillable tiles through RestockBridge. |
| `index.html` | 4 new script tags. |

### Deleted (post-migration)

| Module | Reason |
|--------|--------|
| CrateUI rendering logic | Absorbed into RestockWheel + SupplyRows. Shell module kept for API compat. |
| TorchPeek slot emoji UI | Absorbed into RestockWheel torch mode. |

---

## 5. Execution Plan

### Phase RS-1: RestockSurface Shell + Crate Mode — DONE 2026-04-06

1. ✅ `restock-surface.js` (622 lines) — DOM panel (left/right halves), open/close/transition lifecycle, CSS transitions, z-index 19
2. ✅ `restock-wheel.js` (544 lines) — slot layout renderer, DragDrop zone registration, fill logic, quick-fill, readiness bar
3. ✅ `supply-rows.js` (393 lines) — bag/hand/tools rows, compatibility glow, drag initiation, scrollable overflow
4. ✅ `restock-bridge.js` (158 lines) — mode detection, crate routing, torch/corpse legacy fallback
5. ✅ PeekSlots.tryOpen() routes deposit-mode to RestockBridge.open()
6. ✅ game.js number-key forwarding + RestockBridge.update() in render loop
7. ✅ Crate interaction works end-to-end through unified surface

**Depends on**: Nothing new (CrateSystem, CardAuthority, DragDrop all exist)
**Unblocks**: RS-2 ✅, RS-3 ✅

### Phase RS-2: Torch Mode + Tool Targets — DONE 2026-04-06

1. ✅ `restock-wheel.js` torch adapter — reads `TorchState.getTorch()`, renders 3 slots with flame/fuel_dry/fuel_hydrated/empty states, torch-specific colour tokens and emoji
2. ✅ Tool target visuals — flame slot shows 💧 hint (needs water), fuel_dry shows 💧 hint (hydrate), ideal-fuel badge on hydrated slots
3. ✅ Torch DragDrop zones — flame accepts water only (→ extinguish), empty accepts fuel/junk (→ fillSlot), fuel_dry accepts water only (→ hydrateSlot), fuel_hydrated is read-only
4. ✅ SupplyRows compatibility glow — torch pseudo-tags (`torch_water`, `torch_fuel`) flow through `getUnfilledFrameTags()` → `doesItemMatchSlot()` for green glow on water bottles and fuel items
5. ✅ `restock-surface.js` — torch stub replaced with RestockWheel.mount(area, x, y, floorId, 'torch')
6. ✅ `restock-bridge.js` — torch mode enabled (no longer falls back to legacy TorchPeek), detectMode uses `TorchState.getTorch()`
7. ✅ `game.js` — torch interact routes through `RestockBridge.open()` when available, falls back to TorchPeek legacy path otherwise

**Depends on**: RS-1 (surface shell), TorchState (exists), TorchHitResolver (exists)
**Unblocks**: RS-4

### Phase RS-3: Corpse Mode + Hand Row — DONE 2026-04-06

1. ✅ RestockWheel corpse adapter — corpse containers share CrateSystem slot model; existing crate rendering works with zero additional slot code
2. ✅ SupplyRows hand row — already conditionally shown for `_mode === 'corpse'` (line 103); compatibility glow via RestockWheel.getUnfilledFrameTags() + doesItemMatchSlot() works out of the box
3. ⏳ Harvest mode — deferred to RS-4; sealed/no-container corpses stay on legacy CorpseActions path (harvest UI unchanged)
4. ✅ `restock-surface.js` — RS-3 stub replaced with RestockWheel.mount() delegation + i18n label
5. ✅ `restock-bridge.js` — 'corpse' added to supported modes; detectMode already returns 'corpse' for unsealed containers
6. ✅ `game.js` — CORPSE tile interact routes through RestockBridge for deposit path (unsealed containers); sealed/missing containers fall through to legacy _openCorpseMenu
7. ✅ `game.js` — public openCorpseMenu() (CorpsePeek action button) also routes through RestockBridge when target is an unsealed corpse container

**Depends on**: RS-1 (surface shell), CrateSystem (exists)
**Unblocks**: RS-4

### Phase RS-4: Persistent Revolving + Polish — DONE 2026-04-06

1. ✅ Face-turn detection — `restock-bridge.js` update() polls Player.getPos()/getDir() each frame, debounces 150ms before transition, 300ms before auto-close
2. ✅ Slide animation for container wheel swap (200ms) — already existed in RestockSurface.transition() from RS-1; face-turn detection now triggers it automatically
3. ✅ Auto-close when player faces non-interactable — 300ms debounce in RestockBridge.update(); immediate close on player movement (position change)
4. ✅ Compatibility glow system — already existed in SupplyRows from RS-1; match/generic/none borders + box-shadow glow
5. ✅ Number key quick-fill labels — RestockWheel.getSlotLabels() returns per-slot emoji+key, displayed in hint footer as "[1]❤️ [2]⚡" for unfilled slots
6. ✅ Readiness % live update — already existed in RestockWheel.update() from RS-1; _updateReadiness() called each frame
7. ✅ Seal celebration — RestockSurface.triggerSealVFX() with CSS green→gold flash (800ms) + seal button pulse (500ms); PeekSlots.trySeal() prefers RestockSurface over CrateUI when surface is open

**Depends on**: RS-1, RS-2, RS-3
**Unblocks**: RS-5

### Phase RS-5: BoxAnim Decorative Backgrounds + Regression — DONE 2026-04-06

1. ✅ BoxAnim decorative backdrop — RestockSurface creates its own BoxAnim inside the wheel half on open(); variant mapped per mode (crate→'crate', torch→'chest', corpse→'chest'). Lid opens, 25% opacity fade-in, 0.55× scale. Destroyed on close(), re-created on transition().
2. ✅ CrateUI backward-compat wrapper — CrateUI.open() delegates to RestockBridge.open() when available; CrateUI.close() delegates to RestockBridge.close(); CrateUI.isOpen() reports RestockBridge.isActive(). Legacy path preserved when RestockBridge undefined.
3. ✅ Regression audit — all critical paths traced:
   - Seal flow: PeekSlots.trySeal() → CrateSystem.seal() → coins → ParticleFX → RestockSurface.triggerSealVFX() ✓
   - Number key fills (unified): game.js → RestockBridge.handleKey() → RestockSurface → RestockWheel.quickFill() with Toast ✓
   - Number key fills (legacy CrateUI): pre-existing defect — no Toast on success. RS-5 backward-compat wrapper routes through unified surface, effectively fixing it.
   - SessionStats: does not track seals/fills (pre-existing gap, not introduced by RS changes)
4. ✅ Magic Remote pointer accuracy — footer buttons bumped from 36px→48px min-height; SupplyRows scroll arrows bumped from 20px→36px width. All interactive targets ≥ 36px (scroll arrows) or ≥ 48px (everything else).
5. ✅ PeekShell roadmap note — §8b documents future unified peek outer-frame extraction (~4h, post-RS-5).

**Depends on**: RS-1 through RS-4

### Total: ~14h — ALL PHASES COMPLETE (2026-04-06)

---

## 6. Discoverable Affordances

The jam feedback specifically called out "I don't understand the UI." The unified surface solves this through:

1. **Both halves visible simultaneously** — "here is the thing to fill" (left) and "here are your items" (right). No face-switching, no hidden state.

2. **Compatibility glow** — green borders on items that match a slot's demand frame. The player sees "oh, that green-glowing item in my bag goes in that pulsing empty slot."

3. **Labeled hint line** — bottom of the surface shows context-sensitive instructions:
   - Crate: "Drag items to fill slots. [S] Seal when full. [1-5] Quick-fill."
   - Torch: "Drag fuel to empty slots. Drag water to extinguish flame."
   - Corpse: "Drag items to reanimate. Suit-matched cards earn bonus."

4. **Persistent surface** — stays open as you turn to face different containers. Reduces the "open menu, fill one thing, close menu, walk to next thing, open menu again" friction.

5. **Tool target visual** — torch burning slots show a small hose/water icon indicating what action is expected, instead of requiring the player to know the mechanic.

---

## 7. Vendor ↔ Restock Supply Chain

**Added 2026-04-06** — Vendor system integration with spatial contracts.

### 7.1 The Supply Pipeline

Vendors at D1/D2 are the **supply source** for the D3+ restock loop:

```
VENDOR (D1/D2)                    RESTOCK (D3+)
─────────────                    ────────────
Buy Torch Oil (Foundry)    →    Fill torch fuel slot
Buy Trap Kit (Foundry)     →    Rearm triggered trap
Buy Crate Fillers          →    Fill deposit crate slots → seal → coins
Buy Scrub Brush (Admiralty) →   Clean grimed walls faster
Buy Silk Spider (Tide)     →    Install cobweb → readiness
Buy Water Bottle (Tide)    →    Extinguish torch via careful method
```

This pipeline creates the economic tension: **spend gold at vendors to earn gold from restocking**. Vendor supply exclusives (Torch Oil = Foundry only, Scrub Brush = Admiralty only) force the player to visit multiple factions.

### 7.2 VendorRegistry (SC-G)

A central `engine/vendor-registry.js` module replaces the fragmented vendor placement system:

| Responsibility | Before | After |
|---------------|--------|-------|
| Vendor positions | Floor blockout `shops[]` arrays | VendorRegistry.register() on floor load |
| Faction resolution | game.js SHOP tile handler (linear scan) | VendorRegistry.getFaction(x, y, floorId) |
| NPC spawning | game.js floor-load path | VendorRegistry.spawnNPCs(floorData) |
| Interaction | game.js `_openVendorDialog()` | VendorRegistry.interact(x, y, floorId) |
| Depth contract | None (vendors work at any depth) | VendorRegistry enforces D1/D2-only |

### 7.3 RestockSurface Compatibility Glow — Vendor Hint (RS-4 stretch)

When a player opens RestockSurface at a D3+ container, the compatibility glow system (SupplyRows) could show a **vendor hint** for items the player doesn't have but could buy:

- Empty slot demands `battery` → player has no Dead Cells → amber "⚙️ Foundry" badge on the empty supply row
- Empty slot demands `scroll` → player has no Scrap Parchment → amber "🌊 Tide / 🪖 Admiralty" badge

This is a stretch goal for RS-4 (Polish), not a blocker. It bridges the vendor and restock systems visually.

---

## 8. What This Does NOT Change

- **MenuBox 4-face system** — the pause menu, bonfire menu, and shop menu are unaffected. The unified surface is a gameplay overlay, not a menu face.
- **SpraySystem** — continuous hose cleaning remains a hold-to-clean mechanic outside the surface. Only the torch tool-target bridges into the surface.
- **Chest withdraw** — D1/D2 chests and D2 storage crates are withdraw-only (loot → player). SC-B/SC-D handle these via CrateUI, not RestockSurface. D3+ chests in `'empty'` phase DO route to RestockSurface.
- **Non-inventory peeks** — Puzzle, Bookshelf, Bar Counter, Bed are unchanged.
- **CleaningSystem** — the legacy per-tile blood scrub (rag/mop interact) is unchanged.
- **Vendor dialogue** — VendorDialog remains a StatusBar dialogue tree. It is NOT part of RestockSurface. Vendors sell supplies; RestockSurface consumes them. Two separate UIs.

---

## 8b. Future: PeekShell — Unified Peek Outer Frame

**Status**: Roadmapped (post-RS-5)

The restock peeks (CratePeek, TorchPeek, CorpsePeek) and non-restock peeks (PuzzlePeek, MailboxPeek, BarCounterPeek, BookshelfPeek) share identical boilerplate: dwell-timer detection, show/hide lifecycle, Escape-to-close key handling, BoxAnim 3D container, label overlay positioning, and z-index layering. Each module reimplements this independently (~80-120 lines of duplicated pattern per peek).

A shared **PeekShell** module would extract the common outer frame:
- Dwell-detection state machine (timer → show, face-away → debounce → hide)
- DOM container positioning (absolute center, z-index 18)
- BoxAnim lifecycle (create variant on show, open lid, close + destroy on hide)
- Label overlay layer (flat div above 3D scene)
- Key routing (Escape → hide, forward others to inner content)
- Magic Remote pointer target enforcement (min 48px tap zones)

Each peek would then provide only its **inner content renderer** and **interaction handler**, cutting per-module boilerplate by ~60% and ensuring visual consistency automatically.

**Not a refactor of RestockSurface** — PeekShell is for the *preview* overlays (face a tile → see info + action button). RestockSurface is the *interaction* surface (drag-drop, slot filling, seal). PeekShell.show() may trigger RestockBridge.open() on interact, but they are separate layers.

**Scope**: ~4h for PeekShell extraction + migration of 3 restock peeks. Non-restock peeks migrate incrementally.

---

## 9. Cross-References

- **PRESSURE_WASHING_ROADMAP (DOC-PW)**: SpraySystem (PW-3) feeds torch tool-targets in §2.1 slot states.
- **INVENTORY_CARD_MENU_REWORK (DOC-46)**: CardAuthority bag/hand/equip APIs are the data source for supply rows.
- **LIGHT_AND_TORCH_ROADMAP (DOC-31)**: TorchState slot model (Phase 3a) provides the torch container wheel data.
- **GAME_FLOW_ROADMAP**: 4-face menu contexts (pause/bonfire/shop) are unmodified.
- **GAP_ANALYSIS (DOC-33)**: This roadmap directly addresses the "restock discoverability" gap flagged by jam playtest.
- **SPATIAL_CONTRACTS.md (SC-G)**: VendorRegistry module + vendor depth contracts. Vendors are D1/D2-only supply sources feeding D3+ restock loop.

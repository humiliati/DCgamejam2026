

we have the hud frames around the screen then we have the 3d viewport. we need the minimap to be imbedded in the hud frames so that it's showing the map in real time, with a tiny icon for it's expanded overlay state.



the floor number is being displayed in the 3d viewport and the hud, we only need it in the hud around the minimap.



the batteries is being displayed in the 3d viewport and the hud, we only need it in the hud



we have a nch overlay widget featuring a stack of cards representing the number of cards in the hand, this overlay has a capsule border and redundant text, we could do with just the emoji card symbols and their behavior; no text, no capsule background.



clicking "bag" in the bottom left of the hud opens the bag menu but clicking it again doesn't close the bag menu



the map button in the bottom left should be removed once we clean up all the other navigational buttons and condense them



there's a random floating map button in the middle of the 3d viewport



the debrief button on the hud seems unnecessary



we need to look back at dcexjam2025 HUD, it has directional buttons and an animated hud map that we need. i'm also under the impression that glov.js in dcexjam2025 enables the player to click the expanded minimap and that gives the player a pathing queue (just like gone-rogue fishing mechanic. we need this click on revealed minimap tiles to move functionality)



we have a footer across the bottom of the hud that needs to be about 4x thicker to account for a tooltip row with a history expandable. info such as loot, npc barks and dialogue, the door transition text from the peek, all needs to be printing to the tooltip footer with expandable history. let's look at Eyesonly for their tooltip example. we're also following the dialogue system similarly so the document eysonly/docs/TOOLTIP_SPACE_CANON.md is somewhat applicable.



### CratePeek z-stacking fix (Apr 3)

FIXED: crate-peek overlay text was invisible and nothing was clickable when facing a BREAKABLE tile. Root cause was three-layered:

1. Inner label ("? LOOT ?") placed inside `.box3d-glow` in the 3D transform hierarchy — opaque box faces occluded it in 3D space.
2. Sub-label too close to the 3D-projected bounding area (margin 36px not enough for 420×260 crate at rotateX -42deg).
3. InteractPrompt renders on canvas, CratePeek DOM overlay at z-index:18 painted over it. Users couldn't see the prompt to click it.

Fix: Labels moved to flat overlay (`_labelLayer`, z-index:2) above the 3D scene (z-index:1). Sub-label margin increased to 60px. Added visible `[OK] Smash` action button with pointer-events:auto that calls new `Game.interact()` public API.

Files: `engine/crate-peek.js`, `engine/game.js` (added `Game.interact()`).


### Click-Everything Phase 1 (Apr 3)

COMPLETED: All keyboard-only overlays now clickable for LG Magic Remote users.

Changes made:
1. **Slider click-to-set** (menu-faces.js, game.js): Clicking a Face 3 volume slider track now jumps to the clicked position. Added `handleSettingsSetValue()` to MenuFaces, game.js calculates pct from pointer x vs hit zone bounds.
2. **Dialog per-button hit-testing** (dialog-box.js): Choice buttons in dialog boxes now individually clickable. `_buttonHitRects` populated during render, `handlePointerClick()` iterates them with pointer position matching. Keyboard fallback still fires button[0].
3. **Documentation audit**: Updated MENU_INTERACTIONS_CATALOG.md — Face 3 toggles (810+), exit buttons (820/821), and slider click-to-set were already wired but catalog said "Stub needed". Corrected all to "Complete".

Already-wired targets confirmed working (no code changes needed):
- Face 3 toggles (screenShake, invertYFreeLook, showFps, minimapVisible) — hit zones 810+
- Face 3 "Return to Game" (820) and "Quit to Title" (821)
- Face 3 language selector (830)
- CratePeek action button (from earlier fix)

Files: `engine/dialog-box.js`, `engine/menu-faces.js`, `engine/game.js`, `docs/MENU_INTERACTIONS_CATALOG.md`.


### Keyboard / Hover / Tooltip Pass (Apr 3)

Comprehensive audit + fix pass across all interactive elements for keyboard navigation, pointer hover feedback, and tooltips.

**dialog-box.js — Keyboard button navigation**:
- Added `focusBtn` to dialog state, tracks which button has keyboard focus
- Added `handleKey(key)` — ←/→ cycles focus between buttons (wraps around)
- `advance()` now fires the focused button instead of always closing when buttons present
- Render shows gold focus caret (▶) + gold highlight on keyboard-focused button; green highlight on pointer-hovered button
- game.js `turn_left`/`turn_right` handlers now intercept for DialogBox before the pause check

**menu-faces.js — Face 3 slider hover**:
- Slider rows now show pointer hover highlight (row background, bold label, brighter track fill) when pointer is over the slider hit zone but the row isn't keyboard-selected
- Slider description tooltip now shows for hovered row (not just selected row)

**index.html — Status-bar button hover**:
- `.sb-btn:hover` enhanced: stronger box-shadow glow, subtle translateY(-1px) lift
- `.sb-btn:active` added: press-down feedback (translateY(0), darker background)
- `.minimap-compass-btn:hover` enhanced: box-shadow glow, scale(1.08)
- `.minimap-compass-btn:active` added: scale(0.95) press feedback
- Both base rules updated with `transition: transform 0.1s`

**crate-ui.js — Slot hover**:
- Standard slots (`_renderSlot`): Added `InputManager.getPointer()` check each frame; hovered slot gets brighter background + gold border (#f0d070) + thicker line
- Stash grid slots (`_renderGridSlot`): Same hover treatment for grid layout

**door-peek.js — Action button + hover**:
- Added `_labelLayer` (z-index:2) above 3D scene (z-index:1), matching crate-peek pattern
- Added clickable `[OK] Enter/Exit` button with direction-aware colors (warm gold for advance, cool blue for retreat)
- Button has mouseenter/mouseleave hover feedback (border, color, glow changes)
- Button hidden for night-locked doors, fades in after door opens
- Sub-label margin increased 36→60px to clear 3D projection

Files: `engine/dialog-box.js`, `engine/game.js`, `engine/menu-faces.js`, `engine/crate-ui.js`, `engine/door-peek.js`, `index.html`.


### Torch / Cobweb Interaction Pass (Apr 4)

Brought torch-peek and cobweb-node into compliance with the established peek pattern (crate-peek, door-peek): no text behind animations, everything clickable, hover feedback, keyboard inputs.

**torch-peek.js — Full restructure to match peek pattern**:
- **z-stacking fix**: Slot indicators were inside `.box3d-glow` (3D transform hierarchy) — same bug crate-peek had. Moved to flat `_labelLayer` (z-index:2) above 3D scene (z-index:1).
- **Sub-label margin**: Bumped 36→60px to clear 3D projection (consistent with crate-peek, door-peek).
- **Action button**: Added clickable `[OK] Extinguish / [OK] Refuel` button with mouseenter/mouseleave hover (warm amber palette). Button text updates to `[ESC] Close` during interaction mode.
- **Slot indicator hover**: Each of the 3 slot tiles now has `pointer-events:auto`, cursor:pointer, hover feedback (white border, scale(1.1), darker background). Shows slot number in corner.
- **Slot click**: Clicking a slot during interaction mode simulates the corresponding Digit key press. Clicking before interaction starts triggers `Game.interact()` first.
- **Slot strip**: New `_slotStrip` div in label layer, fades in after lid opens, fades out on hide.
- **Subtitle update**: Now shows `[click slot] fill` hint alongside keyboard hints during interaction.

**cobweb-node.js — Canvas prompt made clickable + hoverable**:
- **Hit box storage**: `_promptHitBox` stored each frame during render with prompt bounds.
- **Pointer hover detection**: Each frame checks `InputManager.getPointer()` against hit box. When hovered: brighter border (#aaffcc), thicker line (2px), green glow shadow, brighter text.
- **`handlePointerClick()`**: New function — checks pointer against `_promptHitBox`, calls `tryInteract(floorId)` on match. Returns true if consumed.
- **game.js wiring**: `CobwebNode.handlePointerClick()` dispatched before `InteractPrompt` click check (since cobweb prompt sits above it visually).
- **Cleanup**: Hit box and hover state cleared when prompt alpha drops below threshold.

Files: `engine/torch-peek.js`, `engine/cobweb-node.js`, `engine/game.js`.


### Corpse / LockedDoor / Merchant Peek Pass (Apr 4)

Applied the established peek pattern to the remaining three BoxAnim peek modules. All three had the same z-stacking bug: labels and emoji rendered inside `.box3d-glow` (3D transform hierarchy), getting occluded by opaque box faces.

**corpse-peek.js — Full restructure**:
- **z-stacking fix**: Skull emoji was inside `.box3d-glow`. Moved to `_innerLabel` in flat `_labelLayer` (z-index:2) above box (z-index:1).
- **Sub-label margin**: Bumped 36→60px to clear 3D projection.
- **Action button**: Added clickable `[OK] Harvest` / `[OK] Restock` button (mode-aware) with spectral purple hover palette. Delegates to `Game.interact()`.
- **Public API**: Added `forceHide()` and `isActive()` for game.js integration.

**locked-door-peek.js — Full restructure**:
- **z-stacking fix**: "🔒 LOCKED" text was inside `.box3d-glow`. Moved to `_innerLabel` in flat `_labelLayer` (z-index:2) above box (z-index:1).
- **Sub-label margin**: Bumped 30→60px.
- **Action button**: Added `[OK] Unlock` / `[OK] Use Key` button — only displayed when player has the required key. Crimson hover palette. Delegates to `Game.interact()`.
- **Key check**: `_show()` now checks `Player.hasItem()` against the door's keyId to determine button visibility.

**merchant-peek.js — Full restructure**:
- **z-stacking fix**: Faction emoji + "SHOP" was inside `.box3d-glow`. Moved to `_innerLabel` in flat `_labelLayer` (z-index:2) above box (z-index:1).
- **Sub-label margin**: Bumped 36→60px.
- **Action button**: Added `[OK] Browse Wares` button with faction-colored styling (border and text inherit faction palette). Delegates to `Game.interact()`.
- **Faction-dynamic inner label**: `_innerLabel` color and text-shadow update per-faction on each `_show()`.
- **Public API**: Added `forceHide()`.

Files: `engine/corpse-peek.js`, `engine/locked-door-peek.js`, `engine/merchant-peek.js`.


### Peek Escape/Close Pass (Apr 4)

Added reasonable ESC key + clickable close targets to all "self-imposed" peek modules. Design rule: door/locked-door peeks are navigational (you dismiss by turning away), so they get no close button. Interactive peeks (crate, corpse, merchant, puzzle) get both an `[ESC] Close` button and keyboard ESC handling, since the player may want to dismiss without moving.

**Modules updated**:
- **crate-peek.js**: Added `_closeBtn` ([ESC] Close), `handleKey('Escape')`, `isActive()`, `forceHide()`. Close button positioned below action button, warm amber subdued palette.
- **corpse-peek.js**: Added `_closeBtn`, `handleKey('Escape')`. Spectral purple subdued palette.
- **merchant-peek.js**: Added `_closeBtn`, `handleKey('Escape')`. Gold subdued palette.
- **puzzle-peek.js**: Added `_closeBtn` (inside panel below confirm button), `handleKey('Escape')`, `isActive()`, `forceHide()`. Blue subdued palette matching panel.

**game.js ESC routing** — Added 4 new intercepts in the `pause` handler, after BookshelfPeek and before the pause toggle:
1. `CratePeek.isActive()` → `CratePeek.handleKey('Escape')`
2. `CorpsePeek.isActive()` → `CorpsePeek.handleKey('Escape')`
3. `MerchantPeek.isActive()` → `MerchantPeek.handleKey('Escape')`
4. `PuzzlePeek.isActive()` → `PuzzlePeek.handleKey('Escape')`

**Deliberately NOT changed**:
- **door-peek.js**: Navigational peek — auto-dismissed by turning away. No close needed.
- **locked-door-peek.js**: Navigational peek — shakes on approach, auto-dismissed by turning. No close needed.
- **torch-peek.js**: Already had full ESC handling via `_closeInteraction()`.

Files: `engine/crate-peek.js`, `engine/corpse-peek.js`, `engine/merchant-peek.js`, `engine/puzzle-peek.js`, `engine/game.js`.


### Peek Box Variant + Glow Fix (Apr 4)

Root cause: torch-peek, corpse-peek, and merchant-peek all used `BoxAnim.create('crate', ...)` — the crate variant is 420×260 at -42° top-down, causing visible face intersection gaps. All three should have used the `chest` variant (200×140, cleaner geometry, hinge-bottom lid).

**Variant switches** (1-line JS each):
- **torch-peek.js**: `'crate'` → `'chest'`. Added warm sconce face colors via CSS vars (`--box-dark:#3a2008`, `--box-light:#c88030`), lit/unlit variants.
- **corpse-peek.js**: `'crate'` → `'chest'`. Replaced hacky `hue-rotate(240deg)` filter with proper coffin-grey-purple CSS vars (`--box-dark:#1a1020`, `--box-light:#4a3860`).
- **merchant-peek.js**: `'crate'` → `'chest'`. Expanded FACTION_STYLE map with `dark`/`light` face colors per faction. Applied via `--box-dark`/`--box-light` vars.

**CSS chest-variant enrichment** (`index.html`):
- Added `.box3d-wrap.chest-variant .box3d-glow` with 4-stop volumetric radial gradient (matching splash quality). Uses `var(--box-glow)` so each peek's color propagates to the full orb.
- Converted hardcoded face colors on side faces, lid, top, bottom, and back to use CSS vars (`--box-dark`, `--box-light`, `--box-ceil`, `--box-floor`). Now any peek that overrides those vars gets coherent faces.

**Full audit**: See `docs/PEEK_BOX_VISUAL_AUDIT.md` for the complete matrix of what's working, what's broken, and post-jam geometry fixes.

Files: `engine/torch-peek.js`, `engine/corpse-peek.js`, `engine/merchant-peek.js`, `index.html`.


### CrateUI Interaction Overhaul (Apr 4)

Major overhaul to make the crate/corpse/chest fill interface fully click+drag friendly for LG Magic Remote. Previously seal required 'S' key (which is a movement key on Magic Remote) and the player's bag was invisible during fill — they had to fill blind via number keys.

**Clickable SEAL button** (`crate-ui.js`):
- Canvas-rendered `[★ SEAL ★]` button below slot row, centered with close button to the right
- Three states: hidden (chest mode), disabled/dim (not all slots filled), ready/glowing (all filled, gold pulsing border)
- Hit-test in `handleClick()` delegates to `PeekSlots.trySeal()` for full coin/particle/state flow
- S key still works as keyboard accelerator, also delegates to PeekSlots now

**Clickable [ESC] Close button** (`crate-ui.js`):
- Rendered to the right of the seal button (deposit mode) or centered (chest withdraw mode)
- Hit-test delegates to `PeekSlots.close()` for proper cleanup
- Subdued palette, brightens on hover

**Visible Bag Strip** (`crate-ui.js`):
- Horizontal row of bag items rendered below seal/close buttons during deposit mode
- BAG_SLOT_SIZE=44px, BAG_SLOT_GAP=8px, max 12 visible with overflow indicator (+N)
- Each item shows emoji + truncated name, with hover highlight and selection gold border
- "YOUR BAG" label above, "BAG EMPTY" notice when empty

**Click-to-Fill Flow** (`crate-ui.js`):
- Click bag item with exactly 1 empty slot → auto-fills that slot immediately
- Click bag item with multiple empty slots → selects it (gold border), highlights all empty crate slots (green border)
- Click highlighted crate slot → fills from selected bag item, deselects
- Click empty area → deselects bag item
- New `_fillFromBagAt(bagIdx, slotIdx)` function for targeted fill with toast + coin award

**Seal Satisfaction VFX** (`crate-ui.js`):
- White flash (200ms, 70% opacity) — full viewport overlay
- Gold flash (400ms, 25% opacity, layered after white) — warm tint
- "★ SEALED ★" bouncing text — scales 0→1.2→1.0 over 500ms with dark outline, rendered at 30% viewport height
- `triggerSealVFX()` exposed on public API, called by PeekSlots.trySeal()

**PeekSlots Integration** (`peek-slots.js`):
- `trySeal()` now calls `CrateUI.triggerSealVFX()` after successful seal
- Added `BAG_ZONE_PREFIX` and bag DragDrop source zone registration (guarded — silently no-ops if DragDrop lacks `registerSource`)
- Bag source zones unregistered in `_unregisterSlotZones()`

**Panel sizing**: Panel now dynamically grows to accommodate seal button row (42px) and bag strip (74px) in deposit mode. Min width 320px to ensure buttons fit.

Files: `engine/crate-ui.js`, `engine/peek-slots.js`.


### CrateUI Seal + Hand Strip Pass (Apr 4)

**F key seals** (`crate-ui.js`):
- F (interact key) now triggers seal alongside S. F is the natural interact key on Magic Remote, S was conflicting with movement. Both route to unified `_attemptSeal()`.

**Tiered seal response** (`crate-ui.js`):
- **0 slots filled** → REJECT: `_rejectFlash` timer (600ms) pulses the bag strip label ("▼ YOUR BAG ▼"), hand strip label, and close button border red/amber. Toast warning + error SFX.
- **Some slots filled** → PARTIAL SEAL: `CrateSystem.forceSeal()` awards proportional coins (ratio × base bonus, min 1g). Mini gold flash only (no white flash), smaller coin burst, no d100 reward roll.
- **All slots filled** → FULL SEAL: delegates to `PeekSlots.trySeal()` for max coins, full VFX, d100 reward.

**Seal button 3-state render** (`crate-ui.js`):
- Empty (0 filled): dim grey, label `[F] SEAL`
- Partial (some filled): warm amber border, label `[F] SEAL (2/4)` showing fill count
- Full (all filled): gold pulsing border, label `[F] ★ SEAL ★`

**Seal tooltip** (`crate-ui.js`):
- Post-seal Toast: "Crate sealed & marked ready in time for next Ember day (in 2d)"
- Uses `DungeonSchedule.getGroupForFloor(floorId)` → `getDaysUntilHeroDay(groupId)` for faction day info.
- Handles edge cases: today, resolved, unknown faction.

**Hand/Deck strip for corpses** (`crate-ui.js`):
- Corpse containers now show a "YOUR HAND" strip below the bag strip
- Renders combat cards from `CardAuthority.getHand()` with suit emoji in top-left corner
- Suit-matching cards get green border highlight (matches corpse's required suit)
- Click hand card with 1 matching SUIT_CARD slot → auto-fills. Multiple matching → selects card, highlights matching slots.
- `_fillSuitCardFromHand()` removes card from hand via authority, fills SUIT_CARD slot.
- `_handleHandCardClick()` handles selection/deselection logic.
- `_selectedHandIdx` state tracks which hand card is selected.
- Panel height dynamically grows to accommodate hand strip (extra 74px).

**CrateSystem.forceSeal()** (`crate-system.js`):
- New function for partial seals. Seals with whatever's filled.
- Reduced bonus: `Math.round(fullBonus × filledRatio)`, minimum 1 coin.
- No d100 reward roll (only full seals get bonus loot).
- Reanimation check still requires matched suit card (corpses only).
- Exposed on public API.

Files: `engine/crate-ui.js`, `engine/crate-system.js`.


### Phase 2: HUD Cleanup Pass (Apr 4)

**Redundant display audit results:**
- Old HUD overlay (`#hud` div with `hud-floor`, `hud-battery-pips`, `hud-hp`, etc.) was already `display:none` — kept as API-compat stubs. Compressed to single-line stubs.
- NCH widget badges (`BAG 0/12`, `DECK 0`) already had `.nch-badges { display: none }` in CSS. Widget is emoji-only — clean.
- Battery pips render to hidden `#hud-battery-pips` (no viewport duplicate). Status bar handles visible battery display.

**Minimap floor label removed** (`index.html`):
- `#minimap-floor-label` set to `display:none`. Was showing floor name at bottom of minimap frame, redundant with `#sb-floor` in the status bar below.
- `minimap.js` still writes to the element (no-op since hidden), so no JS changes needed.

**Compass map button hidden** (`index.html`):
- `.minimap-compass-btn` (`#sb-map`) set to `display:none`. Was a circular "N" compass button positioned top-left inside `#minimap-frame`.
- Redundant: minimap already has `#minimap-expand` toggle button. The compass doubled as a FLEE button during combat, but `#minimap-frame` is hidden during combat anyway, so flee never actually worked through this path.
- Flee is handled by combat UI / card fan directly.

**Bag button toggle fixed** (`status-bar.js`):
- Previous behavior: clicking bag while paused on Face 2 only closed if `MenuFaces.getInvFocus() === 'bag'` — this check was unreliable because inv focus could reset during menu open transition.
- New behavior: clicking bag while paused on Face 2 always closes and resumes gameplay via `MenuBox.close()` + `ScreenManager.resumeGameplay()`. If paused but on a different face, navigates to Face 2.
- Same fix applied to deck button — clicking deck while on Face 2 closes menu.

**Vestigial HUD stubs compressed** (`index.html`):
- Old HUD div with 7 `display:none` span/div elements compressed to a compact single-line stub block. Elements kept for `HUD.js` API compat (it calls `getElementById` on init).

Files: `index.html`, `engine/status-bar.js`.


### Phase 3: Deep Audit — Shops, Peeks, Inventory (Apr 4)

Full audit of Phase 3 systems. Goal: verify shops and peeks work, not just exist.

**Shop system: FULLY WIRED**
- `shop.js` has complete buy/sell/sellPart API with faction reputation, pricing, inventory generation
- `menu-faces.js` has 3 shop-context renderers: Face 0 (vendor info), Face 1 (buy grid), Face 2 (sell pane + salvage)
- `game.js` dispatches buy/sell/sellPart click actions at lines 438-443 to dedicated handlers
- Sell drag-drop zone activates when `menuContext === 'shop'`
- No code changes needed — shop is end-to-end functional

**Peek modules: forceHide() gap closed**
- 5 peeks had forceHide() (corpse, crate, locked-door, merchant, puzzle)
- 9 peeks were missing it: bar-counter, bed, bookshelf, chest, door, mailbox, monologue, peek-slots, torch
- Added `forceHide()` to all 9 — each delegates to its internal hide mechanism (_hide, cancel, or close)
- All peeks now have uniform programmatic dismiss capability

**Quick-bar bug fix:**
- `Player.useItem(1)` was hardcoded — always used slot 1 regardless of which equipped slot was clicked
- Fixed to `Player.useItem(idx)` — consumables in any slot now use correctly

**DragDrop API gap (documented, not blocking):**
- `peek-slots.js` calls `DragDrop.registerSource()` / `removeSource()` which don't exist in drag-drop.js
- Already guarded with `typeof` check — silently no-ops
- Click-to-fill path works independently of drag sources
- Bag/hand strip in CrateUI provides the interaction surface instead

**Tier 1-2 roadmap verification:**
- T1.4 suit toast, T1.5 enemy telegraph, T1.6 corpse tiles: all fully implemented
- T2.1 bag viewer, T2.2 stash transfer, T2.3 rep feedback, T2.4 deck reshuffle, T2.5 victory/game-over: all implemented
- T2.6 NCH card reorder: only item truly missing, deferred post-jam (aesthetic only)
- GAP_COVERAGE_TO_DEPLOYABILITY.md updated to v2.0 reflecting 19/20 jam-critical items complete

Files: `engine/quick-bar.js`, `engine/bar-counter-peek.js`, `engine/bed-peek.js`, `engine/bookshelf-peek.js`, `engine/chest-peek.js`, `engine/door-peek.js`, `engine/mailbox-peek.js`, `engine/monologue-peek.js`, `engine/peek-slots.js`, `engine/torch-peek.js`, `docs/GAP_COVERAGE_TO_DEPLOYABILITY.md`.


### Phase 4: Deep Audit Bug Fixes (Apr 4)

Deep code review of deck reshuffle, suit toast, corpse pipeline, and shop flow. Found and fixed 6 bugs ranging from critical data loss to logic errors.

**CRITICAL: Hand cards lost on floor transition** (`card-authority.js`):
- `resetDeck()` cleared the hand without returning cards to backup first. Any cards in hand during a floor transition were permanently destroyed.
- Fix: Added loop to push hand cards back into backup before rebuilding deck. Cards are now preserved through transitions.

**CRITICAL: Suit toast null pointer on empty stack** (`suit-toast.js`):
- `SuitToast.show()` called `SynergyEngine.getDominantSuit(stackCards)` without checking if stackCards was empty. Empty array → null → undefined lookups in SUIT_SYMBOLS.
- Fix: Added early return if `!stackCards || stackCards.length === 0`.

**CRITICAL: Suit toast hardcoded percentage fallback** (`suit-toast.js`):
- When `result.suitLabel` was empty, fallback always showed "+50%" or "-25%" regardless of actual multiplier value. Heart stacks (neutral, ×1.0) with custom enemy multipliers would show wrong text.
- Fix: Fallback now computes percentage dynamically from `result.suitMult`: `Math.round((suitMult - 1.0) * 100)`.

**HIGH: Corpse placement silent failure** (`combat-bridge.js`):
- Corpses only placed on `TILES.EMPTY` tiles. If enemy died on BREAKABLE, COLLECTIBLE, or existing CORPSE, placement silently failed — registry created but no tile set, creating a data mismatch.
- Fix: Extracted `_placeCorpseTile()` helper that allows overwriting any walkable tile (EMPTY, BREAKABLE, COLLECTIBLE, CORPSE).

**HIGH: Corpse placement floor race condition** (`combat-bridge.js`):
- `FloorManager.getCurrentFloorId()` called inside async death anim callback. If player transitioned floors during the ~500ms death animation, corpse was registered on the wrong floor.
- Fix: `corpseFloorId` captured at death initiation, validated against current floor in callback. Placement skipped if floor changed.

**HIGH: Shop inventory cache ignores rep tier** (`shop.js`):
- Cache key was `factionId + '_' + floor` — didn't include rep tier. After selling items and gaining a tier, re-opening the same shop showed stale tier-0 inventory with tier-0 prices.
- Fix: Cache key now includes rep tier: `factionId + '_' + floor + '_' + repTier`.

**HIGH: Sell price display/actual mismatch risk** (`menu-faces.js`, `shop.js`):
- Menu-faces had a hardcoded `SELL_VALUE` table (`{common: 12, uncommon: 24, ...}`) independently defined from `Shop._calcSellPrice()`. If pricing constants changed in shop.js, the UI would show wrong values.
- Fix: Exposed `Shop.getCardSellPrice(card)` on public API. Menu-faces now calls it with fallback to hardcoded table only when Shop module is unavailable.

Files: `engine/card-authority.js`, `engine/suit-toast.js`, `engine/combat-bridge.js`, `engine/shop.js`, `engine/menu-faces.js`.
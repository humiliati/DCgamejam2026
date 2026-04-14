# Cozy Interiors Design — Building Havens & Time-Freeze Sanctuaries
> **DOC-10** | Dungeon Gleaner — DC Jam 2026 | Created: 2026-03-29
>
> **⚠ Alignment note (v2.2, April 2 2026):** The world graph was restructured in Tutorial_world_roadmap.md v2.0+. Floor 0.1 (Entry Lobby) no longer exists — the player goes directly from Floor 0 to Floor 1 (The Promenade). References to "Entry Lobby" and "Floor 0.1" in this document should be read as Floor 1 interiors. The interior design principles and time-freeze rules remain valid. As of v2.2: DayCycle.setPaused() is implemented, BedPeek and MailboxPeek are live, bookshelves are auto-placed in all proc-gen interiors via `_placeBookshelvesInInterior()`, and Floor 1.6 has 7 hand-placed bookshelves. See §11 for full status.
>
> **⚠ Refresh note (v2.3, April 14 2026):** Since v2.2, a lot has shipped or landed in design that *directly* affects cozy interiors but wasn't represented here. Highlights:
> - **Real window tiles** (`WINDOW_SHOP`/`BAY`/`SLIT`/`ALCOVE`/`COMMERCIAL`/`ARROWSLIT`/`MURDERHOLE`) with freeform cavities and face-aware tint (amber inside-looking-out, cyan outside-looking-in). Interiors are no longer wall-in-a-box — they have views. See `LIVING_WINDOWS_ROADMAP.md`.
> - **EmojiMount system** binding emoji to tile cavities as vignette scenes. Interior windows will show pasted-parent-floor vignettes or curated scene emoji (candles, silhouettes). See `LIVING_WINDOWS_ROADMAP.md` §Phase 6 (in flight).
> - **Surface-mount tile family** coming online: `TABLE`, `COUNTER`, `COFFEE_TABLE` with per-tile emoji mounts for drinks, books-in-progress, card piles, board-game props. Reframes BAR_COUNTER as the surface-mount prototype.
> - **Proxy zones** — interior floors with windows looking out at live pasted exterior scenes (parent-floor tiles + skybox substitution). Pilot target: Driftwood Inn 1.2 windows looking at Promenade. See `PROXY_ZONE_DESIGN.md`.
> - **Living Architecture primitives** (`PERGOLA`, `PERGOLA_BEAM`, `CANOPY`, `FENCE`) landed — relevant because the Coral Bazaar + future city plaza interiors will use open-air roofed pergolas as the cozy-but-exterior boundary zone. See `ARCHITECTURAL_SHAPES_ROADMAP.md`.
> - **NPC system v1** shipped with bark pools, awareness cones, patrol paths. §10.4 "NPC presence" promise is now backed by real code. See `NPC_SYSTEM_ROADMAP.md` and `VERB_FIELD_NPC_ROADMAP.md`.
>
> The interaction taxonomy (§3), per-building inventory (§6), juice (§10), and cross-references (§12) have been updated. Section 5 reframes BAR_COUNTER as the prototype for the surface-mount family. Section 6 adds window placements per building. The Cross-References table is much larger.

---

## Table of Contents

1. [Overview — The Safety Contract](#1-overview--the-safety-contract)
2. [The Time-Freeze Rule](#2-the-time-freeze-rule)
3. [Interior Interaction Taxonomy](#3-interior-interaction-taxonomy)
3.5. [Interior Windows & Cavity Vignettes](#35-interior-windows--cavity-vignettes)
4. [Bookshelf Interactions (BOOKSHELF tile)](#4-bookshelf-interactions-bookshelf-tile)
5. [Bar Counter Interactions (BAR_COUNTER tile)](#5-bar-counter-interactions-bar_counter-tile)
5.5. [Surface-Mount Family — Tables, Counters, Coffee Tables](#55-surface-mount-family--tables-counters-coffee-tables)
6. [Per-Building Interaction Inventory](#6-per-building-interaction-inventory)
7. [Cozy Minigame Stubs (Post-Jam Roadmap)](#7-cozy-minigame-stubs-post-jam-roadmap)
8. [Book & Document Data Schema](#8-book--document-data-schema)
9. [Peek Overlay Module Specs](#9-peek-overlay-module-specs)
10. [Juice — Making Interiors Feel Like Home](#10-juice--making-interiors-feel-like-home)
11. [Implementation Status & Roadmap](#11-implementation-status--roadmap)
12. [Cross-References](#12-cross-references)

---

## 1. Overview — The Safety Contract

Building interiors (depth-2 floors, ID format `N.N`) are **safe havens**. They are the game's exhale — the cozy counterpoint to the dungeon's tension and the exterior's time pressure. Every interior communicates the same promise:

> **"You are safe here. Take your time. Nothing bad will happen."**

This is the Safety Contract. It is reinforced through four channels:

1. **Time freezes** — the world clock stops inside buildings. No curfew pressure, no hero-day countdown, no dusk bells. The player can browse, read, drink, and explore at their own pace.

2. **Warm aesthetics** — amber plank walls, dark wood floors, warm fog, short render distance. Interiors feel enclosed and protected. The palette shifts from the cool blues/greens of the Promenade to honeyed browns and golds.

3. **Low-stakes interactions** — bookshelves give tips, bar counters give tiny stat boosts, NPCs gossip. Nothing here can hurt the player. Every interaction is a net positive — even if tiny.

4. **Bark pools shift tone** — exterior barks mention time pressure and hero threats. Interior barks mention comfort, local gossip, and building-specific lore. The language itself becomes cozier.

### Design Axiom

> **"If the player doesn't want to linger in a building, the building has failed."**
>
> Every interior should have at least one interaction the player actively *wants* to return to — a bookshelf with lore that drips the conspiracy, a bar counter that clears a debuff, an NPC with a new dialogue branch. The building is not a corridor to the dungeon; it is a destination.

---

## 2. The Time-Freeze Rule

### 2.1 Rule Definition

| Floor Depth | ID Format | Time Behaviour | Examples |
|-------------|-----------|---------------|----------|
| **Depth 1** (exterior) | `"N"` | Time advances normally | The Approach (`"0"`), The Promenade (`"1"`), Lantern Row (`"2"`) |
| **Depth 2** (interior) | `"N.N"` | **Time frozen** — world clock paused | Coral Bazaar (`"1.1"`), Driftwood Inn (`"1.2"`), Gleaner's Guild (`"1.3"`), Home (`"1.6"`) |
| **Depth 3** (dungeon) | `"N.N.N"` | Time advances normally | Soft Cellar (`"1.3.1"`), Hero's Wake B1 (`"2.2.1"`) |

**The rule is simple:** Depth-2 floors freeze the world timer. Depth-1 and depth-3 floors do not.

### 2.2 Implementation Spec ✅ Implemented

The day/night cycle system exposes `DayCycle.setPaused(bool)`. The wiring:

```javascript
// In Game._onFloorArrive(floorId):
var depth = FloorManager.getDepth(floorId);  // 1, 2, or 3
if (typeof DayCycle !== 'undefined') {
  DayCycle.setPaused(depth === 2);  // Freeze at depth 2, resume otherwise
}
```

**Edge cases:**
- **Entering a building**: timer freezes immediately on floor transition. The player sees the dusk sky through the door crack (door-peek) but the clock doesn't advance while they're inside.
- **Exiting a building**: timer resumes from exactly where it was. If dusk was at 78% when the player entered, it's still 78% when they exit — no time has passed.
- **Nested entry**: entering a dungeon (depth 3) from inside a building (depth 2) resumes the timer. The dungeon is not safe.
- **Curfew while inside**: cannot happen. The timer is frozen. The player can stay in a building forever without curfew collapse.
- **Hero Day while inside**: heroes spawn and patrol exterior floors. If the player is in a building, they hear the commotion through bark pools (`interior.*.heroday`) but are completely safe. Exiting is their choice.

### 2.3 Narrative Justification

The Boardwalk Council's curfew enforcement doesn't apply inside private buildings. The law governs the streets and dungeons, not the interiors. From the Guild's perspective, an operative browsing the Bazaar after hours is "off-duty and sheltered" — not violating curfew.

This also explains why the Driftwood Inn is a desirable destination: staying there is literally free time. The player can read lore, drink at the bar, and talk to NPCs without any clock pressure. It's the game's equivalent of a save room in Resident Evil — a mechanical and emotional reset.

### 2.4 HUD Indicator

When the timer is frozen, the HUD clock widget shows a **snowflake icon** (❄️) or a **pause indicator** (⏸️) next to the time display. The clock digits stop animating. On exit, they resume ticking with a subtle pulse animation to signal "time is moving again."

---

## 3. Interior Interaction Taxonomy

Every depth-2 interior has a curated set of interactable tiles beyond doors and stairs. These fall into five categories:

| Category | Tile Type | Interaction | Repeat? | Effect |
|----------|-----------|------------|---------|--------|
| **Bookshelf** | `TILES.BOOKSHELF` (25) | Face → auto-peek; OK → next page | Infinite | Tips, lore, conspiracy drip. Purely informational. |
| **Bar Counter** | `TILES.BAR_COUNTER` (26) | Face → billboard; OK → consume drink | 3 taps/visit | Tiny stat boost (+1 energy, +3 HP, +5% speed, clear debuff) |
| **Vendor Stall** | `TILES.SHOP` (12) | Face → peek; OK → browse shop | Infinite | Buy/sell items and cards |
| **NPC** | Enemy entity (friendly) | Face → prompt; OK → talk/tree | Infinite | Dialogue, quest hints, bark cascades |
| **Furniture** | `TILES.BONFIRE` / `TILES.PILLAR` / `TILES.BREAKABLE` | Face → context-dependent | Varies | Bed rest, mailbox, stash, decorative |

### Key Design Principle

> **Every interaction category has a different tempo.**
>
> - Bookshelves are **slow reads** (multi-page, player-paced).
> - Bar counters are **quick taps** (instant effect, 3-use limit).
> - Vendors are **considered purchases** (menu browse, drag items).
> - NPCs are **conversations** (typewriter text, dialogue choices).
> - Furniture is **one-shot** (rest, check mail, store items).
>
> This tempo variety prevents interiors from feeling monotonous. Each interaction type demands a different mode of player attention, and the mix creates a natural rhythm of fast/slow, active/passive engagement.

---

## 3.5. Interior Windows & Cavity Vignettes

**Status:** Tiles shipped, EmojiMount port in flight (see `LIVING_WINDOWS_ROADMAP.md` §Phase 6). Proxy-zone live views designed, not yet implemented (see `PROXY_ZONE_DESIGN.md`).

Interior windows are the single biggest atmospheric upgrade to the cozy loop since v2.2. They dissolve the "interior is a box" claustrophobia without breaking the Safety Contract. The player can *see* the outside world — the dusk sky, the Promenade lanterns, a silhouette walking past — while time is still frozen for them.

### 3.5.1 Window Tile Family

| Tile | Use | Typical building |
|------|-----|------------------|
| `WINDOW_SHOP` | Tall commercial glass | Coral Bazaar, Dispatcher's Office |
| `WINDOW_BAY` | Residential bay window (deeper cavity) | Driftwood Inn, Gleaner's Home |
| `WINDOW_SLIT` | Thin horizontal — watchtower / basement | Watchman's Post |
| `WINDOW_ALCOVE` | Recessed square — general residential | Home, Guild |
| `WINDOW_COMMERCIAL` | Floor-to-ceiling storefront | Coral Bazaar |
| `WINDOW_ARROWSLIT` | Defensive narrow vertical | Watchman's Post |
| `WINDOW_MURDERHOLE` | Dungeon-scale inspection hatch | Soft Cellar entry, Hero's Wake |

All are freeform-cavity tiles. The raycaster renders the mullion/frame as a solid band, the glass as an alpha-blended pane, and the cavity content (vignette or proxy zone) behind the glass.

### 3.5.2 Cavity Vignette Model (EmojiMount)

Each interior window tile can bind an emoji vignette via EmojiMount (`cavity` anchor mode). Vignettes are composed from the recipe library (`bv-emoji-recipes.js`): `window_shop` (merchandise silhouettes), `window_bay` (curtains + potted plant), etc.

Vignettes render **behind** the glass, are **face-aware** (tinted by the side the player is looking from), and cull aggressively — the emoji never z-fights the mullion or the glass pane.

### 3.5.3 Face-Aware Tint

The glass always paints the *other* side's lighting:

| Player position | Looking at window | Glass tint | Why |
|-----------------|-------------------|-----------|-----|
| Inside building (depth 2) | Inside face → outside world | Cyan / sky | Daylight spilling in |
| Outside building (depth 1) | Outside face → inside world | Amber / lamp | Warm interior glow visible from street |

Tint is driven from `DayCycle` phase; at night the cyan-out becomes deep navy, and the amber-in persists (lamps stay lit).

### 3.5.4 Proxy Zones (Live Exterior Views)

For interior floors where pasted static vignettes aren't enough — the Driftwood Inn facing the Promenade, or a motel room on city floor 4 — the window looks out at a **proxy zone**: a rectangle of parent-floor tiles with the parent's skybox substituted through a `hasOpenSky` ceiling puncture, and fog inherited via `fogProfile: 'parent'`. Designed in `PROXY_ZONE_DESIGN.md`; Driftwood Inn 1.2 is the pilot.

### 3.5.5 Cozy Contract Implications

Windows do **not** break the Safety Contract:
- Time still frozen — the sky visible through an Inn window is a snapshot of the dusk the player left.
- Enemies through a window cannot engage the player — no AI awareness cone crosses the pane (see dependency #5 in `ARCHITECTURAL_SHAPES_ROADMAP.md`).
- Windows *do* carry narrative — seeing a hero march past an Inn window, or a dispatcher's silhouette in Lantern Row, is environmental storytelling with no gameplay cost.

### 3.5.6 Authoring Policy

- Exterior-facing windows on depth-1 (N) → emoji vignettes fine (curated cozy silhouettes).
- Interior-facing windows on depth-2 (N.N) looking out → **no emoji on the N.N face**; reserved for tall commercial glass or proxy zones. (Per 2026-04-07 direction.)
- Interior-facing windows on depth-2 (N.N) looking at another interior room → emoji vignettes fine (e.g., a pass-through into a kitchen).

---

## 4. Bookshelf Interactions (BOOKSHELF tile)

### 4.1 Tile Properties

- **Tile constant**: `TILES.BOOKSHELF` = 25
- **Walkable**: No (wall-like furnishing, blocks movement)
- **Opaque**: Yes (blocks line of sight, like WALL/PILLAR)
- **Interaction verb**: `[OK] Read` 📖
- **Peek type**: Autonomous (appears when player faces the tile, no OK required)

### 4.2 BookshelfPeek Module

`engine/bookshelf-peek.js` (Layer 2) — autonomous peek overlay.

**Behaviour:**
1. Player faces a BOOKSHELF tile for 400ms (debounce).
2. The peek overlay opens: DialogBox shows the book's first page with the title as speaker.
3. Multi-page navigation: `A`/`←` for previous page, `D`/`→` for next page.
4. `Escape` closes the book. Walking away also closes it after 200ms.
5. Pressing `OK` (interact) while the book is open advances to the next page (same as `D`).

**Book Resolution Priority:**
1. **Explicit assignment**: `floorData.books[]` maps `{ x, y, bookId }` to grid positions.
2. **Biome random**: If no explicit assignment, selects a book matching the floor's `biome` field. Uses `(x*7 + y*13) % pool.length` for stable-per-position selection.
3. **Global fallback**: If no biome match, picks any book from the catalog.

### 4.3 Content Categories

| Category | Icon | Purpose | Examples |
|----------|------|---------|----------|
| **tip** | 📘 | Gameplay tips and tutorials | Movement, restocking, cleaning, combat, curfew |
| **lore** | 📜 | World-building and conspiracy drip | Dragon history, the Compact, hero arrival |
| **manual** | 🍺/🗺️ | In-world reference material | Drink menus, vendor directories |
| **notice** | 📋 | Official Guild/Council documents | Work order templates, curfew policy |
| **letter** | ✉️ | Personal correspondence (conspiracy) | Anonymous tips, agency communications |

### 4.4 Conspiracy Drip via Bookshelves

Bookshelves are the primary vehicle for the Dragon Conspiracy's environmental storytelling. The player discovers fragments through:

- **Lore books in the Inn**: History of the Dragon Compact, the first hero party, the nesting caves.
- **Letters in the Home**: Anonymous tips from "A Friend" hinting at hidden agendas.
- **Notices in the Guild**: Official documents with redacted passages and inconsistencies.
- **oneShot bark**: First bookshelf interaction fires a bark with conspiracy flavour (e.g., "ASK ABOUT THE COMPACT").

This is not gated content — it's ambient discovery. The player is never forced to read. But the bookshelves reward curiosity with narrative depth.

---

## 5. Bar Counter Interactions (BAR_COUNTER tile)

### 5.1 Tile Properties

- **Tile constant**: `TILES.BAR_COUNTER` = 26
- **Walkable**: No (half-wall, blocks movement)
- **Opaque**: Yes (blocks line of sight)
- **Interaction verb**: `[OK] Drink` 🍺
- **Peek type**: Autonomous billboard (Toast notification) + interact-to-consume

### 5.2 BarCounterPeek Module

`engine/bar-counter-peek.js` (Layer 2) — autonomous billboard + interact handler.

**Behaviour:**
1. Player faces a BAR_COUNTER tile for 300ms (debounce).
2. A Toast notification shows the available drink with its effect and remaining taps.
3. Pressing `OK` (interact) consumes one tap and applies the effect.
4. After 3 taps, the counter is "empty" until the player re-enters the floor.

**Drink Resolution:**
- Each BAR_COUNTER has a drink determined by `(x*7 + y*13) % menu.length` — stable per position.
- Drink menu is selected by the floor's `biome` field.

### 5.3 Per-Biome Drink Menus

#### Inn (Driftwood Inn — Floor 1.2)
| Emoji | Name | Effect | Amount |
|-------|------|--------|--------|
| ☕ | Boardwalk Brew | +energy | +1 |
| 🍺 | Deep Ale | +speed | +5% (1 floor) |
| 🧃 | Coral Tonic | Cleanse | Clears 1 debuff |

#### Bazaar (Coral Bazaar — Floor 1.1)
| Emoji | Name | Effect | Amount |
|-------|------|--------|--------|
| 🍵 | Spice Tea | +energy | +1 |
| 🧃 | Coral Juice | +heal | +3 HP |
| 🫖 | Warm Brew | +speed | +3% (1 floor) |

#### Guild (Gleaner's Guild — Floor 1.3)
| Emoji | Name | Effect | Amount |
|-------|------|--------|--------|
| ☕ | Black Coffee | +energy | +2 |
| 🥤 | Stim Drink | +speed | +8% (1 floor) |
| 💊 | Guild Remedy | Cleanse | Clears 1 debuff |

#### Home (Gleaner's Home — Floor 1.6)
| Emoji | Name | Effect | Amount |
|-------|------|--------|--------|
| 🥛 | Glass of Water | +energy | +1 |
| 🍲 | Leftover Stew | +heal | +2 HP |

### 5.4 Design Intent — "The Bar Counter as Micro-Bonfire"

The bar counter fills the same emotional niche as a bonfire but with lower stakes and cozy flavour. The bonfire is a survival checkpoint (heal, save, rest). The bar counter is a **comfort checkpoint** — it says "here's something small and nice for stopping by."

The 3-tap limit prevents exploitation while still rewarding the player for visiting interiors. The limit resets on floor re-enter (not per-day), so the player can return to the Inn multiple times in one day and get more drinks — but they have to leave and come back each time. This creates a natural rhythm of dungeon work → building visit → dungeon work.

---

## 5.5. Surface-Mount Family — Tables, Counters, Coffee Tables

**Status:** Design in `LIVING_WINDOWS_ROADMAP.md` §4.9. `BAR_COUNTER` is the surface-mount prototype. `TABLE` is a shipped furniture tile (see home room pair in §6.5) awaiting `surface` EmojiMount binding. `COUNTER` and `COFFEE_TABLE` are queued as new tile IDs in Phase 7.

### 5.5.1 The Surface Principle

A cozy interior is defined as much by what's *on* its furniture as by the furniture itself. A TABLE without a mug, a bookshelf without a book-in-progress, a counter without a bell-and-ledger — these are empty stage flats. The surface-mount family gives every flat-topped piece of furniture an emoji vignette bound to its top plane.

### 5.5.2 Cap Heights (for EmojiMount `surface` anchor)

| Tile | Cap height | Role | Typical scene emoji |
|------|-----------|------|---------------------|
| `COFFEE_TABLE` | 0.30 | Living-room low table | 🫖 kettle, ♠️/♥️/♦️/♣️ cards, 📖 open book |
| `TABLE` | 0.52 | Dining / workshop table | 🍲 bowl, 🕯️ candle, 📜 parchment |
| `COUNTER` | 0.78 | Shop counter / reception | 🔔 service bell, 📒 ledger, ⚖️ scales |
| `BAR_COUNTER` | 0.78 | Drink service (prototype) | 🍺 mug, 🍵 teapot, 🧃 tonic bottle |
| `SHELF` | 1.30 | Wall shelf, high counter end | 📘 stacked books, 🏺 jar cluster |

### 5.5.3 Authoring: Recipe Library vs Per-Coord Override

Two ways to bind scene emoji to a surface:

- **Type mount (global)** — `EmojiMount.register({ tile: TILES.COFFEE_TABLE, recipe: 'coffee_table_home' })` — every COFFEE_TABLE in the world uses the same recipe's emoji pool.
- **Instance mount (per-coord)** — `EmojiMount.registerAt(floorId, x, y, { scene: ['🍵', '📖'] })` — this specific table has exactly these props. Stored in the floor data's `emojiMounts` map, keyed by `"x,y"` (same shape as `doorTargets`, `windowScenes`).

Per-coord wins over type. This is how the Driftwood Inn living-room COFFEE_TABLE gets its specific tea-and-book vignette while the Guild break-room table uses the generic `table_shop` recipe.

### 5.5.4 Surface-Mount as Cozy Storytelling

A TABLE with a half-drunk mug and a closed book reads as "someone was just here." A COUNTER with a bell and an open ledger reads as "service awaits." A COFFEE_TABLE with a card spread reads as "a game is in progress." None of these require new interaction verbs or peek overlays — they are pure visual language. Stardew Valley's NPC homes lean hard on this trick.

### 5.5.5 Interaction Future

For the jam, surface-mount is purely visual. Post-jam, surfaces can host micro-interactions:

- **Card table** (COFFEE_TABLE with card scene) → card sorting minigame (§7.1).
- **Counter with ledger** → work-order review panel (merged with §7.4).
- **Table with bowl** → food refill / cooking pot entry (§7.3).

These dovetail cleanly with §7 cozy minigame stubs; the surface-mount family is the visual stub for all of them.

---

## 6. Per-Building Interaction Inventory

### 6.1 The Approach — Entry Lobby (Floor 0.1)

| Tile | Position | Content |
|------|----------|---------|
| BOOKSHELF | Wall alcove | `tip_movement_basics` — How to move, interact, enter doors |
| — | — | Minimal — this is a tutorial corridor, not a cozy space |

### 6.2 Coral Bazaar (Floor 1.1)

| Tile | Position | Content |
|------|----------|---------|
| SHOP × 3 | Stall positions | One per faction (Tide/Ember/Root) — vendor NPCs |
| BOOKSHELF × 2 | Back wall | `manual_bazaar_guide` (vendor directory), `notice_work_order_template` |
| BAR_COUNTER × 1 | Side stall | Spice Tea / Coral Juice / Warm Brew (bazaar menu) |
| NPC × 2 | Patrolling | Market patrons (ambient barks: `interior.bazaar`) |

### 6.3 Driftwood Inn (Floor 1.2)

| Tile | Position | Content |
|------|----------|---------|
| BAR_COUNTER × 2 | Bar area | Boardwalk Brew / Deep Ale / Coral Tonic (inn menu) |
| BOOKSHELF × 3 | Reading nook | `lore_dragon_history_1`, `lore_dragon_history_2`, `lore_hero_arrival` |
| BONFIRE × 1 | Fireplace | Nap-tier rest checkpoint (3h nap, clear TIRED, NO WELL_RESTED). See `BONFIRE_POLISH_STEPS.md` §11. |
| NPC × 3 | Innkeeper + 2 guests | Innkeeper (interactive), guests (ambient barks: `interior.inn`) |

**The Inn is the lore hub.** Its bookshelves carry the Dragon Conspiracy backstory. Players who linger here learn about the Compact, the hero party's arrival, and the dragons' true nature — all before they ever encounter a dragon NPC in the dungeon.

### 6.4 Gleaner's Guild (Floor 1.3)

| Tile | Position | Content |
|------|----------|---------|
| BOOKSHELF × 4 | Walls | `tip_crate_restock`, `tip_cleaning`, `tip_combat`, `tip_time_pressure` |
| BAR_COUNTER × 1 | Break room | Black Coffee / Stim Drink / Guild Remedy (guild menu) |
| SHOP × 1 | Equipment desk | Guild shop (tools, cleaning supplies) |
| NPC × 3 | Guild Clerk + 2 guildmates | Clerk (interactive, dialogue tree), mates (ambient: `interior.guild`) |
| PILLAR × 1 | Job board | Future: `job-board-peek.js` (work orders, readiness targets) |

**The Guild is the tip hub.** Every bookshelf contains a gameplay manual. New players who explore the Guild before heading to the dungeon will have learned movement, restocking, cleaning, and combat. This is environmental tutorialisation — no forced tutorial sequence, just books on shelves.

### 6.5 Gleaner's Home (Floor 1.6) ✅ Implemented (24×20 multi-room)

| Tile | Position | Content | Status |
|------|----------|---------|--------|
| BED × 2 | (2,3) + (3,3) | Bedroom — sleep/advance day via `bed-peek.js` | ✅ |
| PILLAR | (19, 6) | Mailbox history — hero run reports via `mailbox-peek.js` | ✅ |
| CHEST | (19, 3) | Work keys stash (Day 1 only — reverts to EMPTY after pickup) | ✅ |
| HEARTH | (11, 7) | Decorative fireplace in living room | ✅ |
| TABLE × 2 | (11,5) + (12,5) | Living room table pair | ✅ |
| TABLE × 1 | (4, 7) | Nightstand in bedroom | ✅ |
| BOOKSHELF × 7 | (1,1), (9,2), (14,2), (21,1), (20,8), (9,15), (14,15) | Personal fiction, work schedule, guild lore, dragon history, adventure novel, shopping guide, ghost story | ✅ |

> **Note:** The home grid was expanded from the spec's 10×8 to 24×20 — a multi-room dwelling with bedroom (west), living room (center), storage (east), and entry hall (south). See Tutorial_world_roadmap.md §5.6 for full layout. The exterior mailbox is TILES.MAILBOX (37) on Floor 1 at (33,8), scanned by `_findMailboxTile()`.

**Home is the emotional anchor.** The bookshelves and hearth are small comforts — the player's own space, with personal items. The anonymous letter on the bedroom shelf is the first direct conspiracy hook. The multi-room layout rewards exploration with 7 distinct books.

### 6.6 Watchman's Post (Floor 2.2) — Planned

| Tile | Position | Content |
|------|----------|---------|
| BOOKSHELF × 1 | Desk | Duty rosters, patrol routes, incident reports |
| NPC × 2 | Watchman (interactive), sleeping guard (ambient) | `interior.watchpost` barks |

---

## 7. Cozy Minigame Stubs (Post-Jam Roadmap)

These are not implemented for the jam. They are documented here as post-jam polish targets that extend the cozy interior loop.

### 7.1 Card Sorting Table

**Location:** Gleaner's Guild break room (Floor 1.3).
**Tile:** Dedicated `TILES.CARD_TABLE` or repurposed BREAKABLE.
**Interaction:** Opens a sorting minigame — the player arranges found cards by suit or power. Sorted cards get a tiny stat bonus (+1 to their next play).

**Design intent:** Stardew Valley's museum collection meets Solitaire. The player is rewarded for taking time to organise their deck — a pure cozy activity with a minor mechanical payoff.

### 7.2 Trophy Shelf

**Location:** Gleaner's Home (Floor 1.6).
**Tile:** BOOKSHELF or dedicated trophy tile.
**Interaction:** Displays the player's achievements (floors cleaned at 100%, hero cycles survived, rare cards found). Each trophy is an emoji on a shelf. Filling the shelf gives cumulative bonuses.

**Design intent:** A visual progress tracker that doubles as decoration. The player sees their history every time they wake up.

### 7.3 Cooking Pot

**Location:** Driftwood Inn kitchen area.
**Tile:** BAR_COUNTER variant or BONFIRE variant.
**Interaction:** Combine food items into meals with better stat effects than raw ingredients. Simple 2-ingredient recipes. Results shown in a recipe book (bookshelf-peek variant).

**Design intent:** Breath of the Wild cooking meets Animal Crossing recipes. Rewards food hoarding (which the loot system already provides) with meaningful crafting.

### 7.4 Notice Board Puzzle

**Location:** Gleaner's Guild (Floor 1.3).
**Tile:** PILLAR with job-board-peek overlay.
**Interaction:** Arrange work orders by priority (readiness percentage, hero-day proximity, coin payout). Optimal arrangement grants a planning bonus (+5% coins for the day).

**Design intent:** A light planning puzzle that makes the "what should I do today?" decision feel active rather than passive. The player becomes a project manager for their own dungeon runs.

### 7.5 Music Box

**Location:** Gleaner's Home (Floor 1.6).
**Tile:** BREAKABLE or dedicated prop.
**Interaction:** Plays a short ambient melody. Each melody has a subtle stat modifier (calm = +energy regen, energetic = +speed). Collectible vinyl records found in dungeons expand the playlist.

**Design intent:** Pure vibes. The music box is the ultimate cozy prop — it has no real purpose except to make the player smile.

---

## 8. Book & Document Data Schema

### 8.1 File Location

`data/books.json` — loaded synchronously at `BookshelfPeek.init()`.

### 8.2 Schema

```json
{
  "meta": {
    "version": 1,
    "description": "Book and document data for bookshelf peek interactions."
  },
  "books": [
    {
      "id": "string — unique stable identifier (snake_case)",
      "title": "string — display title shown at top of peek overlay",
      "icon": "string — emoji shown in peek header (📘📜📋✉️🍺🗺️)",
      "category": "string — 'tip' | 'lore' | 'manual' | 'letter' | 'notice'",
      "pages": ["array of strings — each string is one page of text"],
      "biome": "string — building biome this book belongs to (guild/inn/bazaar/home)"
    }
  ]
}
```

### 8.3 Current Catalog (13 Books)

| ID | Category | Biome | Pages | Purpose |
|----|----------|-------|-------|---------|
| `tip_movement_basics` | tip | guild | 2 | WASD controls, bumping, doors |
| `tip_crate_restock` | tip | guild | 2 | Crate slot-filling tutorial |
| `tip_cleaning` | tip | guild | 2 | Grime sweeping tutorial |
| `tip_combat` | tip | guild | 3 | Card combat RPS system |
| `tip_time_pressure` | tip | guild | 3 | Day cycle, curfew, time-freeze rule |
| `lore_dragon_history_1` | lore | inn | 3 | Dragon arrival, first settlers, the deal |
| `lore_dragon_history_2` | lore | inn | 3 | The Compact explained, Guild founding |
| `lore_hero_arrival` | lore | inn | 3 | Hero party arrives, first dragon death |
| `notice_work_order_template` | notice | guild | 3 | Work order form (blank template) |
| `notice_curfew_policy` | notice | guild | 3 | Curfew rules from the Council |
| `letter_anonymous_tip` | letter | home | 3 | Conspiracy hook — "who hired the heroes?" |
| `manual_bar_drinks` | manual | inn | 2 | Drink menu with effects |
| `manual_bazaar_guide` | manual | bazaar | 3 | Vendor faction directory |

### 8.4 Adding New Books

Add entries to `data/books.json`. No code changes needed — BookshelfPeek reads the catalog at init. Assign specific books to grid positions via `floorData.books[]`:

```javascript
// In floor-manager.js floor data definition:
books: [
  { x: 3, y: 1, bookId: 'lore_dragon_history_1' },
  { x: 5, y: 1, bookId: 'lore_dragon_history_2' }
]
```

If no explicit assignment exists, BookshelfPeek selects a biome-appropriate book using a position-seeded index (stable per shelf, no randomness between visits).

---

## 9. Peek Overlay Module Specs

### 9.1 BookshelfPeek (`engine/bookshelf-peek.js`)

| Property | Value |
|----------|-------|
| **Layer** | 2 (rendering + UI) |
| **Type** | Autonomous peek (runs in update loop, not triggered by _interact) |
| **Dependencies** | TILES, Player, MovementController, FloorManager, DialogBox, AudioSystem |
| **Show delay** | 400ms debounce |
| **Hide delay** | 200ms after looking away |
| **Rendering** | Uses DialogBox.show() with `instant: true, priority: 2` |
| **Navigation** | A/← prev page, D/→ next page, Escape close |
| **SFX** | `page-turn` on open and page change |

**Public API:**

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init()` | → void | Load `data/books.json` catalog |
| `update(dt)` | (number) → void | Per-frame facing tile check + debounce |
| `handleKey(key)` | (string) → boolean | Page navigation + close; returns true if consumed |
| `isActive()` | → boolean | Is a book currently displayed? |
| `getBook()` | → object\|null | Current book data |
| `getPage()` | → number | Current page index |

### 9.2 BarCounterPeek (`engine/bar-counter-peek.js`)

| Property | Value |
|----------|-------|
| **Layer** | 2 (rendering + UI) |
| **Type** | Autonomous billboard + interact handler |
| **Dependencies** | TILES, Player, MovementController, FloorManager, Toast, AudioSystem |
| **Show delay** | 300ms debounce |
| **Hide delay** | 200ms after looking away |
| **Rendering** | Uses Toast.show() for billboard |
| **Consume** | Via `tryDrink(fx, fy, floorData)` called from Game._interact() |
| **SFX** | `pickup-success` on drink, `ui-blop` on empty |

**Public API:**

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init()` | → void | Initialise |
| `update(dt)` | (number) → void | Per-frame facing tile check + debounce |
| `tryDrink(fx, fy, floorData)` | (number, number, object) → boolean | Consume a tap; returns true if successful |
| `isActive()` | → boolean | Is billboard currently displayed? |
| `getDrink()` | → object\|null | Current drink data |
| `resetTaps()` | → void | Clear all tap counts (called on floor re-enter) |
| `DRINK_MENUS` | Object | Exposed for testing/debug |

---

## 10. Juice — Making Interiors Feel Like Home

### 10.1 Time-Freeze Juice

| Moment | Juice |
|--------|-------|
| **Enter building** | Door-creak SFX transitions to warm ambient hum. HUD clock shows ❄️ pause icon. Brief toast: "Time holds still here." (oneShot, first interior visit only) |
| **Exit building** | Clock digits pulse amber for 1s to signal resumption. Exterior ambient sounds fade back in. If dusk, the sky has noticeably darkened — the player *sees* that time passed on the outside. |
| **Long stay** | After 60s inside, a gentle ambient bark fires: "No rush. The dungeons will wait." This is a design signal telling the player: you're really safe here. |

### 10.2 Bookshelf Juice

| Moment | Juice |
|--------|-------|
| **Face bookshelf** | Subtle warm glow on the wall column. `page-turn` SFX. |
| **Read first page** | DialogBox fades in with the book's icon + title. Page counter at bottom. |
| **Turn page** | `page-turn` SFX. Text appears instantly (no typewriter — books are not dialogue). |
| **Close book** | DialogBox fades out. Brief bark fires from `interior.bookshelf.<biome>`. |
| **Conspiracy lore** | oneShot bark after reading a lore book: "Something about that passage felt... important." Subtle, unrepeatable signal that the player found story content. |

### 10.3 Bar Counter Juice

| Moment | Juice |
|--------|-------|
| **Face counter** | Toast billboard shows drink + effect + remaining taps. Ambient glass-clink SFX. |
| **Drink** | `pickup-success` SFX + larger Toast with drink emoji and effect description. Brief screen-edge warmth (subtle amber vignette, 0.3s). |
| **Last drink** | "That's the last one" bark. Counter billboard shows "Empty!" |
| **Return visit** | Taps reset. Billboard shows full count again. Bartender bark: "Refills on the house." |

### 10.4 Building Ambient Juice

| Element | Description |
|---------|-------------|
| **Warm fog** | Interior fog is warm-toned (amber/brown). Dungeons have cold fog (blue/grey). The contrast is immediate on entry. |
| **Ambient audio** | Interiors: soft wind, distant clinking, muffled footsteps. Exteriors: seagulls, market bustle. Dungeons: drips, echoes. |
| **NPC presence** | Every interior has at least 2 NPCs (ambient patrollers). They bark about the building's function. The player is never alone in a safe space. |
| **Lighting** | Interiors are uniformly lit (no dark corners). Dungeons have light sources and shadows. The flatness of interior lighting signals safety. |

---

## 11. Implementation Status & Roadmap

### ✅ Implemented (Phase A.0)

| Item | File | Status |
|------|------|--------|
| `TILES.BOOKSHELF` (25), `TILES.BAR_COUNTER` (26) | `engine/tiles.js` | ✅ |
| `[OK] Read` / `[OK] Drink` interaction verbs | `engine/interact-prompt.js` | ✅ |
| `BookshelfPeek` — autonomous book peek overlay | `engine/bookshelf-peek.js` | ✅ |
| `BarCounterPeek` — tap-to-drink peek + interact | `engine/bar-counter-peek.js` | ✅ |
| `data/books.json` — 13 books (tips, lore, notices, letters, manuals) | `data/books.json` | ✅ |
| Bookshelf bark pools (guild/inn/bazaar/home) | `data/barks/en.js` | ✅ |
| Bar counter bark pools (inn/guild/bazaar) | `data/barks/en.js` | ✅ |
| Peek init + update wiring in Game | `engine/game.js` | ✅ |
| BOOKSHELF + BAR_COUNTER interact dispatch in Game | `engine/game.js` | ✅ |
| ESC intercept for BookshelfPeek | `engine/game.js` | ✅ |
| Script tags in index.html | `index.html` | ✅ |

### ✅ Implemented (Phase B — Day Cycle + Home Interactions)

| Item | File | Status |
|------|------|--------|
| `engine/day-cycle.js` — 8-phase world clock + `setPaused(bool)` | `engine/day-cycle.js` | ✅ |
| Time-freeze wiring in `_onFloorArrive()` | `engine/game.js` | ✅ |
| `bed-peek.js` — sleep verb, day advance | `engine/bed-peek.js` | ✅ |
| `mailbox-peek.js` — hero run reports, parchment UI, history | `engine/mailbox-peek.js` | ✅ |
| `mailbox-sprites.js` — mailbox emoji states (📫/📬/📪) | `engine/mailbox-sprites.js` | ✅ |
| BOOKSHELF auto-placement in proc-gen interiors | `engine/floor-manager.js` `_placeBookshelvesInInterior()` | ✅ |
| Per-biome book presets (inn, guild, watchpost, dungeon, bazaar, cellar_entry, office, home) | `engine/floor-manager.js` | ✅ |
| `floorData.books[]` explicit assignments for Floor 1.1 (3 books) and 1.6 (7 books) | `engine/floor-manager.js` | ✅ |
| `engine/dungeon-schedule.js` — per-group hero day state machine | `engine/dungeon-schedule.js` | ✅ |
| `engine/hero-run.js` — hero run simulation per-group | `engine/hero-run.js` | ✅ |
| `engine/morning-report.js` — dawn Toast sequence | `engine/morning-report.js` | ✅ |
| TILES.MAILBOX (37) — exterior mailbox tile on Floor 1 | `engine/tiles.js` | ✅ |

### 🟡 Phase C — Interior Polish (Remaining)

| Item | File | Est. | Depends On |
|------|------|------|------------|
| HUD clock widget (snowflake icon for freeze) | `engine/hud.js` | 30m | day-cycle.js ✅ |
| `job-board-peek.js` — work order display | New | 1.5h | day-cycle.js ✅ |
| `taskmaster-peek.js` — hero dispatch registry | New | 1.5h | hero-system.js |
| Interior ambient audio (warm hum, muffled steps) | `data/audio-manifest.json` | 30m | — |
| Bookshelf wall texture in TextureAtlas | `engine/texture-atlas.js` | 30m | — |
| Bar counter half-wall texture in TextureAtlas | `engine/texture-atlas.js` | 30m | — |

### 🟣 Post-Jam — Cozy Minigames

| Item | Est. | Priority |
|------|------|----------|
| Card sorting table minigame | 3h | Low |
| Trophy shelf display | 2h | Medium |
| Cooking pot + recipe system | 4h | Low |
| Notice board puzzle | 2h | Low |
| Music box + vinyl collection | 2h | Low |

---

## 12. Cross-References

### 12.1 Design Docs (cozy & interior-adjacent)

| Doc | Why it's relevant to cozy interiors |
|-----|-------------------------------------|
| `LIVING_WINDOWS_ROADMAP.md` | Window tile family, EmojiMount port, surface-mount tiles (TABLE/COUNTER/COFFEE_TABLE), blockout authoring, patrons, hours. Direct feed for §3.5 and §5.5. |
| `PROXY_ZONE_DESIGN.md` | Interior windows looking out at live parent-floor exterior scenes. Pilot is Driftwood Inn 1.2 → Promenade. Direct feed for §3.5.4. |
| `ARCHITECTURAL_SHAPES_ROADMAP.md` | Living-architecture primitives (PERGOLA, PERGOLA_BEAM, CANOPY, FENCE, window family). Tile predicates reference. Dependencies for open-building NPC flow. |
| `NPC_SYSTEM_ROADMAP.md` | Shipped NPC v1 — bark pools, awareness cones, patrols. Backs §10.4's "NPC presence" promise. |
| `VERB_FIELD_NPC_ROADMAP.md` | Verb-field NPC behaviors — the shuffle-through-pergola pathing that makes interiors feel inhabited from outside. |
| `LIVING_INFRASTRUCTURE_BLOCKOUT.md` | Blockout of living-infrastructure tiles on floors 1–3 — locates where cozy furniture and NPC patrol paths overlap. |
| `D3_AI_LIVING_INFRA_PROCGEN_AUDIT_ROADMAP.md` | Dungeon-3 audit; relevant because interior→dungeon transitions are where the Safety Contract flips off. |
| `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` | Faction structure + NPC roster driving bookshelf lore content. |
| `ACT2_NARRATIVE_OUTLINE.md` §5.4 | Housing Reassignment — HomeBnB → field quarters downgrade uses interior feature tiers. |
| `Tutorial_world_roadmap.md` | World graph + floor registry; source of truth for floor IDs referenced in §6. |
| `SEAWAY_FLOOR_DESIGN.md` | Sealab biome — porthole animated texture pattern is the historical ancestor of EmojiMount cavity vignettes. |
| `HERO_FOYER_ENCOUNTER.md` | The hero's-mess interior encounter; directly plays against the Safety Contract (§1) as a deliberate one-time breach. |
| `COMBAT_DRAG_SYSTEM.md` | Card-combat input — relevant to §7.1 card sorting minigame (reuses drag affordances). |
| `INVENTORY_CARD_MENU_REWORK.md`, `INVENTORY_SYSTEM_AUDIT_AND_ROADMAP.md`, `UNIFIED_INVENTORY_METADATA_CONTRACT.md` | Inventory surface; bar-counter drinks and bookshelf oneShots interact with card metadata + card fan. |
| `SHOP_REFRESH_ECONOMY.md` | Coral Bazaar vendor loop; the shop-interior interplay is part of the cozy contract. |
| `CRATEUI_INTERACTION_OVERHAUL.md`, `UNIFIED_RESTOCK_SURFACE_ROADMAP.md`, `CHEST_RESTOCK_AND_WORK_ORDERS.md` | Surface-mount family (§5.5) adjacency — chests and counters use the same EmojiMount `surface` anchor. |
| `LIGHT_AND_TORCH_ROADMAP.md` | Interior lighting is currently "uniformly lit"; this doc defines how that softens post-jam (candle flicker, bonfire glow). Pairs with §10.4 Ambient juice. |
| `AUDIO_ENGINE.md`, `SPATIAL_AUDIO_BARK_ROADMAP.md` | Interior ambient audio (§10.4) and bark pool pipeline (§4.4, §10.2). |
| `VERB_FIELD_NPC_ROADMAP.md` | Shuffle-through behaviors for interior NPCs (innkeeper patrolling, guildmates walking). |
| `MENU_INTERACTIONS_CATALOG.md`, `B5_INVENTORY_INTERACTION_DESIGN.md`, `B6_SLOT_WHEEL_AND_TRANSACTION_LAYOUT.md` | Verbs catalogued for interior interactions; §3 taxonomy pulls from here. |
| `TOOLTIP_BARK_ROADMAP.md`, `EYESONLYS_TOOLTIP_SPACE_CANON.md` | Interior bark pools + tooltip spacing for peek overlays. |
| `CORE_GAME_LOOP_AND_JUICE.md` | Source of the broader juice inventory §10 expands on. |
| `VISUAL_OVERHAUL.md`, `SKYBOX_ROADMAP.md` | Window-tint day/night driver (DayCycle + skybox) — §3.5.3 depends on both. |
| `FATIGUE_SYSTEM_ROADMAP.md` | Rest + bed-peek; the cozy contract's mechanical payoff (clearing TIRED). |
| `PEEK_SYSTEM_ROADMAP.md`, `PEEK_WORKBENCH_SCOPE.md` | Peek overlay architecture — §9 module specs inherit from here. |

### 12.2 Implementation References

| This Section | Implementation / Data |
|--------------|-----------------------|
| §2 Time-Freeze | `engine/day-cycle.js` (`setPaused()`), wired in `Game._onFloorArrive()` |
| §3.5 Windows | `engine/tiles.js` (WINDOW_*), `engine/spatial-contract.js` (freeform config), `engine/raycaster-sprites.js` (cavity vignettes) |
| §4 Bookshelf | `engine/bookshelf-peek.js`, `data/books.json` |
| §5 Bar Counter | `engine/bar-counter-peek.js` |
| §5.5 Surface-Mount | Planned: `engine/emoji-mount.js`, `tools/bv-emoji-recipes.js`, `emojiMounts` map in floor data |
| §6 Building Inventory | `engine/floor-manager.js` floor data, `_placeBookshelvesInInterior()` |
| §8 Book Schema | `data/books.json` |
| §9 Peek Specs | `engine/bookshelf-peek.js`, `engine/bar-counter-peek.js`, `engine/bed-peek.js`, `engine/mailbox-peek.js` |

### 12.3 Historical / Archive

| Doc | Relationship |
|-----|-------------|
| `Archive/BONFIRE_BRAINSTORMING.md` | Bonfire-as-checkpoint reasoning; §5.4 (bar counter as micro-bonfire) inherits from here. |
| `Archive/LIVING_INFRASTRUCTURE_BRAINSTORM.md` | Original living-infrastructure thinking; superseded by `LIVING_INFRASTRUCTURE_BLOCKOUT.md` and `NPC_SYSTEM_ROADMAP.md`. |

# Tutorial World Roadmap
## Dungeon Gleaner — DC Jam 2026
### Version 2.2 — April 2, 2026

World Graph Design · Initial Player Experience · Hero Reveal · Scavenger Economy · Floor ID Architecture

> **v2.1 changes:** Corrected playflow from v2.0. Dispatcher force-turn moved to Floor 1→2 gate (was at dungeon entrance). Floor 2.1 is now the Dispatcher's Office (employer's interior), not the Watchman's Post. Floor 2 expanded to a full commercial district ("more shops, more barks"). Dungeon building entrance split to Floor 2.2 (was 2.1). Soft dungeon given proper intermediate building floor (1.3 → 1.3.1, was direct 1.1.1). Hero's Wake renumbered to 2.2.1/2.2.2 (was 2.1.1/2.1.2).
>
> **v2.2 changes:** Updated floor dimensions and grid diagrams to match actual implementation in floor-manager.js. Floor 1 was recorded as 40×30 (was 24×20 in spec). **v2.3 (Apr 4 2026):** Floor 1 corrected again to 50×36 six-pod layout — the 40×30 figure was itself stale. All door coordinates, gate positions, and §5.2 layout zones updated to match live floor-manager.js `_FLOOR1_GRID`. Floor 1.1 is 16×12 with bookshelves, bonfire, and STAIRS_DN to Coral Cellars (was 12×10 shop-only). Floor 1.6 is 24×20 multi-room dwelling (was 10×8 single room). Mailbox on Floor 1 exterior uses TILES.MAILBOX (37), not PILLAR. Implementation status updated: hand-authored floors are 0, 1, 1.1, 1.6; all other floors proc-gen via GridGen + SpatialContract. Gleaner loop systems (cleaning, restocking, torch, cobweb, readiness, work orders, day cycle, dungeon schedule, hero runs, morning report) all implemented. Peek modules live: bookshelf-peek, bar-counter-peek, bed-peek, mailbox-peek, crate-peek, corpse-peek, torch-peek, chest-peek, locked-door-peek, merchant-peek, monologue-peek, puzzle-peek, door-peek.

---

## 1. Overview

The tutorial world teaches the game through a scripted 20-minute first playthrough that establishes the player as a blue-collar dungeon janitor, not a hero. The world is a multi-floor exterior district where NPCs bark context, shops sell supplies, and dungeons provide the scavenging grounds.

The playflow is linear on first pass (Floor 0 → 1 → gate encounter → 1.6 → back to gate → 2 → 2.1 → 2.2 → 2.2.1) but opens into a three-dungeon scavenge loop once the player reaches the pivot point in Floor 2.2.1 (the Hero reveal). From there, the player can freely grind any of the three dungeon chains (1.3.1, 2.2.1, or 3.1.1) to earn currency, buy cards, and improve their combat and restocking capabilities.

### Design Pillars

1. **NPC barks are the tutorial.** The player who reads barks understands the world. The player who ignores barks walks into the soft dungeon on Floor 1 and learns the hard way.
2. **Every door has a narrative reason.** No door exists just because the map needs one. The Dispatcher force-turn teaches key-fetching. The unlocked dungeon entrance teaches that the world has its own agenda.
3. **The Hero is a presence before a threat.** The player sees the Hero's back before they ever fight. The Hero is mythic, destructive, and indifferent to the player.
4. **Scavenging IS the game.** Combat is a tool for survival, not the goal. Currency comes from restocking crates and looting corpses. Cards come from shops and seal rewards. The player earns their power through labor.
5. **Safe exteriors, dangerous dungeons.** Depth 1-2 floors are non-lethal (bonfire respawn + penalties). Depth 3+ is where risk lives.

---

## 2. World Graph

```
                    ┌──────────────────────────────────────┐
                    │           FLOOR 0 ("0")               │
                    │        The Approach (exterior)         │
                    │   Courtyard · Bonfire · NPC barks      │
                    │                                        │
                    │   Auto-walk → DOOR → Floor 1           │
                    └─────────────────┬────────────────────┘
                                      │
                    ┌─────────────────▼────────────────────┐
                    │           FLOOR 1 ("1")               │
                    │      The Promenade (exterior)         │
                    │   Town boardwalk · Shops · Home        │
                    │   NPC barks (ambient morning/evening)  │
                    │                                        │
                    │   Contains:                            │
                    │     DOOR → 1.1 (Coral Bazaar, shop)    │
                    │     DOOR → 1.2 (Driftwood Inn)         │
                    │     DOOR → 1.3 (Soft dungeon bldg)     │
                    │     DOOR → 1.6 (Gleaner's Home)        │
                    │     GATE → Floor 2 (Dispatcher blocks)  │
                    └──┬─────┬──────┬──────┬───────┬───────┘
                       │     │      │      │       │
              ┌────────▼┐ ┌─▼────┐ ┌▼─────┐│  ┌───▼──────────┐
              │ 1.1     │ │ 1.2  │ │ 1.3  ││  │  FLOOR 2 ("2")│
              │ Coral   │ │Drift-│ │Soft  ││  │ Lantern Row   │
              │ Bazaar  │ │wood  │ │Dngn  ││  │ (exterior)    │
              │ (shop)  │ │Inn   │ │Bldg  ││  │ More shops,   │
              │ depth 2 │ │dep 2 │ │dep 2 ││  │ more barks    │
              └─────────┘ └──────┘ └──┬───┘│  │               │
                                      │    │  │ DOOR → 2.1    │
                  ┌───────────────────▼┐   │  │ (Dispatcher's │
                  │ FLOOR 1.3.1        │   │  │  Office)      │
                  │ Soft Mini-Dungeon  │   │  │               │
                  │ (depth 3, proc-gen)│   │  │ DOOR → 2.2    │
                  │ For players who    │   │  │ (dungeon bldg,│
                  │ ignore barks.      │   │  │  NOT locked!) │
                  │ Easy enemies,      │   │  └──┬─────┬──────┘
                  │ basic loot.        │   │     │     │
                  └────────────────────┘   │  ┌──▼───┐ │
                                           │  │ 2.1  │ │
                      ┌────────────────────▼┐ │Dis-  │ │
                      │ 1.6 Gleaner's Home  │ │patch-│ │
                      │ (depth 2, interior) │ │er's  │ │
                      │ Keyring pickup +    │ │Office│ │
                      │ Hero foreshadow     │ │dep 2 │ │
                      └─────────────────────┘ └──────┘ │
                                                       │
                                              ┌────────▼──────┐
                                              │ 2.2           │
                                              │ Watchman's    │
                                              │ Post (dep 2)  │
                                              │ Shaken NPC:   │
                                              │ "heroes are   │
                                              │ inside"       │
                                              │ STAIRS_DN ↓   │
                                              └───────┬───────┘
                                                      │
                                              ┌───────▼───────┐
                                              │ FLOOR 2.2.1   │
                                              │ Hero's Wake   │
                                              │ (B1, depth 3) │
                                              │               │
                                              │ HERO REVEAL:  │
                                              │ Hero's back   │
                                              │ visible.      │
                                              │ High-level    │
                                              │ corpses.      │
                                              │ 1 unbeatable  │
                                              │ living enemy. │
                                              │ SCAVENGER     │
                                              │ ROLE BEGINS.  │
                                              └───────┬───────┘
                                                      │
                                              ┌───────▼───────┐
                                              │ FLOOR 2.2.2   │
                                              │ Hero's Wake   │
                                              │ (B2, depth 3) │
                                              │ Deeper        │
                                              │ scavenge.     │
                                              └───────────────┘

Future:
  Floor 3 ("3") → 3.1 (building) → 3.1.1+ (dungeon chain)
  Floor 4+ (post-jam)
```

---

## 3. Floor Registry

### 3.1 Floor Table

| Floor ID | Depth | Type | Biome | Grid | Authored | Label | Purpose | Status |
|----------|-------|------|-------|------|----------|-------|---------|--------|
| `"0"` | 1 | exterior | approach | 20×16 | hand | The Approach | Tutorial auto-walk, first NPC barks | ✅ |
| `"1"` | 1 | exterior | promenade | 50×36 | hand | The Promenade | Hub town — six-pod layout, shops, home, dungeon access | ✅ |
| `"1.1"` | 2 | interior | bazaar | 16×12 | hand | Coral Bazaar | Card shop, bookshelves, bonfire, stairs to cellars | ✅ |
| `"1.2"` | 2 | interior | inn | SpatialContract | proc-gen | Driftwood Inn | Bonfire: overheal + replenish | proc-gen ✅ |
| `"1.3"` | 2 | interior | cellar-entry | SpatialContract | proc-gen | Cellar Entrance | Soft dungeon building, leads to 1.3.1 | proc-gen ✅ |
| `"1.6"` | 2 | interior | home | 24×20 | hand | Gleaner's Home | Multi-room dwelling: bedroom, living room, storage, entry hall | ✅ |
| `"1.3.1"` | 3 | dungeon | cellar | SpatialContract | proc-gen | Soft Cellar | Tutorial trap — sidequests, easy enemies | proc-gen ✅ |
| `"2"` | 1 | exterior | lantern | SpatialContract | proc-gen | Lantern Row | Commercial district — more shops, more barks, dungeon building | proc-gen ✅ |
| `"2.1"` | 2 | interior | guild | SpatialContract | proc-gen | Dispatcher's Office | Employer's interior, briefing, mission assignment | proc-gen ✅ |
| `"2.2"` | 2 | interior | watchpost | SpatialContract | proc-gen | Watchman's Post | Dungeon staging — shaken NPC, stairs down | proc-gen ✅ |
| `"2.2.1"` | 3 | dungeon | ruin | SpatialContract | proc-gen | Hero's Wake (B1) | Hero reveal, high-level corpses, unbeatable enemy | proc-gen ✅ |
| `"2.2.2"` | 3 | dungeon | ruin | SpatialContract | proc-gen | Hero's Wake (B2) | Deeper scavenge floor | proc-gen ✅ |
| `"3"` | 1 | exterior | frontier | SpatialContract | proc-gen | Frontier Gate | Future: third exterior zone | proc-gen ✅ |
| `"3.1"` | 2 | interior | armory | SpatialContract | proc-gen | Armory | Future: third building + dungeon access | proc-gen ✅ |
| `"3.1.1"` | 3 | dungeon | deep | SpatialContract | proc-gen | Deep Vaults (B1) | Future: third dungeon chain | proc-gen ✅ |

> **Implementation note:** Only floors "0", "1", "1.1", and "1.6" have hand-authored grids in floor-manager.js. All other floors are generated by GridGen using SpatialContract dimensions per biome. Proc-gen floors get bookshelves auto-placed via `_placeBookshelvesInInterior()` with biome-appropriate book presets.

### 3.2 Connection Table

| From | Exit Tile | Direction | To | Gate? | Notes |
|------|-----------|-----------|-----|-------|-------|
| `"0"` | DOOR | advance | `"1"` | — | Auto-walk target |
| `"1"` | DOOR_EXIT (2,17)+(2,18) | retreat | `"0"` | — | West gate — back to The Approach |
| `"1"` | DOOR (10,8) | advance | `"1.1"` | — | Coral Bazaar (NW pod) |
| `"1"` | DOOR (22,8) | advance | `"1.2"` | — | Driftwood Inn (NC pod) |
| `"1"` | DOOR (10,27) | advance | `"1.3"` | — | Storm Shelter / Cellar Entrance (SW pod) |
| `"1"` | DOOR (22,27) | advance | `"1.6"` | — | Gleaner's Home (SC pod) |
| `"1"` | GATE (48,17)+(48,18) | advance | `"2"` | Dispatcher force-turn | East gate — Dispatcher blocks until keyring fetch |
| `"1.1"` | DOOR_EXIT (7,10) | retreat | `"1"` | — | Back to Promenade |
| `"1.1"` | STAIRS_DN (7,4) | advance | — | — | Down to Coral Cellars (depth 3) |
| `"1.2"` | DOOR_EXIT | retreat | `"1"` | — | Back to Promenade (proc-gen) |
| `"1.3"` | DOOR_EXIT | retreat | `"1"` | — | Back to Promenade (proc-gen) |
| `"1.3"` | STAIRS_DN | advance | `"1.3.1"` | — | Down to soft dungeon |
| `"1.3.1"` | STAIRS_UP | retreat | `"1.3"` | — | Back to building |
| `"1.6"` | DOOR_EXIT (11,19) | retreat | `"1"` | — | Back to Promenade |
| `"2"` | DOOR_BACK | retreat | `"1"` | — | Back through gate |
| `"2"` | DOOR | advance | `"2.1"` | — | Dispatcher's Office |
| `"2"` | DOOR | advance | `"2.2"` | NOT locked (subversion) | Dungeon building — Dispatcher SAID it was locked, but it isn't |
| `"2.1"` | DOOR_EXIT | retreat | `"2"` | — | Back to Lantern Row |
| `"2.2"` | DOOR_EXIT | retreat | `"2"` | — | Back to Lantern Row |
| `"2.2"` | STAIRS_DN | advance | `"2.2.1"` | — | Down to dungeon |
| `"2.2.1"` | STAIRS_UP | retreat | `"2.2"` | — | Back to Watchman's Post |
| `"2.2.1"` | STAIRS_DN | advance | `"2.2.2"` | — | Deeper dungeon |

---

## 4. The Initial Player Experience (Jam-Ready Playflow)

This is the scripted first 20 minutes. Every beat is intentional.

### Act 0 — Character Creation

Title screen → callsign selection → operative class selection (Blade/Ranger/Shadow/Sentinel/Seer/Wildcard) → deploy animation.

### Act 1 — The Approach (Floor 0)

**Beat 1: Auto-walk.** Player spawns on Floor 0. IntroWalk fires — 6-step scripted walk north through the courtyard. Input is locked. The town gate is ahead. Camera sway from MovementController, ambient step SFX, pre-dawn sky.

**Beat 2: NPC barks begin.** Two ambient NPCs patrol the courtyard. As the auto-walk passes them, proximity barks fire:
- *"Another day, another dungeon to scrub. Don't be late, Gleaner."*
- *"The heroes came through last night. Left a real mess down there."*

These barks establish the world: the player is a janitor, heroes are destructive, the dungeon needs work.

**Beat 3: Transition.** Auto-walk reaches the DOOR tile. Floor transition fires → The Promenade.

### Act 2 — The Promenade (Floor 1)

**Beat 4: Town arrival.** The player arrives on Floor 1 — a sunset boardwalk town. Ambient morning barks fire within 2.5s of arrival. Free movement begins. Multiple buildings with DOOR tiles line the boardwalk: the Coral Bazaar (card shop), the Driftwood Inn, the player's home, the soft dungeon building, and the gate to Floor 2 at the south end.

**Beat 5: Ambient barks.** As the player explores, NPC barks continue on a timer (~18-28s intervals):
- *"Why aren't you at work yet? Dungeons don't clean themselves."*
- *"I heard the Seeker's party breached the lower vaults last night."*
- *"You heading to the boardwalk shops? Coral Traders got new stock."*

**Players who read barks** understand: go to the dungeon, get to work, the shops have supplies. They head toward the Floor 2 gate.

**Players who ignore barks** may wander into the soft dungeon building on Floor 1 (the DOOR leading to Floor 1.3, then stairs down to 1.3.1). This is intentional — the soft dungeon is a gentle tutorial trap that teaches combat basics with easy enemies and minimal risk. They'll emerge with a bit of loot and a better understanding of the game, then eventually find their way to the real content.

### Act 3 — The Dispatcher Force-Turn (Floor 1 gate)

**Beat 6: Gate encounter.** The player approaches the Floor 1→2 gate at the east end of the road corridor (GATE 48,17). The Dispatcher NPC (🐉 black jacket, clipboard) is blocking the passage.

When the player bumps the Dispatcher, a **force-turn** fires: the camera snaps the player to face the Dispatcher. Input is locked during the bark cascade:

1. **Intro:** *"Gleaner. About time. The lower floors are a disaster — Hero party tore through last night."*
2. **The task:** *"I need you down in the dungeon building on Lantern Row. Place is wrecked."*
3. **The misdirection:** *"That building's been locked since the breach. You'll need your work keys to get in."*
4. **Direction:** *"Your keyring's at your bunk. Home is back on the Promenade — north wall, east side. Get the keys, come back through here, and report to my office."*

The gate tile behind the Dispatcher is impassable until the keyring is retrieved. The Dispatcher does not move.

**Beat 7: The fetch quest.** The player backtracks through Floor 1, finds their home (DOOR at SC pod south row, (22,27) — the quest marker points there). They enter Floor 1.6 (Gleaner's Home).

**Beat 8: Home + keyring pickup.** The home is a small 10×8 room. A bed (bonfire), a mailbox (pillar), and a stash chest at (5,3). The player interacts with the chest to pick up the work keyring.

Home bark: *"Morning, Operative. Keys are on the rack. Dispatcher wants you at the vaults."*

**Beat 9: First Hero sighting.** As the player picks up the keys, a scripted moment fires: through the home's window (rendered as a brief screen flash / distant sound), the Hero is visible for the first time — a distant golden silhouette passing by outside, accompanied by a faint `ascend-3` SFX and ground tremor. This is a subliminal preview. The player doesn't fully register what they saw. A bark fires: *"...was that...?"*

This plants the seed. The Hero exists. The Hero is nearby. The Hero is enormous.

**Beat 10: Return to gate.** The player exits home, returns to the Floor 1→2 gate. The Dispatcher has stepped aside. The gate is now passable.

Dispatcher bark: *"Good. Head through. My office is first building on the left."*

### Act 4 — Lantern Row (Floor 2)

**Beat 11: Arrive on Floor 2.** The player enters Floor 2 — Lantern Row. This is a proper commercial district, not just a corridor. More building facades, more shops, more NPC barks. The atmosphere is busier and darker than the Promenade — evening lantern-light, narrow alleys between buildings.

Shop barks fire on arrival timers:
- *"Hey, new Gleaner! My restock ingredients are the best on Lantern Row."*
- *"Looking to buy? Lantern Row prices beat the Promenade any day."*

Two interactive doors are visible: the Dispatcher's Office (Floor 2.1) on the left, and the dungeon building (Floor 2.2) further along the street.

**Beat 12: Dispatcher's Office (Floor 2.1).** The player enters the Dispatcher's Office — the employer's interior. A desk, paperwork, wall maps showing dungeon floor plans. The Dispatcher is here (he arrived before the player — he knows shortcuts).

Dispatcher bark cascade:
1. **Briefing:** *"Here's the situation. The dungeon building down the street — heroes ripped through it last night. Floors are wrecked."*
2. **Mission:** *"Get in there, clean up, restock what you can. Standard protocol."*
3. **The lock (misdirection):** *"Building should be locked — I sent for the key this morning. Use the work keys I had you pick up."*

The Dispatcher reinforces the expectation: the dungeon building (2.2) is locked, and the keyring is needed.

### Act 5 — The Subversion (Floor 2.2)

**Beat 13: The door is NOT locked.** The player approaches the dungeon building entrance (Floor 2.2) on Lantern Row. They expect to use their keyring. But the door opens normally — a regular DOOR tile, no lock.

**The entire fetch quest was unnecessary.** The Dispatcher said the building was locked. It wasn't. The Hero party left it open when they breached last night. The game has subverted the player's expectation. This establishes the world's tone: bureaucratic, slightly absurd, and not fully in control. The Dispatcher didn't know the door was open. The player did busywork. Welcome to being a janitor.

**Beat 14: Enter Watchman's Post (Floor 2.2).** The dungeon building interior. A shaken NPC sits inside — the dungeon watchman.

NPC bark: *"The heroes... they're inside. Doing their thing."* (eye roll emoji overlay) *"I stopped watching hours ago. Just... go clean up after them, I guess."*

The player descends via STAIRS_DN to Floor 2.2.1.

### Act 6 — The Hero's Wake (Floor 2.2.1)

**Beat 15: The Hero reveal.** The player enters the dungeon. The corridor ahead is devastated: dirty tiles, smashed crates, high-level CORPSE tiles litter the ground. And at the far end of the entry corridor — the Hero.

The Hero is visible from behind. A towering figure (scale 1.5, gold glow, particle trail) walking *away* from the player through the wake of destruction. The Hero rounds a corner and vanishes. Distant `ascend-3` SFX. The Hero went deeper.

Dialog auto-trigger: *"Something massive came through here. The walls are gouged. A figure moves in the darkness ahead — too large, too bright. You are not meant to follow."*

**Beat 16: High-level corpses.** The corridor is littered with CORPSE tiles — but these aren't low-level rats and crawlers. These are the remains of **high-level enemies**: Bone Sentinels (HP 12), Vault Wardens (HP 15), Crystal Golems (HP 20). The Hero killed them all effortlessly. Each corpse yields premium loot (30-80 gold, rare materials, 20% chance of uncommon card).

The player loots their way through the Hero's wake. This is the scavenge tutorial at scale — more gold in one corridor than the player has ever seen.

**Beat 17: The unbeatable enemy.** The dungeon opens into a room with a **living high-level enemy** — a Vault Warden (HP 15, STR 5, full health). The Hero missed one, or it was hiding. The enemy is awake. Intent telegraph shows lethal confidence.

The player's starter hand (3-5 weak cards, 2 STR) cannot possibly kill this enemy. The math is clear: the player deals ~4 damage per round; the Warden deals 5. The player has 10 HP. They die in 2 rounds. The Warden survives 4 rounds of the player's attacks.

**The game teaches by implication: you should flee.** The player retreats with their scavenged loot. They've learned:
- The Hero is ahead of them, unreachable, god-like
- High-level enemies exist and are unkillable right now
- The dungeon's real value is in the corpses the Hero leaves behind
- Combat is not the path to power — scavenging is

**Beat 18: The scavenge pivot.** The player exits the dungeon with 100-200 gold worth of premium loot. They return to Floor 1 or Floor 2 shops, sell, buy 2-3 cards. They're richer than they've ever been from one trip. The scavenge loop clicks.

From this point, the game opens up. The player can run:
- **Dungeon 1.3.1** (soft cellar) — easy enemies, basic loot, low risk. Good for practicing combat.
- **Dungeon 2.2.1** (Hero's Wake) — no living enemies near the entrance (they're deeper), premium corpse loot. High risk deeper in.
- **Dungeon 3.1.1** (future, post-jam) — hardest enemies, best loot, endgame content.

Each run earns currency → buy cards at shops → increase combat prowess → buy better restock ingredients → restock crates for seal rewards → earn more currency. The loop compounds.

---

## 5. Floor Designs

### 5.1 Floor 0 — The Approach

Keep the existing 20×16 hand-authored grid. The auto-walk path goes north to a DOOR leading to Floor 1. Two ambient NPC patrols (2-point bounce) provide bark context during the walk.

Changes from v1.0: No hidden door needed. The auto-walk delivers the player directly to Floor 1.

### 5.2 Floor 1 — The Promenade ✅ Implemented

50×36 exterior (refactored from the 40×30 spec in v2.2 to fit the six-pod building layout). The hub town. A central E–W road corridor (rows 14–22) separates three north pods from three south pods, with both ends gated.

Six-pod layout (actual grid coords from floor-manager.js — verified Apr 4 2026):
- **NW pod**: Coral Bazaar — DOOR(10,8)→1.1
- **NC pod**: Driftwood Inn — DOOR(22,8)→1.2
- **NE cluster**: Noticeboard Pavilion — board tile at (38,7); no interior door
- **SW pod**: Storm Shelter / Cellar Entrance — DOOR(10,27)→1.3
- **SC pod**: Gleaner's Home — DOOR(22,27)→1.6
- **SE cluster**: Well / Fountain — decorative
- **Road corridor (rows 14–22)**:
  - West gate: DOOR_EXIT(2,17)+(2,18)→"0" The Approach
  - East gate: GATE(48,17)+(48,18)→"2" Lantern Row — Dispatcher blocks until keyring fetch
  - BONFIRE(24,17) — central road plaza rest point (only exterior bonfire)
- **Landmarks**:
  - MAILBOX(22,25) — 2 tiles north of home door, SC pod. MailboxPeek scans dynamically.
  - DUMP_TRUCK(30,26) — home parking site between SC and SE pods (moves to faction exterior on hero days)

NPC barks on Floor 1 serve dual purpose:
1. **Directional:** Point the player toward Floor 2 and the dungeon
2. **Warning:** Discourage entering the soft dungeon prematurely ("That cellar? Just rats and cobwebs. The real work's on Lantern Row.")

### 5.3 Floor 1.1 — Coral Bazaar ✅ Implemented

16×12 hand-authored interior (biome: `bazaar`). Card shop with bookshelves, bonfire, and STAIRS_DN to Coral Cellars dungeon. Faction: Coral Traders (flame-aligned cards). First shop encounter triggers a brief bark teaching buy/sell.

Actual layout (floor-manager.js `_buildFloor2`):
- **North hall (y=1-2)**: Bookshelves at (2,2) and (13,2) with bazaar-themed books
- **Inner stair chamber (y=3-5)**: STAIRS_DN(7,4) to Coral Cellars depth-3 dungeon
- **Main hall (y=7-9)**: Bookshelf(2,7), pillars(2,8)+(13,8), BONFIRE(7,8)
- **DOOR_EXIT(7,10)**: Back to The Promenade

### 5.4 Floor 1.2 — Driftwood Inn (proc-gen)

Proc-gen interior via SpatialContract (biome: `inn`). Main hall with bonfire (**overheal**: 150% max HP, decays over 3 floors) and sleeping quarters bonfire (**replenish**: restore all energy). NPC innkeeper provides lore. Auto-placed bookshelves with inn-themed books (`tip_inn_bonfire`, `fiction_tides_of_passion`, `lore_dragon_history_1`). BedPeek module provides bed interaction (rest/advance day).

### 5.5 Floor 1.3 — Cellar Entrance (proc-gen)

Proc-gen interior via SpatialContract (biome: `cellar_entry`). The intermediate building that leads down to the soft mini-dungeon. Stone walls, dim amber torchlight.

A small vestibule with a few crates, a lantern, and STAIRS_DN leading to Floor 1.3.1. Optional NPC: an old caretaker who provides a bark about the cellar's history. Auto-placed bookshelves with cellar-themed books (`tip_combat`, `lore_dragon_history_2`).

This floor exists so the soft dungeon follows proper depth hierarchy: exterior (1) → interior (1.3) → dungeon (1.3.1).

### 5.6 Floor 1.6 — Gleaner's Home ✅ Implemented

24×20 hand-authored multi-room interior (expanded from spec's 10×8 single room). Biome: `home` (warm amber plank walls, dark wood floor). Takes advantage of the "bigger on the inside" rule for depth-2 floors.

Four distinct zones:
1. **Bedroom (west, cols 1-5, rows 1-8)**: BED pair at (2,3)+(3,3) — bonfire/rest point. Nightstand TABLE(4,7). Bookshelf(1,1).
2. **Living room (center, cols 7-15, rows 1-8)**: TABLE pair(11,5)+(12,5), HEARTH(11,7), bookshelves at (9,2)+(14,2). Cozy hub.
3. **Storage (east, cols 17-22, rows 1-8)**: CHEST(19,3) — work keys stash. PILLAR/mailbox history(19,6). Bookshelves at (21,1)+(20,8).
4. **Entry hall (center, cols 7-15, rows 10-18)**: Long corridor, hall pillars(10,10)+(13,10), bookshelves at (9,15)+(14,15).

```
 Simplified layout (24×20 — see floor-manager.js for exact grid):
┌────────────────────────────────────┐
│ BEDROOM    │  LIVING ROOM  │ STORAGE│  rows 0-9
│ BED(2,3)   │  TABLE(11,5)  │ CHEST  │
│ BED(3,3)   │  HEARTH(11,7) │(19,3)  │
│ nightstand │  bookshelves  │ 📬(19,6)│
├─doorway────┤              ├doorway──┤  row 5 (open)
│            │              │         │
├────────────┤──────────────├─────────┤  row 9 (dividing wall)
│            │  ENTRY HALL   │         │
│   walled   │ pillars(10,10)│  walled │  rows 10-18
│   off      │        (13,10)│  off    │
│            │ 📚(9,15)(14,15)│        │
│            │  DOOR_EXIT    │         │
│            │  (11,19)→"1"  │         │
└────────────────────────────────────┘
```

Objects:
- **Bed pair** (BED tiles 27, (2,3)+(3,3)): Sleep / advance day via BedPeek interaction ✅
- **Work Keys** (CHEST tile 7, 19,3): Interact to pick up keyring. Triggers gate unlock + Hero sighting scripted moment. Tile becomes EMPTY after pickup.
- **Mailbox history** (PILLAR, 19,6): Hero-run report history via MailboxPeek ✅ (configured in `mailboxHistory: { x: 19, y: 6 }`)
- **Hearth** (HEARTH tile 29, 11,7): Decorative fireplace, cozy atmosphere
- **7 bookshelves**: Biome-appropriate books (personal fiction, work schedule, guild lore, dragon history, adventure novel, shopping guide, ghost story)
- **DOOR_EXIT** (11,19): Back to Floor 1. `doorTargets['11,19'] = '1'`

> **Note:** The exterior mailbox for Floor 1 is a separate TILES.MAILBOX (37) at (33,8) on the Promenade grid, not inside the home. MailboxPeek scans for MAILBOX tiles dynamically via `_findMailboxTile()`.

### 5.7 Floor 1.3.1 — Soft Mini-Dungeon

20×20 proc-gen dungeon. The "tutorial trap" for players who ignore NPC barks and wander into the cellar building on Floor 1 before heading to Floor 2.

Design intent: gentle but educational.
- 2-3 easy enemies (Dungeon Rat HP 2, Cobweb Crawler HP 3)
- Basic loot (10-30 gold per corpse, common cards)
- 1-2 breakable crates with simple slot fills
- Optional sidequest items (future: cleaning contracts, puzzle tiles)
- STAIRS_UP at the end returns to Floor 1.3

The player who clears this dungeon learns combat, looting, and restocking basics. They emerge slightly richer and more confident, ready to follow the NPC barks toward Floor 2.

### 5.8 Floor 2 — Lantern Row (proc-gen)

Proc-gen exterior via SpatialContract (biome: `lantern`). A proper commercial district — wider than v2.0's narrow street. Lantern-lit evening atmosphere. Building facades on both sides, several with interactive DOORs (shops, Dispatcher's Office, dungeon building).

Key elements:
- **DOOR_BACK** (west): Return to Floor 1 through gate
- **DOOR** (left side): Floor 2.1 (Dispatcher's Office) — first building on the left
- **DOOR** (further east): Floor 2.2 (Watchman's Post / dungeon building) — appears normal, NOT locked
- **Additional shop DOORs** (non-interactive or future-wired): Building facades for atmosphere and future expansion
- **Ambient NPCs**: More barks, busier than Promenade. Evening crowd, lantern-lit.
- **Lantern props** (PILLAR tiles with warm light): Line the street for atmosphere.

NPC barks on Floor 2:
- *"Lantern Row's the real heart of town. Promenade's for tourists."*
- *"Watch yourself near the dungeon building. Heroes been going in and out all night."*
- *"Hey, new restock ingredients just came in. Better prices than the Promenade."*

### 5.9 Floor 2.1 — Dispatcher's Office (proc-gen)

Proc-gen interior via SpatialContract (biome: `guild`). The employer's office. Dark wood paneling, map-covered walls, desk, filing cabinets. Auto-placed bookshelves with office-themed books (`tip_dispatch_protocol`, `notice_work_order_template`, `lore_gleaner_guild_charter`).

- **DOOR_EXIT** (south): Back to Floor 2
- **Dispatcher NPC**: Stationed at desk. Bark cascade provides mission briefing and reinforces the (false) expectation that Floor 2.2 is locked.
- **Wall maps**: Decorative PILLAR tiles showing dungeon floor plans (atmospheric detail)
- **Desk items**: Non-interactive props establishing the bureaucratic world

### 5.10 Floor 2.2 — Watchman's Post (proc-gen)

Proc-gen interior via SpatialContract (biome: `watchpost`). The dungeon staging area. A shaken NPC sits inside. Auto-placed bookshelves with watchpost-themed books (`manual_admiralty_handbook`, `lore_hero_arrival`, `notice_hero_registration`).

- **DOOR_EXIT** (south): Back to Floor 2
- **STAIRS_DN** (north): Down to Floor 2.2.1 (Hero's Wake dungeon)
- **Shaken NPC**: Non-blocking, interactive. Bark: *"The heroes are inside. Doing their thing."* (eye roll) *"I stopped watching hours ago."*
- Optional: breakable crate, minor loot

### 5.11 Floor 2.2.1 — Hero's Wake (Dungeon B1)

28×28 proc-gen dungeon. This is the game's pivot floor — the first real dungeon experience.

Generation post-pass (first visit only):
- **Hero trail**: Pre-placed CORPSE tiles (high-level enemies: Bone Sentinel, Vault Warden, Crystal Golem) along the entry corridor and into the first major room. 5-8 corpses, each with premium loot.
- **Hero sprite**: Towering figure at the far end, walking away. Despawns on LOS break.
- **Smashed crates/debris**: BREAKABLE remnants and scattered COLLECTIBLE tiles.
- **The unbeatable enemy**: One living Vault Warden (HP 15, STR 5) in a room past the hero trail. Full health, full aggression. Unkillable with starter deck. Teaches the player to flee.
- **Subsequent visits**: Hero trail corpses gone (first-visit only). Some enemies respawn (50% density). Breakables respawn degraded.

### 5.12 Future Floors

| Floor | Name | Status |
|-------|------|--------|
| `"2.2.2"` | Hero's Wake B2 | Proc-gen, deeper dungeon. Standard enemy population. |
| `"3"` | Frontier Gate | Future exterior. Third hub zone. |
| `"3.1"` | Armory | Future interior. Equipment shop + dungeon access. |
| `"3.1.1"+` | Deep Vaults | Future dungeon chain. Hardest content. |

---

## 6. The Hero Reveal — Design Detail

### 6.1 The Moment (Floor 2.2.1)

The player descends into Floor 2.2.1 and sees the Hero's back for the first time. This is the narrative hook.

The Hero is a towering figure (scale 1.5, gold glow, particle trail `✨`) walking away through a corridor of high-level corpses and debris. The Hero does not acknowledge the player. The Hero is indifferent — the player is beneath notice.

### 6.2 Hero Foreshadowing (Floor 1.6)

The Hero sighting at the player's home (Beat 9) is the first foreshadow. It's deliberately ambiguous — a flash of gold through the window, a distant footstep, a tremor. The player might not even realize what they saw. On second playthrough, they'll recognize it.

### 6.3 Hero Entity

```javascript
var _heroSprite = {
  x: heroX, y: heroY,           // Far end of entry corridor
  emoji: '⚔️',                  // Custom hero glyph
  name: 'The Seeker',
  scale: 1.5,                   // 2.5× normal enemy size
  facing: 'north',              // Walking AWAY from player
  glow: '#d4af37',              // Gold halo
  glowRadius: 14,
  particleEmoji: '✨',          // Sparkle trail
  tint: 'rgba(200,180,100,0.15)',
  bobY: 0.02,                   // Slight float
  awareness: -1                 // Never engages — always fleeing
};
```

The Hero moves 1 tile per 800ms along a pre-scripted path. When the player closes to within 4 tiles, the Hero speeds up to 500ms/tile. When the Hero reaches the corner room, it despawns. Faint `ascend-3` SFX plays.

### 6.4 High-Level Corpse Population

The Hero's trail contains corpses of enemies the player cannot yet fight:

| Enemy | HP | STR | Loot Gold | Card Drop % | Purpose |
|-------|-----|-----|-----------|-------------|---------|
| Bone Sentinel | 12 | 4 | 30-50 | 15% common | Shows enemy scale |
| Vault Warden | 15 | 5 | 50-80 | 20% uncommon | Premium loot source |
| Crystal Golem | 20 | 6 | 60-100 | 10% rare | Aspirational enemy |

These corpses communicate: "the Hero fought things you can't even dream of fighting yet." The loot communicates: "but their remains are worth a fortune."

### 6.5 The Unbeatable Enemy

One living Vault Warden in the room past the hero trail. It must be **mathematically impossible** to kill with the starter deck.

Combat math (starter deck: 5 cards, 2 STR, 10 HP):
- Player deals ~4 damage per round (Rusty Slash 2 + Cinder Poke 1 + STR 2 - defense)
- Vault Warden deals 5 damage per round
- Player dies in 2 rounds (10 HP / 5 = 2)
- Vault Warden survives 4 rounds (15 HP / 4 ≈ 4)

The player MUST flee. If they don't, they die and learn the harder lesson.

---

## 7. The Scavenge Loop — Three-Dungeon Economy

### 7.1 The Loop

After the Floor 2.2.1 pivot, the game opens into a repeating loop:

```
Enter dungeon (1.3.1, 2.2.1, or 3.1.1)
  → Loot corpses + collect floor pickups
  → Restock crates (Gleaner mode) for coin yield + seal rewards
  → Retreat before HP runs out
Exit to town (Floor 1 or Floor 2 shops)
  → Sell loot at Coral Bazaar or Lantern Row shops
  → Buy cards / supplies / restock ingredients
  → Rest at Driftwood Inn (overheal)
Re-enter dungeon, stronger
```

### 7.2 Three Dungeons, Three Difficulty Tiers

| Dungeon | Risk | Loot | Enemies | Best For |
|---------|------|------|---------|----------|
| 1.3.1 (Soft Cellar) | Low | Basic (10-30g) | Rats, Crawlers (HP 2-3) | Combat practice, basic cards |
| 2.2.1 (Hero's Wake) | Medium | Premium (30-80g) | High-level corpses (loot only), some live enemies deeper | Scavenging gold, buying power |
| 3.1.1 (Deep Vaults) | High | Rare (50-100g) | Full-strength enemies (HP 8-15) | Endgame farming, rare cards |

The player naturally graduates: 1.3.1 when weak → 2.2.1 for gold → 3.1.1 when strong enough.

### 7.3 Currency → Cards → Combat → Better Restocking

The economy is circular:

1. **Scavenge corpses** → gold + materials
2. **Sell at shop** → gold
3. **Buy cards** → combat power (can fight tougher enemies, reach deeper floors)
4. **Buy restock ingredients** → better crate fills (matching frame tags = 2-3x coin yield)
5. **Restock crates** → more gold + chance at rare card seal rewards
6. **Repeat with increasing efficiency**

Each cycle the player is meaningfully stronger. By loop 5-6, they have a 10-card deck with synergy pairs and enough combat power to handle mid-tier enemies.

### 7.4 Starting Deck — Card Lean

5 cards. Just enough to survive one easy fight if played perfectly.

| Card | Suit | Cost | Damage | Heal | Notes |
|------|------|------|--------|------|-------|
| Rusty Slash | ♠ Storm | 0 | 2 | — | Bread-and-butter attack |
| Patch Up | ♥ Wild | 0 | — | 2 | Emergency heal |
| Cinder Poke | ♦ Flame | 0 | 1 | — | Suit advantage vs ♣ Frost |
| Frost Shard | ♣ Frost | 0 | 1 | — | Suit advantage vs ♦ Flame |
| Scavenge | ♠ Storm | 0 | — | — | Draw 1 card. Utility. |

### 7.5 Shop Prices (Tuned for 1-trip = 1-2 upgrades)

| Item | Price | Notes |
|------|-------|-------|
| Common card | 40-60g | Affordable after one dungeon run |
| Uncommon card | 80-120g | Requires 2-3 runs or one good Hero's Wake trip |
| Health potion | 30g | Heals 5 HP |
| Food item | 15-20g | Heals 2-3 HP |
| Restock ingredient (matched) | 25-40g | For crate frame-matching |

---

## 8. Gate-Contract System

### 8.1 Gate Taxonomy

| Tier | Type | Interaction | Visual | HP/Req |
|------|------|-------------|--------|--------|
| 1 | Dispatcher Block | Force-turn + bark cascade | NPC blocking gate passage | Keyring item |
| 2 | Locked | Requires key item | Iron gate texture + lock overlay (LockedDoorPeek) | Key item |
| 3 | NPC | Dialogue/combat | NPC sprite blocking passage | Varies |

### 8.2 Floor 1 → Floor 2 Gate — Dispatcher Force-Turn

The south wall of Floor 1 funnels into a 2-3 tile passage. The Dispatcher NPC stands in the passage, blocking it. When the player bumps the Dispatcher, a force-turn fires (camera snaps to face the NPC) and a bark cascade plays. The player is redirected to fetch their keyring from Floor 1.6.

Implementation: The Dispatcher NPC has a collision mask that blocks the gate passage. When `_onPickupWorkKeys()` fires (player interacts with chest in Floor 1.6), the Dispatcher's collision mask is removed and he steps aside. The gate passage becomes walkable. On return, the Dispatcher delivers a final bark and the player passes through to Floor 2.

### 8.3 Floor 2 Dungeon Building — The Fake Lock (Narrative Only)

The dungeon building entrance on Floor 2 is a **normal DOOR tile**. It was never locked. The Dispatcher told the player it was locked (twice — at the gate and in his office), but the Hero party left it open when they breached. This is a pure narrative subversion, not a mechanical one.

Implementation: No LOCKED_DOOR tile needed for Floor 2.2's entrance. The door is always a regular DOOR. The misdirection lives entirely in the Dispatcher's bark text.

### 8.4 Floor State Tracking

Per-floor state persistence:
- `destroyedGates[]`: Permanent EMPTY, never respawn
- `destroyedBreakables[]`: Respawn degraded (visit 2: 50% chance, -1 tier)
- `visitCount`: Scales respawn density (visit 2: 50%, visit 3: 30%, visit 4+: 20%)
- `unlockedDoors[]`: Permanent

---

## 9. Gleaner Pivot — Dungeon Maintenance Systems ✅ All Implemented

(Preserved from v1.0 §13-§15 — the three interlocking loops)

The scavenge loop described in §7 is the game's first act. As the player gains power, the maintenance loops layer on top:

### 9.1 The Cleaning Loop ✅
`cleaning-system.js` — Scrub dirty/damaged tiles grid-by-grid. Each scrub costs battery, pops 1 coin, credits readiness. 80% cleanliness triggers bonus coin burst.

### 9.2 The Restocking Loop ✅
`crate-system.js` + `crate-peek.js` + `crate-ui.js` — Fill crate slots with items. Matched frame = 2-3x yield. Seal reward table rolls for card drops (1% legendary).

### 9.3 The Dungeon Reset Loop ✅
`work-order-system.js` + `readiness-calc.js` — Work orders from the Gleaner's Guild. Readiness score uses CORE/EXTRA split scoring (0.0–2.0): cleaning (25%) + restocking (25%) + traps (15%) + puzzles (15%) + monsters (10%) + secrets (10%). ReadinessBar in HUD tracks progress with tier crossing FX, celebration at 100%, and extra-credit coin drip above 1.0.

### 9.4 Supporting Systems ✅
- `trap-rearm.js` — Trap restoration with readiness credit
- `torch-state.js` + `torch-peek.js` — 3-slot torch model with fuel + hero damage
- `cobweb-system.js` + `cobweb-node.js` + `cobweb-renderer.js` — Trap webs
- `day-cycle.js` — 8-phase day/night clock
- `dungeon-schedule.js` — Per-group hero day state machine, combo multiplier, death-shift
- `hero-run.js` — Hero run simulation per-group
- `morning-report.js` — Dawn Toast sequence with per-group status
- `mailbox-sprites.js` + `mailbox-peek.js` — Report delivery + history

---

## 10. Implementation Phases (Jam-Ready)

### Phase 0: Playflow Critical Path — ✅ Partially Complete

**Goal:** Floor 0 → 1 → gate force-turn → 1.6 → back to gate → 2 → 2.1 → 2.2 → 2.2.1 is walkable end-to-end with NPC barks, the Dispatcher misdirection, and the Hero reveal.

Completed:
- ✅ Hand-authored Floor 0, Floor 1 (40×30), Floor 1.1 (16×12), Floor 1.6 (24×20) grids in floor-manager.js
- ✅ Floors 1.2, 1.3, 2, 2.1, 2.2 all generate via SpatialContract proc-gen — walkable, correct biomes
- ✅ Floor 1.6 has full multi-room interior with bed, chest, mailbox history, hearth, bookshelves
- ✅ Floor transition system, door contracts, door animator, interact prompt all operational
- ✅ NPC system + NPC composer + bark library all operational
- ✅ Intro-walk (Floor 0 auto-walk) implemented
- ✅ All peek modules live (bookshelf, bar-counter, bed, mailbox, crate, corpse, torch, chest, locked-door, merchant, monologue, puzzle, door)

Remaining:
- Dispatcher force-turn bark cascade (NPC blocking gate with collision mask + key redirect)
- Keys pickup scripted moment (Hero sighting through window)
- Hero walk controller on Floor 2.2.1 (tick-driven, flee-on-approach, despawn)
- Hero trail post-pass (pre-placed high-level corpses on first visit)
- Populated bark pools in `data/barks/en.js`

### Phase 1: Shops + Economy — ✅ Systems Complete, Content Pending

Completed:
- ✅ Shop module operational (buy/sell/sellPart with faction rep tiers)
- ✅ Coral Bazaar (1.1) hand-authored with bonfire + stairs to cellars
- ✅ Card system, card authority, card transfer all operational
- ✅ Loot tables, world items, breakable spawner, salvage, combat engine all operational

Remaining:
- Tuned shop prices per floor
- Starter deck balance (5 cards)
- Enemy stat tuning per dungeon tier

### Phase 2: Soft Dungeon + Scavenge Loop — ✅ Systems Complete, Content Pending

Completed:
- ✅ Floor transitions (building → dungeon depth hierarchy) operational
- ✅ Proc-gen dungeon floors with enemies, breakables, crates
- ✅ Crate restocking system (crate-system + crate-peek + crate-ui)
- ✅ Corpse looting (corpse-registry + corpse-peek + salvage)

Remaining:
- Loot table tuning per dungeon tier
- 3-dungeon scavenge loop end-to-end playtest

### Phase 3: Polish + NPC Dialog — Pending

1. All ambient bark pools populated
2. Dispatcher bark cascades polished (gate encounter + office briefing)
3. Shaken NPC dialog
4. Minimap labels for all floors
5. Test full 20-minute initial experience

---

## 11. Alignment with Other Documents

### CLAUDE.md Floor Hierarchy

The floor hierarchy in CLAUDE.md must be updated to match:

```
"0"       The Approach       (exterior — tutorial courtyard)
"1"       The Promenade      (exterior — sunset boardwalk town)
"1.1"     Coral Bazaar       (interior — card shop)
"1.2"     Driftwood Inn      (interior — inn, overheal bonfire)
"1.3"     Cellar Entrance    (interior — soft dungeon building)
"1.6"     Gleaner's Home     (interior — player bunk, keyring)
"1.3.1"   Soft Cellar        (dungeon — tutorial trap, easy enemies)
"2"       Lantern Row        (exterior — commercial district, more shops)
"2.1"     Dispatcher's Office (interior — employer, mission briefing)
"2.2"     Watchman's Post    (interior — shaken NPC, dungeon staging)
"2.2.1"   Hero's Wake B1     (dungeon — Hero reveal, high-level corpses)
"2.2.2"   Hero's Wake B2     (dungeon — deeper scavenge)
"3"       Frontier Gate      (exterior — future third zone)
"3.1"     Armory             (interior — future equipment shop)
"3.1.1+"  Deep Vaults        (dungeon — future hardest content)
```

### STREET_CHRONICLES_NARRATIVE_OUTLINE.md

The narrative outline's faction structure remains valid. The initial playflow now integrates the conspiracy layer more gradually:
- **Floor 0-1**: No faction content. Pure environmental storytelling via barks.
- **Floor 1 gate (Dispatcher)**: First dragon hint — the Dispatcher has a 🐉 head. Why does the player's boss have a dragon face? (Contributor knowledge: he's a handler at the detective agency.)
- **Floor 2.1 (Dispatcher's Office)**: The 🐉 is the player's employer. The office has maps and reports. Environmental hints at the conspiracy.
- **Floor 2.2.1 (Hero's Wake)**: The Seeker's destruction raises questions. Why did the Hero kill everything so thoroughly? What were they looking for?
- **Act 2+**: Faction NPCs start appearing in dungeon interiors and both commercial districts. Dialog trees expose the conspiracy.

### NPC_SYSTEM_ROADMAP.md

The NPC types map cleanly to the playflow:
- **AMBIENT**: Floor 0 courtyard NPCs, Floor 1 Promenade passersby, Floor 2 Lantern Row crowd
- **VENDOR**: Coral Bazaar shopkeeper, Driftwood Inn innkeeper, Lantern Row merchants
- **DISPATCHER**: Floor 1 gate NPC + Floor 2.1 office NPC (same character, two locations)
- **INTERACTIVE**: Floor 2.2 shaken watchman NPC, Floor 1.3 old caretaker
- **HERO**: Floor 2.2.1 Hero entity (special non-combatant sprite)

---

## § Cross-References

| Section | Links To | Relationship |
|---------|----------|-------------|
| §2 World Graph | CLAUDE.md §Floor hierarchy | Must match |
| §4 Initial Playflow | NPC_SYSTEM_ROADMAP §4-§7 | Bark/NPC types used |
| §5 Floor Designs | Biome Plan (docs/Biome Plan.html) | Spatial contracts per depth |
| §6 Hero Reveal | STREET_CHRONICLES §Story Arcs | The Seeker is the Hero |
| §7 Scavenge Loop | CORE_GAME_LOOP §3 Economy Model | Coin drip structure |
| §8 Gate System | engine/tiles.js (LOCKED_DOOR still exists for future use) | Tile types |
| §9 Gleaner Pivot | CORE_GAME_LOOP §1-§4 | Three pillars: Clean, Restock, Endure |
| §10 Phases | JAM_COMPLIANCE.md | Must be playable by April 5 |

---

*End of Document — v2.2*

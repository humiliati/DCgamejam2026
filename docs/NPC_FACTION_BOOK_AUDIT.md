# NPC, Faction & Books System Audit
## Dungeon Gleaner — DC Jam 2026
### March 30, 2026

Audit of: book content & placement, NPC faction uniforms, choreographed dialogue, faction HQ buildings, and NPC-to-NPC world-building barks.

---

## 1. Books Audit

### 1.1 The Non-Fiction Wrapping Problem

books.json contains 46 books across 7 categories. The fiction books (8 entries) are excellent — absurdist comedies about harbour masters and fishmongers that feel like genuine in-world entertainment. The problem is the non-fiction categories.

**What happened:** An agent created the journal and manual categories by wrapping real-world document forms (employment contracts, spy reports, academic field guides, redacted memos) around game-world content. The documents read like photocopied paperwork someone forgot in a dungeon — they're written in institutional bureaucratic voice with [REDACTED] blocks and legal clause numbers.

**Why it feels odd:** These documents break the diegetic frame. A game manual written as "Gleaner's Field Manual — Movement" is fine (the player's character would carry such a manual). But a "GUILD MEMO — RESTRICTED — OVERSIGHT BOARD ONLY" found on a bookshelf in an inn doesn't make narrative sense — why would classified documents be lying on a public shelf? The journals written from the player's perspective (then suddenly about the player as an external subject) create a confused POV.

**What works:**
- Tip books (5): Perfect. Gameplay tutorials wrapped as in-world field manuals.
- Fiction books (8): Perfect. Funny, well-written, locals-read-this entertainment.
- Lore books (9): Mostly good. World history told as history — no POV confusion.
- Notice books (6): Good. Civic ordinances, pricing sheets, advisories — the kind of thing you'd find pinned to a board.

**What needs fixing:**
- Letter books (8): The conspiracy trail is excellent CONTENT but wrong DELIVERY. These shouldn't be on bookshelves — they should be found as loose documents in dungeons, hidden in crates, or given by NPCs. A spy's surveillance report doesn't belong next to romance novels.
- Journal books (5): Mixed POV (writing as player → writing about player). Need to pick one voice.
- Manual books (5): The Foundry sponsorship contract and Admiralty field reference are dungeon-drop material, not bookshelf material. The Adventurer's Quarterly is perfect inn material.

### 1.2 Bookshelf Placement (Currently Missing)

**No bookshelves exist in any floor grid.** The BOOKSHELF tile (25) is defined in tiles.js and BookshelfPeek handles the interaction, but no hand-authored floor has placed one. The `floorData.books[]` assignment array is empty on all floors.

**Required placements per the COZY_INTERIORS_DESIGN doc:**

| Floor | Building | Bookshelves | Content Focus |
|-------|----------|-------------|---------------|
| 1.1 | Coral Bazaar | 2-3 | Commerce tips, faction lore, 1 fiction |
| 1.2 | Driftwood Inn | 2-3 | Fiction (romance novels, serialized drama), inn menu manual |
| 1.3 | Cellar Entrance | 1 | Dungeon safety tips, caretaker's log |
| 1.6 | Gleaner's Home | 1-2 | Personal fiction (Love Among the Crates), field manual, 1 letter |
| 2.1 | Dispatcher's Office | 2 | Notices (ordinances, hero registration), guild memos |
| 2.2 | Watchman's Post | 1 | Admiralty field reference, watchman's incident log |

**Rule:** Every building interior has at least 1 bookshelf. Content must feel native to the space — inns have novels, offices have regulations, homes have personal items.

### 1.3 Book Fixes Needed

1. **Move conspiracy letters out of bookshelves** — these become dungeon floor pickups, crate contents, or NPC-delivered documents. They're too important for passive bookshelf browsing.
2. **Fix journal POV** — all journals should be third-person institutional documents (employment records, field reports filed by others about the Gleaner). Remove first-person "I arrived" voice.
3. **Add building-specific mechanic guides:**
   - Bazaar: "How to Buy and Sell" (tip)
   - Inn: "The Bonfire" (tip — explains overheal/replenish)
   - Home: "Your Work Schedule" (notice — explains day/night cycle)
   - Dispatcher's Office: "Dungeon Assignment Protocol" (notice)
4. **Add 2-3 more fiction entries** for variety — a ghost story, a recipe book, a children's counting rhyme.

---

## 2. NPC Faction System Audit

### 2.1 Current State

Three factions exist as card-system/shop identifiers:

| Faction | Emoji | Suit | Hue | Vendor Preset | Buildings |
|---------|-------|------|-----|---------------|-----------|
| **Tide Council** | 🐉 | ♥ Hearts | 200 (cyan) | 🧙 wizard, 👘 robe | None assigned |
| **The Foundry** | ⚙️ | ♦ Diamonds | 30 (orange) | 👨 worker, 🦺 vest, ⛑️ helmet | None assigned |
| **The Admiralty** | 🌊 | ♣ Clubs | 280 (purple) | 👩 officer, 🧥 jacket, 🪖 helmet | None assigned |

Currently, factions only manifest through vendor presets (shop NPCs) and card pools. There are no faction uniforms on ambient NPCs, no faction HQ buildings, and no faction-aligned NPC populations on exterior floors.

### 2.2 Faction Uniform Design (GTA2-Style Gangs)

Each faction needs a **uniform role template** in NpcComposer that's visually distinct and readable at raycaster scale (12-40px emoji). The suit color alignment should be "sublime" — not literal matching but tonal harmony.

| Faction | Uniform Template | Dominant Color | Suit Harmony |
|---------|-----------------|----------------|-------------|
| **Tide** | Robes + staves. Scholarly, mystical. Head variants: 🧙🧝👴. Torso: 👘🥼. Hat: 🎓 (sometimes). Weapon: 🪄🔱. | Cyan/teal tint (hue 180-210) | ♥ Hearts — warm pink complements cool cyan |
| **Foundry** | Work gear + tools. Industrial, practical. Head variants: 👨👦🤖. Torso: 🦺🧥. Hat: ⛑️🧢. Weapon: 🔧🪓⚔️. | Orange/rust tint (hue 20-40) | ♦ Diamonds — green tech against warm rust |
| **Admiralty** | Military dress + shields. Formal, authoritative. Head variants: 👩👧🧑. Torso: 🧥👔. Hat: 🪖👑. Weapon: 🛡️⚔️🏹. | Purple/violet tint (hue 260-300) | ♣ Clubs — electric blue against regal purple |

**Implementation:** Add 3 new role templates to NpcComposer.ROLES:

```javascript
tide_member:     { hats: ['🎓','','',''],    weapons: ['🪄','🔱','',''],    torsos: ['👘','🥼','👘'] },
foundry_member:  { hats: ['⛑️','🧢','⛑️'],  weapons: ['🔧','🪓','⚔️'],    torsos: ['🦺','🧥','🦺'] },
admiralty_member: { hats: ['🪖','👑','🪖'],   weapons: ['🛡️','🏹','⚔️'],   torsos: ['🧥','👔','🧥'] }
```

### 2.3 Faction NPC Population Per Exterior Floor

**Design rule:** An exterior floor has ~15-20 NPCs. 5 of them (25%) wear faction uniforms. Distribution proportional to the faction's local influence, with the dominant faction's HQ on that floor.

| Floor | Total NPCs | Tide | Foundry | Admiralty | Non-Faction | Dominant |
|-------|------------|------|---------|-----------|-------------|----------|
| **0** (Approach) | 2 | 0 | 0 | 0 | 2 | None (tutorial) |
| **1** (Promenade) | 12 | 2 | 1 | 2 | 7 | Tide (temple is here) |
| **2** (Lantern Row) | 15 | 1 | 3 | 1 | 10 | Foundry (workshop is here) |
| **3** (Frontier Gate) | 12 | 1 | 1 | 3 | 7 | Admiralty (garrison is here) |

### 2.4 Faction HQ Buildings

Each Floor N exterior gets one faction HQ interior:

| Floor | Faction HQ | Floor ID | Type | Description |
|-------|-----------|----------|------|-------------|
| **1** | Tide Temple | 1.4 | interior | Mystical reading room, lore bookshelves, Tide vendor, potion shop |
| **2** | Foundry Workshop | 2.3 | interior | Forge, equipment rack, Foundry vendor, gear repair |
| **3** | Admiralty Garrison | 3.2 | interior | Barracks, map table, Admiralty vendor, bounty board |

Each HQ has:
- 1 faction vendor (existing preset)
- 2-3 faction-uniformed ambient NPCs
- 1-2 bookshelves with faction-specific books (lore, manuals, notices)
- Faction-themed spatial contract (color palette matches suit hue)

---

## 3. NPC-to-NPC World-Building Barks

### 3.1 Design Philosophy

NPC barks should not be about the player or quests. They should be **overheard conversations between NPCs about their world.** The player is eavesdropping on life happening around them.

Current barks are player-directed: "Why aren't you at work yet?" "You heading to the boardwalk shops?" These break immersion — random strangers don't address the player by role. Instead:

**Before (player-directed):**
> "Why aren't you at work yet? Dungeons don't clean themselves."

**After (NPC-to-NPC world-building):**
> "Did you see the state of floor 2 this morning? Heroes tore through again."

The player still receives the same information (dungeons need work, heroes cause damage) but through ambient world-building instead of direct address.

### 3.2 Bark Categories

| Category | Purpose | Example |
|----------|---------|---------|
| **Ambient gossip** | World-building, town life | "The inn's got a new stew. Seaweed base. Can't decide if it's brave or sad." |
| **Faction chatter** | Faction identity, politics | "Foundry's hiring again. Third time this season. Wonder what happened to the last batch." |
| **Cross-faction tension** | Inter-faction dynamics | "Tide Council says the deep caves are 'protected.' Foundry says they're 'unexploited.' Same caves." |
| **Dragon whispers** | Conspiracy breadcrumbs | "My grandmother says the caves used to sing at night. Before the heroes came." |
| **Commerce** | Economy, prices, trade | "Scale fragments are up to 40 coin. Used to be 12. Something's changed down there." |
| **Weather/time** | Atmosphere, day cycle | "Storm coming in from the east. Good night to stay inside." |

### 3.3 Choreographed Two-NPC Encounters

**Design rule:** These are rare, precious moments — not spam. Two NPCs with intersecting patrol paths should meet only 3 out of ~300 possible route combinations. When they meet, a short scripted exchange fires.

**Implementation:** Each NPC pair has a `meetRadius` (1 tile) and a `meetCooldown` (180s minimum). When two tagged NPCs occupy adjacent tiles during their patrol, the system:

1. Freezes both NPCs for the duration
2. Turns them to face each other
3. Fires a 2-3 line bark exchange via StatusBar tooltip
4. Optionally shows overhead speech indicators (💬) on both NPCs
5. Resumes patrol after the exchange completes

**Example encounter — Tide scholar + Foundry worker on Floor 1:**

> 🧙 Tide Scholar: "Interesting that the Foundry's new kiln runs on the same fuel the deep caves produce naturally."
> 👨 Foundry Worker: "It's called progress. You should try it sometime."
> 🧙 Tide Scholar: "Progress. Yes. That's one word for it."

**Example encounter — Two citizens on Floor 2:**

> 👩 Citizen: "Marina says the harbour master's been acting strange. Won't talk about what he saw on the night shift."
> 🧑 Citizen: "Everyone's acting strange since the heroes set up camp. Bad for business, good for gossip."

### 3.4 Faction-Specific NPC Interactions

Faction NPCs on their home floor should have distinct interaction behaviors:

| Context | Faction NPC Behavior | Non-Faction NPC Behavior |
|---------|---------------------|------------------------|
| **Player bumps** | Faction greeting + subtle recruitment | Generic bark or silence |
| **Near faction HQ** | "Welcome to [HQ]. Talk to [vendor] if you need supplies." | "I hear the [faction] takes care of their people." |
| **Cross-faction NPC nearby** | Tension bark (low-key territorial) | Neutral observation |
| **Player wearing faction card** | Recognition bark: "Nice [suit] card. You one of us?" | No reaction |

---

## 4. Implementation Roadmap

### Phase 1: Books Fix (2 hours)

1. **Reclassify conspiracy letters** — move `biome` from 'dungeon'/'guild' to a new 'dungeon_drop' biome that doesn't appear on bookshelves. These become crate/corpse loot or NPC-delivered.
2. **Fix journal POV** — rewrite 5 journal entries to third-person institutional voice.
3. **Add building-specific tip books** — 4 new entries (bazaar shopping guide, inn bonfire guide, home schedule guide, dispatch protocol).
4. **Add BOOKSHELF tiles to floor grids** — place tiles in all 6 building interiors per §1.2.
5. **Wire `floorData.books[]`** — explicit book assignments per position.

### Phase 2: Faction Uniforms (1.5 hours)

1. **Add 3 faction role templates** to NpcComposer.ROLES (tide_member, foundry_member, admiralty_member).
2. **Update NPC populations** — Floor 1 gets 12 NPCs (5 faction, 7 citizen), Floor 2 gets 15 NPCs (5 faction, 10 citizen).
3. **Wire faction uniform generation** — NPC definitions include `role: 'tide_member'` which NpcComposer uses to override pools.
4. **Faction tint hues** — faction NPCs get their faction's tintHue for visual cohesion.

### Phase 3: World-Building Barks (2 hours)

1. **Rewrite bark pools** — replace player-directed barks with NPC-to-NPC world-building dialogue.
2. **Add faction bark pools** — `faction.tide.ambient`, `faction.foundry.ambient`, `faction.admiralty.ambient`.
3. **Add cross-faction tension barks** — triggered when two faction NPCs from different factions are within 3 tiles.
4. **Add dragon whisper barks** — rare (one-shot, 1 per floor visit) conspiracy breadcrumbs.

### Phase 4: Choreographed Encounters (2-3 hours)

1. **Define NPC pairs** — tag specific NPC IDs as encounter partners with a shared `meetPoolId`.
2. **Implement meet detection** — in NpcSystem.tick(), check tagged pairs for adjacency.
3. **Implement meet sequence** — freeze, face, exchange, resume. 180s cooldown.
4. **Write 8-10 meet scripts** — 2-3 lines each, covering faction tension, gossip, commerce, dragon whispers.
5. **Wire overhead speech indicator** — 💬 emoji above speaking NPC during exchange (reuse intent capsule system).

### Phase 5: Faction HQ Buildings (3 hours, post-jam priority)

1. **Design Floor 1.4** (Tide Temple) — 12×10, mystical palette, lore bookshelves.
2. **Design Floor 2.3** (Foundry Workshop) — 12×10, industrial palette, equipment.
3. **Design Floor 3.2** (Admiralty Garrison) — 12×10, military palette, bounty board.
4. **Add faction HQ populations** — 1 vendor + 2-3 uniformed ambient NPCs each.
5. **Wire faction HQ books** — faction-specific manuals, lore, notices on bookshelves.
6. **Update CLAUDE.md floor hierarchy** — add 1.4, 2.3, 3.2 to the world map.

### Priority for Jam (April 5 deadline)

| Phase | Priority | Effort | Jam-Critical? |
|-------|----------|--------|---------------|
| Phase 1 (Books) | HIGH | 2h | Yes — books are implemented but empty |
| Phase 2 (Uniforms) | HIGH | 1.5h | Yes — NPCs are rendering but all look the same |
| Phase 3 (Barks) | MEDIUM | 2h | Yes — barks exist but are player-directed |
| Phase 4 (Encounters) | LOW | 2-3h | No — polish, not core |
| Phase 5 (Faction HQs) | LOW | 3h | No — post-jam content |

**Jam-critical total: ~5.5 hours** (Phases 1-3)

---

## 5. Cross-References

| Section | Links To |
|---------|----------|
| §1 Books | data/books.json, engine/bookshelf-peek.js, docs/COZY_INTERIORS_DESIGN.md |
| §2 Factions | engine/npc-composer.js (ROLES, VENDOR_PRESETS), engine/shop.js (faction metadata) |
| §3 Barks | engine/bark-library.js, engine/npc-system.js, data/barks/en.js |
| §4 Encounters | engine/npc-system.js (tick loop), docs/NPC_SYSTEM_ROADMAP.md (Phase B-C) |
| §5 Faction HQs | docs/Tutorial_world_roadmap.md (floor registry), CLAUDE.md (floor hierarchy) |
| §2-§5 Faction Presence | docs/ACT2_NARRATIVE_OUTLINE.md (§4 faction lock, §4.3 hostility consequences, §5.4 housing reassignment) |

---

*End of Audit — v1.0*

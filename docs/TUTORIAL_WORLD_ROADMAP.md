# Tutorial World Roadmap
## Dungeon Gleaner — DC Jam 2026
### Version 1.0 — March 2026

World Graph Design · Gate-Contract System · Floor ID Architecture · Implementation Phases

---

## 1. Overview

The tutorial world is a multi-floor exterior district that teaches mechanics through environmental discovery before funneling the player into the dungeon proper. The design borrows Gone Rogue's gate-contract pattern: breakable gates that block passage until destroyed, creating a natural progression lock without explicit tutorials.

The world graph replaces the current linear `floorNum → ID` mapping with a true hierarchical graph where multiple exterior floors connect via gates and doors, each containing buildings with interior floors and optional nested dungeons.

### Design Pillars

1. **Environmental teaching** — mechanics taught by doing, not reading (Zelda 1 philosophy)
2. **Gate-gated progression** — breakable/locked gates funnel the player through zones in order
3. **Looping key quests** — keys hidden in earlier dungeons force backtracking through known territory
4. **Safe exteriors** — all depth 1-2 areas are non-lethal (bonfire respawn + penalties)
5. **Returnable floors** — every floor is revisitable; gates stay destroyed, breakables degrade

---

## 2. World Graph

```
                    ┌─────────────────────────────────────────┐
                    │            FLOOR 0 ("0")                │
                    │         The Approach (exterior)          │
                    │   Courtyard · Bonfire · Building facade  │
                    │                                          │
                    │   [DOOR @ (9,6)] ──── tutorial auto-walk │
                    │   [DOOR @ hidden] ── to Floor 1          │
                    └──────┬──────────────────┬────────────────┘
                           │                  │
                    ┌──────▼──────┐    ┌──────▼──────┐
                    │ FLOOR 0.1   │    │  FLOOR 1    │
                    │ Entry Lobby │    │ ("1")       │
                    │ (interior)  │    │ Market      │
                    │ depth 2     │    │ Square      │
                    │             │    │ (exterior)  │
                    │ [STAIRS_DN] │    │ depth 1     │
                    └──────┬──────┘    └──┬───┬───┬──┘
                           │              │   │   │
                    ┌──────▼──────┐       │   │   │
                    │ FLOOR 0.1.1 │       │   │   │
                    │ Cellar B1   │       │   │   │
                    │ (dungeon)   │       │   │   │
                    │ depth 3     │       │   │   │
                    └──────┬──────┘       │   │   │
                           │              │   │   │
                    ┌──────▼──────┐       │   │   │
                    │ FLOOR 0.1.2 │       │   │   │
                    │ Cellar B2   │       │   │   │
                    │ (dungeon)   │       │   │   │
                    │ KEY_ITEM: ──┼───────┼───┼───┼──── Gate Key for Floor 3
                    │ Brass Key   │       │   │   │
                    └──────┬──────┘       │   │   │
                           ▲              │   │   │
                    ┌──────┼──────────────▼───┼───┼──┐
                    │      │   FLOOR 1.1      │   │  │
                    │      │   Coral Bazaar   │   │  │
                    │      │   (shop interior) │   │  │
                    │      │   depth 2        │   │  │
                    │      │   Buy/sell cards  │   │  │
                    └──────┼──────────────────┼───┼──┘
                           │                  │   │
                    ┌──────┼──────────────────▼───┼──┐
                    │      │   FLOOR 1.2          │  │
                    │      │   Driftwood Inn       │  │
                    │      │   (inn interior)      │  │
                    │      │   depth 2             │  │
                    │      │   Bonfire: overheal   │  │
                    │      │   Bonfire: replenish  │  │
                    └──────┼──────────────────────┼──┘
                           │                     │
                    ┌──────┼─────────────────────▼──┐
                    │      │   FLOOR 1.3            │
                    │      │   Gleaner's Guild      │
                    │      │   (building interior)  │
                    │      │   depth 2              │
                    │      │                        │
                    │      │   [STAIRS_DN] ─────────┼──► FLOOR 1.3.1 (dungeon)
                    │      │                        │         │
                    │      │   Ascent from          │    FLOOR 1.3.N connects
                    │      │   Floor 0.1.N-1 ◄──────┼──── back to 0.1.N-1
                    └──────┼────────────────────────┘    via stair loop
                           │
                    ┌──────┼─────────────────────────┐
                    │      │   FLOOR 1 → FLOOR 2     │
                    │      │   via BREAKABLE GATE     │
                    │      │   (wall funnel + gate)   │
                    └──────┼─────────────────────────┘
                           │
                    ┌──────▼──────────────────────────┐
                    │            FLOOR 2 ("2")         │
                    │         Lantern Row (exterior)   │
                    │   Narrow street · Facades ·       │
                    │   Non-interactive doors ·         │
                    │   One interactive DOOR → 2.1      │
                    │                                   │
                    │   [BOSS_DOOR] ── locked ── needs  │
                    │   Brass Key from Floor 0.1.2      │
                    └──────┬───────────────┬────────────┘
                           │               │
                    ┌──────▼──────┐ ┌──────▼──────┐
                    │ FLOOR 2.1   │ │ FLOOR 3     │
                    │ Watchman's  │ │ ("3")       │
                    │ Post        │ │ Frontier    │
                    │ (interior)  │ │ Gate        │
                    │ depth 2     │ │ (exterior)  │
                    │             │ │ depth 1     │
                    │ NPC hint:   │ │             │
                    │ "key is in  │ │ Dungeon     │
                    │ the cellar" │ │ proper      │
                    └─────────────┘ │ begins here │
                                    └─────────────┘
```

---

## 3. Floor Registry

Each floor gets a stable hierarchical ID following the EyesOnly convention. The linear `floorNum` is replaced by a **world graph** where floors are registered by ID and connected via named edges (doors, gates, stairs).

### 3.1 Floor Table

| Floor ID | Depth | Type | Biome | Grid | Authored | Label |
|----------|-------|------|-------|------|----------|-------|
| `"0"` | 1 | exterior | exterior | 20×16 | hand | The Approach |
| `"0.1"` | 2 | interior | lobby | 16×12 | hand | Entry Lobby |
| `"0.1.1"` | 3 | dungeon | cellar | 28×28 | proc-gen | Cellar B1 |
| `"0.1.2"` | 3 | dungeon | cellar | 28×28 | proc-gen | Cellar B2 (has Brass Key) |
| `"0.1.3"` | 3 | dungeon | cellar | 30×30 | proc-gen | Cellar B3 |
| `"1"` | 1 | exterior | market | 24×20 | hand | Market Square |
| `"1.1"` | 2 | interior | shop | 12×10 | hand | Coral Bazaar |
| `"1.2"` | 2 | interior | inn | 14×12 | hand | Driftwood Inn |
| `"1.3"` | 2 | interior | guild | 16×12 | hand | Gleaner's Guild |
| `"1.3.1"` | 3 | dungeon | cellar | 28×28 | proc-gen | Guild Cellar |
| `"2"` | 1 | exterior | street | 28×12 | hand | Lantern Row |
| `"2.1"` | 2 | interior | post | 10×8 | hand | Watchman's Post |
| `"3"` | 1 | exterior | frontier | 20×16 | hand | Frontier Gate |

### 3.2 Connection Table (Edges)

| From | Exit Tile | Direction | To | Entry Tile | Gate? |
|------|-----------|-----------|-----|-----------|-------|
| `"0"` | DOOR (9,6) | advance | `"0.1"` | DOOR_EXIT | — |
| `"0"` | DOOR (hidden) | advance | `"1"` | DOOR_BACK | — |
| `"0.1"` | STAIRS_DN (7,4) | advance | `"0.1.1"` | STAIRS_UP | — |
| `"0.1"` | DOOR_EXIT (7,10) | retreat | `"0"` | DOOR | — |
| `"0.1.1"` | STAIRS_DN | advance | `"0.1.2"` | STAIRS_UP | — |
| `"0.1.2"` | STAIRS_DN | advance | `"0.1.3"` | STAIRS_UP | — |
| `"1"` | DOOR | advance | `"1.1"` | DOOR_EXIT | — |
| `"1"` | DOOR | advance | `"1.2"` | DOOR_EXIT | — |
| `"1"` | DOOR | advance | `"1.3"` | DOOR_EXIT | — |
| `"1"` | DOOR (gate wall) | advance | `"2"` | DOOR_BACK | Breakable gate |
| `"1.3"` | STAIRS_DN | advance | `"1.3.1"` | STAIRS_UP | — |
| `"2"` | DOOR | advance | `"2.1"` | DOOR_EXIT | — |
| `"2"` | BOSS_DOOR | advance | `"3"` | DOOR_BACK | Locked (Brass Key) |

### 3.3 Dungeon Loop: 0.1.N ↔ 1.3.N

The deepest cellar floor under the Entry Lobby (`"0.1.N-1"`) connects upward to the Gleaner's Guild (`"1.3"`). This means the player can descend through the tutorial dungeon and ascend into a new building on a different exterior floor. The stair-up on Floor `"0.1.N-1"` leads to Floor `"1.3"` instead of back to `"0.1.N-2"`.

Implementation: The connection is a special-case edge in the world graph. When the player takes STAIRS_UP on the final cellar floor, the world graph resolves the target as `"1.3"` rather than the previous cellar floor. This requires the world graph to override DoorContracts' default stair resolution.

---

## 4. Gate-Contract System

Borrowed from Gone Rogue's `BiomeGateSystem` and `ENVIRONMENT_GATE_CONTRACT.md`. Adapted for Dungeon Gleaner's raycaster-first-person context.

### 4.1 Gate Taxonomy (Dungeon Gleaner)

| Tier | Type | Interaction | Visual | HP/Req |
|------|------|-------------|--------|--------|
| 1 | Breakable | Kick to destroy | Barricade texture on wall tile | 2-4 HP |
| 2 | Locked | Requires key item | Iron gate texture + lock overlay | Key item |
| 3 | NPC | Dialogue/combat | NPC sprite blocking passage | Varies |

Gone Rogue uses emoji-based breakables on a 2D grid. Dungeon Gleaner adapts this to the raycaster: gates are rendered as special wall tiles with a breakable-gate texture. The player kicks the gate (interact key) to damage it. When HP reaches 0, the tile becomes EMPTY and the gate texture is replaced with a debris/rubble texture for one frame before clearing.

### 4.2 Full-Span Rule

Every gate MUST occupy ALL walkable tiles in the passage it guards. In first-person, this means the gate wall must be impassable — no tile gaps. For hand-authored floors, the designer counts the passage width and places gate tiles across the full span. For proc-gen floors, the gate placement algorithm scans the cross-section perpendicular to the corridor and fills every EMPTY tile between walls.

### 4.3 Breakable Gate (Tier 1)

Used between Floor 1 and Floor 2. The Market Square's south wall funnels into a narrow 2-3 tile passage blocked by breakable barricades. The player must kick through (2 HP each, 2 kicks to destroy).

Breakable tile type: `TILES.BREAKABLE` (existing tile constant, value 11). Already blocks movement and LOS.

Properties:
- `hp`: Durability (kicks to destroy)
- `maxHp`: Original durability (for damage ratio audio staging)
- `emoji`: Visual identifier (used in minimap and HUD toast)
- `name`: i18n display name
- `loot`: Optional loot table on destruction

Audio staging (from Gone Rogue `BREAKABLE_AUDIO_SYSTEM.md`):
- 80-100% HP: `attack-5` (light tap)
- 55-80% HP: `attack-4` (solid hit)
- 0-55% HP: `attack-3` (heavy strike)
- Break: `attack-3` + material break SFX + debris echo

### 4.4 Locked Gate (Tier 2)

Used between Floor 2 and Floor 3. A BOSS_DOOR tile that requires the Brass Key from Floor `"0.1.2"`. The existing `FloorTransition._tryUnlockDoor()` system handles this — it checks `Player.hasItemType('key')`, consumes the key, and marks the door unlocked.

The Watchman's Post NPC on Floor `"2.1"` provides a hint: the key is in the cellars beneath the Entry Lobby. This sends the player backtracking through Floor 2 → Floor 1 → Floor 0 → Floor 0.1 → Floor 0.1.1 → Floor 0.1.2.

### 4.5 Floor State Tracking

Borrowed from Gone Rogue's proposed `FloorStateTracker` module. Tracks per-floor state across visits.

State per floor ID:
- `destroyedGates[]`: `{ x, y, type }` — positions remain EMPTY on revisit, never respawn
- `destroyedBreakables[]`: `{ x, y, type, lootTable }` — respawn degraded on revisit
- `visitCount`: Scales enemy respawn density and breakable loot degradation
- `unlockedDoors[]`: `{ x, y }` — building doors stay accessible

Respawn rules:
- Gates: NEVER respawn (permanent EMPTY)
- Breakables: Respawn with 1 HP, degraded loot (visit 2: 50% chance, -1 tier; visit 3+: 25%, -2 tier)
- Enemies: Visit 2 = 50% density, visit 3 = 30%, visit 4+ = 20% (minimum 1)
- Quest items: NEVER respawn (prevents duplicate key generation)

---

## 5. Floor Designs

### 5.1 Floor 0 — The Approach (existing, minor additions)

Keep the existing 20×16 hand-authored grid. Add a hidden DOOR tile on the east or west wall leading to Floor 1. This door is not on the auto-walk path — the player discovers it after completing the first dungeon run or by exploring the courtyard freely.

Changes:
- Add DOOR at (17, 7) or similar east-wall position, behind a pillar so it's not immediately visible
- The auto-walk still targets (9,6) as before
- Player returning from Floor 0.1.N-1 via dungeon loop arrives at Floor 1.3, not Floor 0

### 5.2 Floor 1 — Market Square (new, hand-authored)

24×20 exterior courtyard. Multiple building facades around a central plaza. South wall funnels into a narrow gate passage.

Layout zones:
- **North**: Building row — Coral Bazaar (shop), Driftwood Inn (inn), Gleaner's Guild
- **Center**: Open plaza with bonfire, fountain, decorative pillars
- **South**: Wall funnel narrowing to 2-3 tile passage with breakable gate → Floor 2
- **East**: DOOR_BACK to Floor 0 (hidden approach)

Buildings are WALL tiles with DOOR tiles at their entrances. Each DOOR connects to the building's interior floor (1.1, 1.2, 1.3).

### 5.3 Floor 1.1 — Coral Bazaar (shop interior)

12×10 interior. Single room with shop counter, display shelves, NPC shopkeeper. Uses the existing `Shop` module for buy/sell/sell-parts. Faction: Coral Traders (flame-aligned cards).

- DOOR_EXIT at south → back to Floor 1
- Bonfire: none (shops don't have rest points)
- Special: First shop encounter triggers a brief dialog teaching buy/sell

### 5.4 Floor 1.2 — Driftwood Inn (inn interior)

14×12 interior. Main hall with bonfire (special effects), sleeping quarters (flavor).

- DOOR_EXIT at south → back to Floor 1
- Bonfire at center: **overheal** effect (heals to 150% max HP, decays to 100% over 3 floors)
- Second bonfire (sleeping quarters): **replenish** effect (restores all energy)
- NPC innkeeper provides lore and hints

### 5.5 Floor 1.3 — Gleaner's Guild (building interior)

16×12 interior. Guild hall with STAIRS_DN to dungeon. This is the building whose cellar connects back to Floor 0.1.N-1's dungeon.

- DOOR_EXIT at south → back to Floor 1
- STAIRS_DN at north → Floor 1.3.1 (Guild Cellar)
- STAIRS_UP connection from Floor 0.1.N-1 (dungeon loop endpoint)
- NPC guild master provides quest context

### 5.6 Floor 2 — Lantern Row (new, hand-authored)

28×12 exterior. Narrow street with building facades on both sides. Most doors are non-interactive (decorative WALL tiles that look like doors via texture). One interactive DOOR leads to the Watchman's Post.

- DOOR_BACK at west → back to Floor 1 (through destroyed gate)
- DOOR at east side → Floor 2.1 (Watchman's Post)
- BOSS_DOOR at far east → Floor 3 (requires Brass Key)
- Non-interactive facade doors rendered with `door_wood` texture on WALL tiles
- Lantern props (PILLAR tiles with warm light) line the street

### 5.7 Floor 2.1 — Watchman's Post (interior)

10×8 interior. Small guard post with an NPC who hints about the Brass Key location.

- DOOR_EXIT at south → back to Floor 2
- NPC: Watchman character, dialog: "That gate's been locked since the Hero passed through. The key? Last I heard, it was lost in the cellars beneath the old entry hall."
- Optional breakable: crate containing a minor loot item

### 5.8 Floor 3 — Frontier Gate (exterior, future)

20×16 exterior. The threshold between the tutorial district and the dungeon proper. After this point, the game opens up to proc-gen dungeon floors with permadeath.

- DOOR_BACK at west → back to Floor 2
- DOOR at north → first real dungeon building
- Narrative beat: the player sees the Hero's destruction ahead
- This floor marks the end of the tutorial arc

---

## 6. Hero Reveal — "Cleaning Up After the Hero"

### 6.1 The Moment

When the player first descends to Floor `"0.1.1"` (Cellar B1 — first depth-3 dungeon), they see the Hero's back at the far end of the entry corridor. The Hero is a towering figure (scale 1.5, glow effect, particle trail) walking away from a wake of CORPSE tiles and DEBRIS. This is the narrative hook: the Hero has already been here, slaughtered everything, and left the mess for you.

The player can try to chase the Hero. As they approach, the Hero rounds a corner and vanishes (despawn behind LOS break). An enemy — a wounded Shambling Corpse that survived the Hero's rampage — intercepts the player from a side room. First combat begins.

### 6.2 Hero Entity

The Hero is a special sprite entity, not a real enemy. It uses the existing billboard sprite system with enhanced visuals.

```javascript
var _heroSprite = {
  x: heroX, y: heroY,           // Far end of entry corridor
  emoji: '⚔️',                  // Or custom hero glyph
  name: 'The Seeker',
  scale: 1.5,                   // 2.5× normal enemy size
  facing: 'north',              // Walking AWAY from player
  glow: '#d4af37',              // Gold halo
  glowRadius: 14,
  particleEmoji: '✨',          // Sparkle trail
  tint: 'rgba(200,180,100,0.15)', // Warm legendary tint
  overlayText: null,            // No status — mysterious
  bobY: 0.02,                   // Slight float
  awareness: -1                 // Never engages — always fleeing
};
```

The Hero is pushed into the sprite render list during Floor 0.1.1 generation. It moves 1 tile per 800ms along a pre-scripted path toward the far room, then despawns when it rounds a corner (LOS broken from player position).

### 6.3 Wake of Carnage

The Hero's trail is pre-placed during floor generation:

- **CORPSE tiles** (19) along the entry corridor — 3-5 harvestable corpses. These are the remains of enemies the Hero killed. Each yields loot via `LootTables.getCorpseLoot()` (existing system). This is the player's first loot source — scavenging the Hero's leftovers.
- **DEBRIS tiles** (21, new) interspersed — broken barricades, smashed crates. Visual flavor, walkable.
- **Scattered COLLECTIBLE tiles** (20) — gold coins, a food item. Walk-over pickups.
- **Blood spatter** (visual only) — TextureAtlas overlay for floor tiles in the trail. Dark red-brown stain on stone floor texture.

Floor generation for 0.1.1 hooks into `generateCurrentFloor()`: after GridGen produces the base grid, a post-pass carves the hero trail from STAIRS_UP toward the deepest room, placing CORPSE/DEBRIS/COLLECTIBLE tiles along the path.

### 6.4 Interceptor Enemy

One Shambling Corpse spawns in a side room adjacent to the hero trail corridor. When the player passes (chasing the Hero), the corpse steps into the corridor behind or beside the player, triggering proximity combat.

Properties:
- `name`: "Wounded Shambler"
- `hp`: 3 (reduced from standard 5 — wounded by the Hero)
- `str`: 2
- `awareness`: 150 (ALERTED — already knows player is here)
- `ambush`: false (player sees it step out, no ambush penalty)

This is the player's first combat. It must be winnable but tight (see Section 7: Economy Tuning).

### 6.5 Scripted Sequence

1. **Descent transition** — TransitionFX `descend` preset plays. Label: "Cellar B1".
2. **Spawn** — Player appears at STAIRS_UP, facing into the corridor. Hero sprite is visible ~8 tiles ahead, walking away. Corpses and debris line the floor between.
3. **Dialog trigger** (auto, 1.5s delay) — DialogBox shows: *"Something massive came through here. The walls are gouged, the floor is littered with... remains. A figure moves in the darkness ahead."*
4. **Player gains control** — Can loot corpses, collect pickups, or chase.
5. **Hero movement** — Hero walks at 800ms/tile. When player closes to within 4 tiles, Hero speeds up to 500ms/tile. When Hero reaches the corner room, it despawns. A faint `ascend-3` SFX plays (the Hero went deeper).
6. **Interceptor triggers** — When player passes the side room (y-coordinate check), the Wounded Shambler steps out. CombatBridge.startCombat() fires.
7. **Post-combat** — Player loots the Shambler. Dialog auto-triggers: *"That thing was already half-dead. Whatever came through here... you don't want to catch up to it."*

### 6.6 Implementation Notes

- The Hero sprite uses the existing `_renderSprites()` pipeline in raycaster.js. No new rendering code needed — just a large-scale entity with glow.
- Hero movement is tick-driven (like IntroWalk but for an NPC): a `HeroWalk` controller queues grid moves on a timer. It reads MovementController's timing constants but operates on the hero entity, not the player.
- The interceptor enemy uses standard EnemyAI spawning but with overridden stats (wounded HP) and pre-set high awareness.
- The CORPSE tiles are already in the tile system (value 19). They're walkable and interactive — the existing `_tryInteractCorpse()` handles loot.
- Floor 0.1.1 is the ONLY floor with the hero trail. Deeper floors (0.1.2+) are standard proc-gen.

---

## 7. Economy Tuning — Kenshi Scavenger Start

### 7.1 Design Philosophy

The player is a Nez-Ha (scavenger-cleaner), not a warrior. They start with garbage-tier equipment and must build up through looting corpses, selling salvage, buying better cards, and returning to the dungeon better equipped each time. Think Kenshi: your first fight is nearly fatal, you limp home, sell what you found, buy one slightly better weapon, go back.

The tutorial world is designed for 3-5 scavenge loops before the player is equipped to handle multiple dungeon floors:

1. **Loop 1**: Enter dungeon → loot hero's corpse trail → first combat (barely survive) → retreat to lobby bonfire → exit to Market Square → sell loot at Coral Bazaar → buy 1 card upgrade
2. **Loop 2**: Re-enter dungeon → fight 1-2 enemies with new card → find more loot → retreat → sell → buy → maybe visit inn for overheal
3. **Loop 3**: Push deeper into B1, maybe reach B2 → find Brass Key (or miss it) → retreat with key + loot → sell → stronger now
4. **Loop 4-5**: Clear B2-B3, ascend to Guild → have enough cards to handle Market Square breakable gate → push to Lantern Row

### 7.2 Starting Deck — Card Lean

The current 10-card starter deck is too generous. Reduce to **5 cards** — just enough to survive one fight if played perfectly.

**Starter deck (5 cards):**

| Card | Suit | Cost | Damage | Heal | Notes |
|------|------|------|--------|------|-------|
| Rusty Slash | ♠ Storm | 0 | 2 | — | Bread-and-butter attack. 2 dmg vs player STR 2 = total 4 |
| Patch Up | ♥ Wild | 0 | — | 2 | Emergency heal. Reduced from 3 to 2 |
| Cinder Poke | ♦ Flame | 0 | 1 | — | Weak flame attack. Suit advantage vs ♣ Frost enemies |
| Frost Shard | ♣ Frost | 0 | 1 | — | Weak frost attack. Suit advantage vs ♦ Flame enemies |
| Scavenge | ♠ Storm | 0 | — | — | Draw 1 card from deck. Utility — no damage but refills hand |

Total offensive power per hand: 4 damage (Rusty Slash 2 + Cinder Poke 1 + Frost Shard 1). With STR 2 base, first swing does ~4 damage. A Shambling Corpse (HP 5) needs 2 rounds minimum. Player takes 2 damage per enemy round (STR 2). With 10 HP and 2 healing from Patch Up, player survives ~5 rounds. A 2-round fight is tight but winnable.

**The "card lean" effect:**
- 5-card hand means no card selection — you play everything. No strategic choice, just survival.
- Buying a 6th card at the shop is the first meaningful upgrade — now you have options.
- By card 8-10, you start making real synergy pairs. The swipe-drop system clicks.
- The deck grows through loot (corpse drops, chest cards) and shop purchases.

### 7.3 Enemy Tuning — First Cellar Floor

Floor 0.1.1 should feel dangerous. The Hero's corpse trail provides free loot, but the few surviving enemies are a real threat.

**Floor 0.1.1 enemy population (reduced):**
- 2-3 enemies total (down from standard 4-6)
- 1 Wounded Shambler (HP 3, STR 2) — scripted interceptor, first fight
- 1 Dungeon Rat (HP 2, STR 1) — easy second encounter, builds confidence
- 0-1 Cobweb Crawler (HP 3, STR 1) — optional, in a side room

**Combat math — Wounded Shambler (first fight):**

| Round | Player action | Player dmg dealt | Enemy dmg dealt | Player HP |
|-------|--------------|-----------------|----------------|-----------|
| Start | — | — | — | 10 |
| 1 | Rusty Slash + Cinder Poke | 4 (2+1+1 STR) | 2 | 8 |
| 2 | Frost Shard + Scavenge → draw | 1 + drawn card? | 2 | 6 |

If drawn card is another attack (1-2 dmg), total dealt = 5-6 → Shambler (HP 3) dies in round 1-2. Player ends at 6-8 HP. Tight but safe.

**Without suit advantage (worst case):**
- Shambler is ♠ Storm, player's ♠ cards get no advantage (×1.0)
- Player deals 4 in R1, Shambler survives (HP 3 - check: with STR 2 + card dmg 2 + stack bonus, actually kills)
- Hmm — need to verify exact formula. Key tuning lever: stack bonus (+1 per extra card in stack)

**Critical: the Shambler must survive Round 1.** If it dies in one action, there's no tension. Tuning options:
- Set Shambler HP to 5 (standard) instead of 3 (wounded). Makes it a real fight.
- Or: keep HP 3 but disable stack bonus for tutorial fight.
- Recommendation: HP 4, STR 2. Player needs 2 rounds, takes 2-4 damage. Retreats with 6-8 HP.

### 7.4 Loot Economy — Scavenge Loop Pacing

The key insight: the player must need multiple trips. Each trip yields enough loot to buy ONE upgrade (card or potion), not enough to fully equip.

**Hero corpse trail (Floor 0.1.1, first visit only):**
- 3 CORPSE tiles: each drops 10-25 gold + 30% chance of a common card
- 2 COLLECTIBLE walk-overs: 10 gold each, 1 food item (heals 3 HP)
- Total haul: ~50-85 gold + 0-1 cards + 1 food

**Shop prices (Coral Bazaar, Floor 1.1):**
- Common card: 40-60 gold
- Uncommon card: 80-120 gold
- Health potion: 30 gold (heals 5 HP)
- Food item: 15-20 gold (heals 2-3 HP)

**Loop 1 math:**
- Player loots ~65 gold average from hero trail + shambler combat
- Buys: 1 common card (50g) + 1 food (15g) = 65g
- Now has 6 cards and 1 food. Meaningfully stronger for loop 2.

**Loop 2:**
- Re-enters dungeon. Hero corpses are gone (first-visit only). Breakables respawn degraded.
- Fights 2 enemies (Rat + Crawler). Wins more comfortably with 6-card deck.
- Loots ~40-60 gold from combat + breakables.
- Buys: 1 uncommon card (if saved) or 1 common + potions.
- Now has 7 cards. Starting to make synergy pairs.

**Loop 3-4:**
- Pushes to Floor 0.1.2. Harder enemies (Bone Guard HP 4, STR 2). More loot.
- Finds Brass Key in breakable or chest.
- Has 8-10 cards — deck approaching original starter size, but earned not given.
- Can comfortably handle Floor 0.1.3 and the breakable gate on Floor 1.

### 7.5 Bonfire Economy

Bonfires are the player's safety net. They must be spaced so the player can reach one before dying, but far enough apart that each dungeon run feels risky.

| Location | Floor | Effect |
|----------|-------|--------|
| The Approach | 0 | Standard rest: heal to full, save checkpoint |
| Entry Lobby | 0.1 | Standard rest: heal to full, save checkpoint |
| Driftwood Inn | 1.2 | **Overheal**: heal to 150% max HP (decays to 100% over 3 floors) |
| Driftwood Inn (quarters) | 1.2 | **Replenish**: restore all energy |
| Frontier Gate | 3 | Standard rest: save before dungeon proper |

No bonfire inside the dungeon (depth 3). The player must surface to heal. This drives the scavenge loop — push as deep as you dare, then retreat to the lobby bonfire. The inn's overheal is a luxury: costs a trip to Floor 1 but lets you go deeper next run.

### 7.6 Death Semantics — Scavenge Penalty

At depth 1-2 (exterior/building), death is non-lethal: respawn at last bonfire with a penalty.

**Death penalty (non-lethal):**
- Lose 50% of carried gold
- Lose 1 random card from hand (not deck — hand only)
- HP restored to 50% of max
- Energy restored to 50% of max

This is punishing enough to make the player cautious but not devastating. Losing gold means fewer shop purchases. Losing a card from hand means the next fight is weaker. The player learns to retreat before dying.

At depth 3 (dungeon), death is permadeath: game over screen, full reset. But the tutorial cellars are shallow enough (3 floors) that the player should learn to retreat before this happens.

### 7.7 Tuning Levers Summary

| Parameter | Current | Proposed | File | Notes |
|-----------|---------|----------|------|-------|
| Starter deck size | 10 | **5** | data/cards.json (starterDeck flag) | Remove 5 cards from starter pool |
| Player starting HP | 10 | 10 | engine/player.js | Keep — tight enough with 5 cards |
| Player STR | 2 | 2 | engine/player.js | Keep — low base damage |
| Shambling Corpse HP | 5 | **4** | data/enemies.json | Wounded variant for tutorial interceptor |
| Dungeon Rat HP | 2 | 2 | data/enemies.json | Keep — easy confidence builder |
| Corpse loot gold | varies | **10-25** | data/loot-tables.json | Per-corpse, hero trail only |
| Common card price | varies | **40-60** | engine/shop.js | Tuned so 1 trip ≈ 1 card |
| Hero trail corpse count | 0 | **3-5** | Floor 0.1.1 generation | First-visit only |
| Floor 0.1.1 enemy count | 4-6 | **2-3** | EnemyAI spawn params | Reduced for scavenge floor |
| Bonfire HP restore | 100% | 100% | engine/player.js | Keep — full heal on surface |
| Non-lethal death gold loss | 0% | **50%** | engine/game-over-screen.js | New mechanic |
| Non-lethal death card loss | 0 | **1 from hand** | engine/game-over-screen.js | New mechanic |

---

## 8. FloorManager Redesign

### 8.1 World Graph Registry

Replace the linear `floorNum → ID` mapping with a `WorldGraph` module that registers floors by ID and connects them via typed edges.

```javascript
var WorldGraph = (function () {
  'use strict';

  var _floors = {};  // id → { id, depth, type, biome, builder, contract, label }
  var _edges = [];   // { from, to, exitTile, entryTile, direction, gate }
  var _current = null;

  function register(id, config) {
    _floors[id] = Object.freeze({
      id: id,
      depth: id.split('.').length,
      type: config.type,         // 'exterior' | 'interior' | 'dungeon'
      biome: config.biome,
      builder: config.builder,   // function() → floorData
      contract: config.contract, // function() → SpatialContract
      label: config.label
    });
  }

  function connect(from, to, edge) {
    _edges.push({
      from: from,
      to: to,
      exitTile: edge.exitTile,      // TILES constant
      entryTile: edge.entryTile,    // TILES constant on target
      direction: edge.direction,    // 'advance' | 'retreat'
      gate: edge.gate || null       // { type: 'breakable'|'locked', ... }
    });
  }

  function resolve(fromId, exitTile, direction) {
    for (var i = 0; i < _edges.length; i++) {
      var e = _edges[i];
      if (e.from === fromId && e.exitTile === exitTile && e.direction === direction) {
        return _floors[e.to];
      }
    }
    return null;
  }

  // ...
})();
```

### 8.2 Migration Path

The current `floorNum`-based system is deeply wired through FloorManager, FloorTransition, DoorContracts, Minimap, HUD, and Game. A full rewrite is risky this close to jam deadline.

**Phased migration:**

1. **Phase A (jam-safe)**: Keep `floorNum` for the linear dungeon chain (floors 0 → 0.1 → 0.1.1 → 0.1.2 ...). Add a parallel `_worldFloors` registry for non-linear connections. The `floorId()` function checks `_worldFloors` first, falls back to linear mapping.

2. **Phase B (post-jam)**: Replace `floorNum` with world graph throughout. FloorTransition.go() takes a floor ID instead of a number. DoorContracts resolves spawn via the connection edge.

### 8.3 Tile Constants

**Existing (reuse):**
- `BREAKABLE` (11) — already defined, blocks movement, blocks LOS. Used for kickable gate/prop tiles.
- `BOSS_DOOR` (14) — already defined, used for locked gates requiring key items.

**New constants to add:**

| Name | Value | Purpose |
|------|-------|---------|
| DEBRIS | 22 | Destroyed breakable remnant (walkable, visual only) |
| FACADE_DOOR | 23 | Non-interactive decorative door (impassable, door texture) |

Add to `engine/tiles.js` (after TREE: 21):
```javascript
DEBRIS:       22,
FACADE_DOOR:  23
```

Update `TILES.isWalkable()` to include DEBRIS (walkable). FACADE_DOOR and BREAKABLE remain impassable (already excluded). Update `TILES.isOpaque()` to include FACADE_DOOR (blocks LOS like a wall).

---

## 9. Implementation Phases

### Phase 1: Gate System Foundation (2-3 hours)

**New files:**
- `engine/breakable-system.js` — IIFE module: breakable HP tracking, kick damage, destruction, loot spawn, audio staging
- `engine/floor-state-tracker.js` — IIFE module: per-floor state persistence (destroyed gates, breakables, visit count)

**Modified files:**
- `engine/tiles.js` — Add DEBRIS (21), FACADE_DOOR (22); update isWalkable() and isOpaque()
- `engine/floor-manager.js` — Wire FloorStateTracker into generation (check/apply state on revisit)
- `engine/input.js` — Add kick interaction (F key on breakable tile)
- `index.html` — Add script tags

**Verification:** Place a breakable gate in Floor 0.1, kick it, advance to dungeon, retreat — gate should be gone.

### Phase 2: Floor 1 — Market Square (3-4 hours)

**New files:**
- `engine/world-floors.js` — Hand-authored Floor 1 grid (24×20 market square) + building facades

**Modified files:**
- `engine/floor-manager.js` — Register Floor 1 as exterior, add to floorId mapping, add builder
- `engine/floor-manager.js` — Add hidden DOOR in Floor 0 grid connecting to Floor 1
- `engine/spatial-contract.js` or `floor-manager.js` — Add 'market' biome contract (exterior, different palette)

**Verification:** Walk to hidden door in Floor 0, enter Floor 1, see market square with building facades.

### Phase 3: Building Interiors (2-3 hours)

**New files:**
- `engine/world-floors.js` — Add Floor 1.1 (shop), 1.2 (inn), 1.3 (guild) grids

**Modified files:**
- `engine/floor-manager.js` — Register floors 1.1-1.3, wire DOOR connections
- `engine/shop.js` — Wire shop interaction for Floor 1.1
- `engine/player.js` — Add overheal/replenish bonfire effects for Floor 1.2

**Verification:** Enter each building from Floor 1, interact with shop/bonfire/NPC, exit back to Floor 1.

### Phase 4: Breakable Gate Passage (1-2 hours)

**Modified files:**
- `engine/world-floors.js` — Floor 1 south wall funnel with BREAKABLE tiles
- `engine/breakable-system.js` — Wire gate destruction → floor state tracker

**Verification:** Kick through breakable gate on Floor 1 south wall, enter Floor 2, retreat — gate is still destroyed.

### Phase 5: Floor 2 — Lantern Row + Key Quest (2-3 hours)

**New files:**
- `engine/world-floors.js` — Add Floor 2 grid (28×12 narrow street), Floor 2.1 grid (10×8 post)

**Modified files:**
- `engine/floor-manager.js` — Register floors, wire connections
- `data/items.json` — Add Brass Key item definition
- Dungeon generation for Floor 0.1.2 — ensure Brass Key spawns in loot table or breakable

**Verification:** Enter Floor 2, find BOSS_DOOR locked, enter Watchman's Post for hint, backtrack to Floor 0.1.2, find Brass Key, return to Floor 2, unlock BOSS_DOOR, enter Floor 3.

### Phase 6: Dungeon Loop (1-2 hours)

**Modified files:**
- `engine/floor-manager.js` — Special-case stair resolution: STAIRS_UP on Floor 0.1.N-1 → Floor 1.3
- `engine/door-contracts.js` — Handle cross-building stair connections

**Verification:** Descend full dungeon chain under Entry Lobby, ascend from deepest floor, arrive at Gleaner's Guild (Floor 1.3), exit to Market Square (Floor 1).

### Phase 7: Hero Reveal + Economy Tuning (2-3 hours)

**New files:**
- `engine/hero-walk.js` — IIFE module: scripted Hero NPC movement controller (tick-driven, flee-on-approach)

**Modified files:**
- `engine/floor-manager.js` — Floor 0.1.1 post-gen pass: carve hero trail (CORPSE, DEBRIS, COLLECTIBLE tiles), spawn Hero sprite, spawn Wounded Shambler interceptor
- `engine/game.js` — Push Hero sprite into render list, manage despawn on LOS break
- `data/cards.json` — Reduce starterDeck flags from 10 to 5 cards
- `data/enemies.json` — Add "Wounded Shambler" variant (HP 4, STR 2)
- `engine/player.js` — Wire non-lethal death penalty (50% gold loss, 1 card from hand)
- `engine/game-over-screen.js` — Implement non-lethal death flow for depth 1-2

**Verification:** Descend to Floor 0.1.1, see Hero walking away with corpse trail. Chase Hero. Get intercepted by Wounded Shambler. Win with 5-card starter deck at 6-8 HP remaining. Loot corpses, sell at shop, buy 1 card. Re-enter stronger.

### Phase 8: Polish + NPC Dialogs (1-2 hours)

- Wire NPC dialogs (Watchman hint, Innkeeper lore, Guild Master quest)
- Add non-interactive facade door textures to Floor 2
- Add minimap labels for all floors
- Tune shop prices for scavenge loop pacing (1 trip ≈ 1 card purchase)
- Test full player journey end-to-end including 3-5 scavenge loops

---

## 10. Player Journey (Expected Flow)

**First session (scavenge loops 1-2):**

1. **Spawn** on Floor 0, The Approach. Auto-walk north toward building.
2. **Enter** Floor 0.1, Entry Lobby via DOOR. Auto-walk ends, free movement begins.
3. **Explore** lobby. Find bonfire, find STAIRS_DN.
4. **Descend** to Floor 0.1.1 (Cellar B1). See the Hero's back — towering gold-glowing figure walking away through a corridor of corpses and debris. Dialog: *"Something massive came through here..."*
5. **Loot** hero's corpse trail — 3-5 CORPSE tiles yield gold + maybe a card. Collect floor pickups.
6. **Chase** the Hero. Hero speeds up and vanishes around corner.
7. **Intercepted** by Wounded Shambler from side room. First combat with 5-card starter deck. Barely survive (6-8 HP remaining).
8. **Retreat** to Entry Lobby bonfire. Heal to full.
9. **Exit** to Floor 0, discover hidden door to Floor 1, Market Square.
10. **Sell** loot at Coral Bazaar (Floor 1.1). Buy 1 common card (~50 gold). Now have 6 cards.
11. **Rest** at Driftwood Inn (Floor 1.2) for overheal. Now at 15 HP.

**Second session (scavenge loops 3-4):**

12. **Re-enter** dungeon via Entry Lobby. Hero corpses gone (first-visit only). Fight Dungeon Rat, Cobweb Crawler. Win more comfortably with 6-card deck.
13. **Push** to Floor 0.1.2 (Cellar B2). Harder enemies. Find Brass Key in chest/breakable.
14. **Retreat**, sell, buy. Now have 8-10 cards. Starting to make synergy pairs with swipe-drop.

**Third session (progression):**

15. **Clear** remaining cellar floors. **Ascend** from deepest cellar → arrive at Gleaner's Guild (Floor 1.3). Dungeon loop complete.
16. **Kick through** breakable gate on Floor 1 south wall → enter Floor 2, Lantern Row.
17. **Find** BOSS_DOOR locked. Visit Watchman's Post for hint. If missed Brass Key, backtrack to Floor 0.1.2.
18. **Unlock** BOSS_DOOR. Enter Floor 3, Frontier Gate. Tutorial arc complete.

**Alternate path:** Player discovers hidden door to Floor 1 early, explores market before dungeon. Still needs to enter dungeon for loot/cards to afford anything. The economy enforces the scavenge loop regardless of exploration order.

---

## 11. Gone Rogue Patterns Borrowed

| Pattern | Gone Rogue Source | Dungeon Gleaner Adaptation |
|---------|-------------------|----------------------------|
| Breakable gate HP + kick damage | `biome-gate-system.js` | `breakable-system.js` — same HP/damage model, adapted for first-person kick |
| Full-span gate rule | `ENVIRONMENT_GATE_CONTRACT.md` §4 | All gate passages must be fully blocked — no bypasses |
| Floor state tracker | `ENVIRONMENT_GATE_CONTRACT.md` §7 | `floor-state-tracker.js` — same API, adapted for hierarchical floor IDs |
| Gate respawn rules | `ENVIRONMENT_GATE_CONTRACT.md` §7.2 | Gates never respawn; breakables degrade; enemies reduce |
| Tutorial gate placement | `biome-gate-system.js::placeTutorialGate()` | Adapted for hand-authored grids (no random placement) |
| Locked gate (Tier 2) | `locked-gate-system.js` | Uses existing BOSS_DOOR + `_tryUnlockDoor()` system |
| Audio staging by damage ratio | `BREAKABLE_AUDIO_SYSTEM.md` | Three-tier SFX progression based on HP% |
| Cleared path guarantee | `ENVIRONMENT_GATE_CONTRACT.md` §10 | Backtracking through destroyed gates is always safe |

---

## 12. Jam Timeline Risk Assessment

**Total estimated work: 15-24 hours** across 8 phases.

**Jam deadline: April 5, 2026** (~9 days remaining from March 27).

**Risk mitigation:**
- Phases 1-4 are the structural critical path (8-12 hours). These deliver the gate system, Floor 1, buildings, and the breakable gate passage.
- Phase 7 (Hero reveal + economy tuning) is the FEEL critical path (2-3 hours). Without it the game plays but has no narrative hook and no scavenge tension. Prioritize this alongside Phase 1.
- Phases 5-6 (key quest + dungeon loop) can be deferred if time is tight. The game is playable without the Floor 2/3 progression — the tutorial ends at Floor 1's breakable gate.
- Phase 8 (polish) is nice-to-have.
- If extremely pressed: skip Floors 2-3 entirely, make the breakable gate on Floor 1 lead directly to the dungeon proper (Floor 1.3.1+). This gives the gate mechanic without the key quest backtracking.
- Economy tuning (starter deck reduction, shop prices) can be done independently of world graph changes — it's just data edits to cards.json, enemies.json, and shop.js.

**Dependencies on existing systems:**
- DoorContracts: works as-is for DOOR ↔ DOOR_EXIT resolution
- FloorTransition: works as-is for BOSS_DOOR unlock flow
- DoorContractAudio: already has `1:1_up` / `1:1_down` keys for exterior↔exterior transitions (Floor 0 ↔ Floor 1), `1:2` / `2:1` for exterior↔building, `2:3` / `3:2` for building↔dungeon
- SpatialContract: needs new biome presets (market, street, inn) but follows existing patterns
- BREAKABLE tile (11): already defined in tiles.js, blocks movement + LOS — ready for gate use
- Shop: works as-is, just needs to be wired to Floor 1.1
- Combat/Cards: no changes needed

---

## 13. Gleaner Pivot — Dungeon Maintenance Systems

The Dungeon Gleaner pivot expands the scavenging period (Act 1) into the core game loop. The player is a dungeon janitor earning a living cleaning dungeons, restocking crates, re-arming traps, reassembling monsters, and scrambling puzzles — all so the Necromancer can reset the dungeon for the next batch of Hero adventurers.

Three interlocking gameplay loops drive the experience:

### 13.1 The Cleaning Loop (Grid-by-Grid Tile Maintenance)

Every wall and floor tile has a **condition state**: `pristine`, `dirty`, `damaged`, `destroyed`. Heroes leave the dungeon in `dirty`/`damaged` state. The Gleaner scrubs tiles grid-by-grid using the interact key (F) or Magic Remote pointer.

**Tile condition flow:**
```
pristine ←── clean ←── dirty ←── damaged ←── destroyed
    ↑                     ↑          ↑             ↑
    │              (Hero walks    (Hero         (Hero
    │               through)     attacks)      smashes)
    └──── Gleaner scrubs ────────────────────────────┘
```

**Cleaning interaction:**
- Face a dirty/damaged tile → interact prompt: `[F] Scrub` / `[F] Repair`
- Each scrub takes ~400ms (one movement tick). Damaged tiles require 2 scrubs (repair → clean).
- Cleaning a tile pops 1 coin (walk-over collectible spawns behind the player).
- A floor's **cleanliness percentage** is tracked by FloorStateTracker: (clean+pristine tiles) / total tiles.
- Reaching 80% cleanliness on a floor triggers a bonus coin burst (10-20 coins) and unlocks the next work order.

**Texture system:**
- `texture-atlas.js` already generates 64×64 wall textures. Each base texture gets 3 variants:
  - `_clean` — default, untouched
  - `_dirty` — overlaid with grime/scorch marks (procedural noise layer)
  - `_damaged` — cracked/broken texture variant (deeper noise + rubble overlay)
- Floor tiles similarly have clean/dirty/damaged variants rendered in the raycaster floor-cast pass.

**Implementation:**
- New field on tile data: `condition: 'pristine'|'dirty'|'damaged'|'destroyed'`
- `interact-prompt.js` ACTION_MAP: add DIRTY→scrub, DAMAGED→repair
- `floor-state-tracker.js`: track `cleanTiles` count per floor
- `texture-atlas.js`: add `generateDirtyVariant(baseTexture)` and `generateDamagedVariant(baseTexture)` functions that overlay procedural noise on the base 64×64 canvas

### 13.2 The Restocking Loop (Crate Slot Economy)

This is the primary economic engine. Crates (and other breakable containers) have **slots** that the player fills with items. The reward system follows a Kingdom Two Crowns abstraction: coins are the ambient drip, rare combat cards are the jackpot.

**Two interaction states for breakables (toggled via Gleaner's Apron equip):**

| State | Verb | Action | Result |
|-------|------|--------|--------|
| **Scavenger** (default) | Smash | Destroy container | Spills hydrated items as walk-over loot |
| **Gleaner** (apron equipped) | Open | Opens slot UI | Fill empty slots → seal → reward |

**Crate slot anatomy:**
- Each crate has 2–5 slots (average 3). Rolled at floor generation time.
- Each slot has a **frame tag** indicating the ideal item category: `hp_food`, `energy_food`, `battery`, `potion`, `scroll`, `weapon`, `gem`, `wildcard`.
- Frame tags map directly to resource colors (from RESOURCE_COLOR_SYSTEM):
  - `hp_food` → ♥ Pink `#FF6B9D` frame border
  - `energy_food` → △ Blue `#00D4FF` frame border
  - `battery` → ◈ Green `#00FFA6` frame border
  - `potion` → ♥ Pink `#FF6B9D` (heals HP, shares food color)
  - `scroll` → 🂠 Purple `#800080` frame border
  - `weapon` → element-colored frame (🔥 `#FF6030`, ❄️ `#60C8FF`, ⚡ `#C060FF`)
  - `gem` → ¢ Gold `#FFFF00` frame border
  - `wildcard` → white frame (accepts anything at base rate)

**Natural hydration:**
- Slots spawn partially filled ("naturally hydrated") — the Hero looted some but not all.
- Hydration formula: `filledSlots = floor(totalSlots × random(0.3, 0.7))`
- A 4-slot crate might spawn with 1–2 slots pre-filled and 2–3 empty.
- Hydrated items are genre-appropriate (the crate contained real loot before the Hero raided it).

**Filling slots:**
- Player opens crate in Gleaner mode → sees slot UI (row of framed boxes on HUD, rendered via canvas).
- Drag item from bag → drop on matching slot frame. Uses existing swipe-drop gesture system from card-fan.js.
- ANY item fills ANY slot. The frame is a hint, not a gate.

**Reward math (Kingdom-simple):**

| Action | Coin Yield | Notes |
|--------|-----------|-------|
| Fill slot (mismatched frame) | 1 coin | Bone in a potion frame, still works |
| Fill slot (matched frame) | 2–3 coins | Proper potion in potion frame |
| Fill slot (rare+ item matched) | 3–5 coins | Uncommon/rare item in matching frame |
| Seal crate (all slots filled) | Flat 5 coin bonus | Always awarded on seal |
| Seal reward roll | See table below | Chance-based bonus on seal |

**Seal reward table (rolled once per crate seal):**

| Roll (d100) | Reward | Frequency |
|-------------|--------|-----------|
| 01–50 | Nothing extra | Common |
| 51–75 | +5 bonus coins | Uncommon |
| 76–88 | Common combat card | Rare |
| 89–95 | Uncommon combat card | Very rare |
| 96–99 | Rare combat card | Ultra rare |
| 00 | **Legendary combat card** | Mythic (~1%) |

**Legendary card rumors:**
- NPCs in shops and the Gleaner's Guild occasionally mention legendary cards by name: *"Old Marrek swears he got a Dragon Scale from a perfectly restocked crate in the Ironhold. Could be rum talking."*
- These rumors serve as soft goals — the player chases the gacha pull through labor.
- Legendary cards are named, unique, and combat-defining (e.g., "Dragon Scale" = massive AoE flame damage).

**Shop round-trip loop:**
1. Enter dungeon with empty bags
2. Restock crates with dungeon junk (bones, mushrooms) → modest coin yield (1 per slot)
3. Exit to surface with coins, empty bags
4. Buy proper ingredients at Coral Bazaar / surface shops (potions, scrolls, food matching frame tags)
5. Re-enter dungeon, restock with matching items → better yield (2–3 per slot + higher seal bonus)
6. Repeat with increasing efficiency as player learns which frames appear on which floors

**Multiple paths to success:**
- **Pure Scavenger**: Never restocks. Smashes everything, loots hydrated items, scrapes by with dungeon-found cards. Viable but slow.
- **Casual Filler**: Stuffs bones in every slot. Gets 1 coin per fill, modest seal bonuses. Steady income.
- **Frame Optimizer**: Shops for matching items, maximizes per-slot yield. Fastest card accumulation.
- **All three converge**: every player eventually builds a combat deck, just at different rates.

### 13.3 The Dungeon Reset Loop (Readiness Score)

Each dungeon floor has a **readiness score** (0–100%) that measures how prepared it is for the next Hero run. The Necromancer pays the Gleaner based on readiness when a floor is "submitted" (all tasks complete).

**Readiness components (weighted):**

| Task | Weight | Description |
|------|--------|-------------|
| Tile cleanliness | 25% | % of floor tiles at clean or pristine |
| Crates restocked | 25% | % of crates fully sealed |
| Traps re-armed | 15% | % of trap tiles restored to armed state |
| Puzzles scrambled | 15% | % of puzzle mechanisms returned to unsolved state |
| Monsters reassembled | 10% | % of corpse tiles converted to reassembly points |
| Secrets restored | 10% | % of invisible walls / hidden doors reset |

**Work orders:**
- The Gleaner's Guild (Floor 1.3) issues **work orders** — per-floor task lists displayed on a board.
- Each work order specifies the target floor and minimum readiness threshold (60% for early floors, 80% for later).
- Completing a work order pays a flat gold reward + unlocks the next floor's work order.
- Work orders are the primary progression gate (replacing breakable gates from the original roadmap).

**Task interactions:**

**Trap re-arming:**
- Disarmed trap tiles (the Hero triggered them) show as `TRAP_DISARMED`.
- Interact → mini-interaction: place a trap component (from bag) into the mechanism.
- Trap components are sold at the Foundry shop or looted from construct enemies.
- Re-armed traps are a hazard to the player on revisit if they forget where they placed them (environmental comedy).

**Puzzle scrambling:**
- Solved puzzles (lever sequences, pressure plates, block positions) need to be returned to their unsolved state.
- Interact with solved puzzle → "Scramble" verb → puzzle state resets to a new randomized unsolved configuration.
- No items required — just time and grid traversal.

**Monster reassembly:**
- CORPSE tiles left by the Hero contain scattered monster parts.
- In Gleaner mode, interact with CORPSE → collect parts (uses existing `salvage.js` harvest flow).
- Carry parts to a **Reassembly Altar** (new tile type, placed in specific rooms).
- Interact with altar → deposit parts → the Necromancer revives the monster off-screen.
- Reassembled monsters appear as patrolling enemies on the floor's next "Hero cycle" (not hostile to the Gleaner — they're coworkers).

**Secret restoration:**
- Hidden doors and invisible walls that the Hero discovered need to be "re-hidden."
- Interact with exposed secret → "Conceal" verb → wall texture restored, passage hidden again.
- The comedy: you're literally re-hiding secrets that adventurers will "discover" again.

---

## 14. Hero Path System — Routes, AI & Stealth

Heroes are the dungeon's environmental hazard. They roam on scripted patrol routes, smashing crates, solving puzzles, triggering traps, killing monsters, and looting everything. The Gleaner must avoid them or hide.

### 14.1 Hero Types

| Hero | Class | Behavior | Threat Level | Trail |
|------|-------|----------|-------------|-------|
| The Seeker | Fighter | Charges straight through, smashes everything | High | Debris + corpses everywhere |
| The Scholar | Mage | Methodical, solves puzzles, opens secrets | Medium | Solved puzzles, exposed secrets |
| The Shadow | Rogue | Stealthy, loots chests/crates without smashing | Low | Empty crates, missing items |
| The Crusader | Paladin | Hunts undead specifically, ignores traps | High | Destroyed undead, blessed tiles |

### 14.2 Hero Patrol Routes

Heroes follow pre-scripted **patrol routes** through the dungeon. Routes are generated per floor based on the floor graph (room connectivity).

**Route generation:**
1. Hero enters at STAIRS_DN (same entry as player).
2. Pathfind through all rooms in exploration order (largest rooms first — the Hero wants fights).
3. Hero interacts with every interactable tile on their path: smashes breakables, solves puzzles, kills enemies, loots chests, triggers traps (if Fighter), avoids traps (if Rogue).
4. Hero exits via STAIRS_UP after ~3-5 minutes of patrol (real time, tick-driven at 800ms/tile like existing HeroWalk).
5. Route is saved and visible on minimap as a faded trail (post-patrol) so the player can see where damage occurred.

**Hero timing:**
- Heroes arrive on a **cycle timer** (configurable per floor, default: every 10 minutes of play time on that floor).
- A warning signal precedes arrival: distant footsteps SFX + screen edge pulse + Toast: *"Footsteps echo from above..."*
- Player has ~30 seconds between warning and Hero entry to hide or finish current task.

**Hero interactions with the dungeon (per tile type):**

| Tile | Hero Action | Result for Gleaner |
|------|-------------|-------------------|
| BREAKABLE (crate/barrel) | Smash | Contents spill, container destroyed. Must be rebuilt. |
| CHEST | Loot all | Chest emptied. Must be restocked. |
| TRAP (armed) | Trigger / dodge (class-dependent) | Trap disarmed. Must re-arm. |
| PUZZLE (unsolved) | Solve | Puzzle solved. Must re-scramble. |
| SECRET (hidden) | Discover | Secret exposed. Must re-conceal. |
| ENEMY (monster) | Fight & kill | Corpse tile appears. Must reassemble. |
| CLEAN tiles | Walk through | Tiles dirtied by foot traffic. Must re-clean. |
| Player (if spotted) | See §14.3 | Bad news. |

### 14.3 Stealth & Sight Cones

The player must hide from Heroes. Heroes use an enhanced version of the existing `enemy-ai.js` sight/awareness system, but with much larger detection ranges.

**Hero sight cone:**
- **Cone angle:** 90° (wider than standard enemy 60°)
- **Cone range:** 12 tiles (vs standard enemy 4-6 tiles)
- **Awareness decay:** None — Heroes are always alert (awareness = MAX)
- **LOS blocking:** Walls, closed doors, and unbroken breakables block LOS (same as enemy system)

**Player detection states:**

| State | Trigger | Hero Behavior |
|-------|---------|---------------|
| **Unaware** | Player outside cone | Hero follows patrol route normally |
| **Suspicious** | Player at edge of cone (10-12 tiles) or heard noise | Hero pauses, looks toward player position, resumes after 3s |
| **Spotted** | Player in cone within 8 tiles, clear LOS | Hero shouts, charges toward player position |
| **Engaged** | Player adjacent | Forced interaction (see §14.4) |

**Hiding mechanics:**
- **Side corridors:** Step into a perpendicular corridor to break LOS. Hero passes by.
- **Behind breakables:** Unbroken crate/barrel blocks LOS. Crouch behind it (new interaction: hold crouch key).
- **Dark tiles:** Tiles with low light value (from `lighting.js`) reduce detection range by 50%.
- **Cleaned rooms vs dirty rooms:** Heroes move faster through clean areas (they don't stop to investigate). Dirty rooms slow Heroes down (they search for loot). This creates a strategic tension: cleaning makes your job easier but also makes Heroes more dangerous on their patrol.

**Noise system:**
- Breakable interactions generate noise (existing `noise` field on biome_props).
- Cleaning tiles generates low noise (0.3).
- Restocking generates medium noise (0.8 — crate lids, item placement).
- Hero responds to noise within 8 tiles: turns to face noise source, pauses patrol for 2s.

### 14.4 Hero Encounters (Early vs Late Game)

**Early game (no combat deck):**
- If spotted, the Hero doesn't attack — they're "above" fighting the janitor.
- Hero shoves the player aside (forced movement, lose 1 HP, knockback 2 tiles).
- Hero says something dismissive: *"Out of my way, rat."* / *"This dungeon isn't for your kind."*
- Player is stunned for 2 seconds (can't move or interact).
- This is humiliating but non-lethal. Establishes the power dynamic.

**Mid game (partial deck, 10+ cards):**
- Hero recognizes the player has been arming up: *"You? Fighting? With those cards?"*
- Hero may steal a card from the player's deck (random common card confiscated).
- Still non-lethal but punishing. Motivation to avoid OR prepare to fight back.

**Late game (Act 3, full deck, 20+ cards):**
- Heroes become boss fights using the full combat system.
- The player challenges a Hero at a Reassembly Altar (narrative: "The dungeon fights back").
- Each Hero type has a unique deck reflecting their class (Fighter = high damage, Mage = elemental, Rogue = steal/debuff, Paladin = defense/holy).
- Defeating a Hero drops their legendary equipment + unlocks a new dungeon tier.
- The RPS combat triangle finally pays off — the deck you built crate by crate determines which Heroes you can beat.

---

## 15. Pressure Wash Simulator — Surface Detail

The cleaning loop needs to feel satisfying at the moment-to-moment level. Borrowing directly from Power Wash Simulator's design principles:

### 15.1 Visual Feedback

- **Grime removal is per-pixel (per-texel).** Each 64×64 tile texture has a grime overlay bitmap. Cleaning reduces the grime intensity at the point the player is facing (raycast hit position on the wall/floor).
- **Progressive reveal:** The clean texture emerges as you scrub, not in a single state swap. 4 stages of grime: heavy → moderate → light → clean.
- **Sparkle on clean:** When a tile reaches fully clean, a brief particle burst (reuse combat-fx.js particle system) + satisfying SFX chime.
- **Color saturation shift:** Dirty tiles are desaturated. Clean tiles show full vibrant colors (the retrofuturistic vaporwave palette shines through cleaning).

### 15.2 Cleaning Tools (Progressive Unlocks)

| Tool | Unlock | Speed | Range | Noise |
|------|--------|-------|-------|-------|
| Rag | Start | 1× (baseline) | 1 tile | 0.1 |
| Mop | Guild rank 2 | 1.5× | 1 tile | 0.3 |
| Scrub Brush | Guild rank 3 | 2× | 1 tile | 0.5 |
| Pressure Washer | Guild rank 5 | 3× | 2 tiles (cone) | 2.0 |
| Enchanted Broom | Legendary drop | 4× | 3 tiles (AoE) | 0.5 |

- Tools equip in the **active equipment slot** (reuse existing equip system).
- Pressure Washer uses the **Magic Remote pointer** for aimed cleaning — point at the dirty spot, hold interact. The gyroscope tracking makes this feel like actually pointing a nozzle.
- Noise matters: Pressure Washer is fast but loud. If a Hero is on the floor, you might attract attention.

### 15.3 Cleaning Contracts (Bonus Objectives)

Each floor can have optional **cleaning contracts** posted at the work order board:
- "Clean Floor 0.1.1 to 95% in under 5 minutes" → Bonus: 50 coins
- "Clean without being spotted by the Hero" → Bonus: Rare card
- "Clean using only the Rag (no upgrades)" → Bonus: Guild reputation

These add replayability and challenge runs to the cleaning loop.

---

## 16. Revised Implementation Phases (Gleaner Pivot)

The original 8-phase plan (§9) focused on world graph and gate progression. The Gleaner pivot reorders priorities to deliver the maintenance loops first, then layer in Hero AI and stealth.

### Phase 1: Crate Slot System (3-4 hours) — CRITICAL PATH

**New files:**
- `engine/crate-system.js` — IIFE module: slot generation, hydration, fill/seal logic, reward rolls
- `data/crate-frames.json` — Frame tag definitions + per-biome frame weight tables

**Modified files:**
- `engine/breakable-spawner.js` — Add `slots[]` array to breakable instances, wire Gleaner mode toggle
- `engine/interact-prompt.js` — Add "Open" verb for Gleaner mode on breakable tiles
- `engine/hud.js` or new `engine/crate-ui.js` — Canvas-rendered slot fill UI (row of framed boxes)
- `data/loot-tables.json` — Add `crate_seal_rewards` table and `crate_hydration` settings

**Verification:** Approach crate in Gleaner mode, see slot UI, drag item from bag to slot, fill all slots, crate seals with coin burst + reward roll.

### Phase 2: Tile Cleaning System (2-3 hours)

**New files:**
- `engine/cleaning-system.js` — IIFE module: tile condition tracking, scrub interaction, cleanliness percentage, coin pops

**Modified files:**
- `engine/tiles.js` — Add tile condition data layer (parallel array or tile metadata object)
- `engine/texture-atlas.js` — Add `generateDirtyVariant()` and `generateDamagedVariant()` overlay functions
- `engine/raycaster.js` — Texture selection reads tile condition to pick clean/dirty/damaged variant
- `engine/interact-prompt.js` — Add "Scrub" / "Repair" verbs for dirty/damaged tiles
- `engine/floor-state-tracker.js` — Track cleanliness percentage per floor

**Verification:** Enter dungeon, see dirty tiles, scrub them clean, watch texture change, collect coin pops, check cleanliness percentage in HUD.

### Phase 3: Dungeon Reset Tasks (2-3 hours)

**New files:**
- `engine/work-order-system.js` — IIFE module: work order generation, readiness calculation, submission rewards
- `engine/reassembly-system.js` — IIFE module: corpse part collection, altar deposit, monster revival tracking

**Modified files:**
- `engine/tiles.js` — Add TRAP_DISARMED, PUZZLE_SOLVED, SECRET_EXPOSED, REASSEMBLY_ALTAR tile constants
- `engine/interact-prompt.js` — Add verbs: "Re-arm" (traps), "Scramble" (puzzles), "Conceal" (secrets), "Deposit" (altars)
- `engine/salvage.js` — Extend harvest flow for monster part collection (Gleaner context)
- `engine/floor-state-tracker.js` — Track all readiness components per floor

**Verification:** Complete all 6 readiness tasks on a floor, see readiness reach threshold, submit work order, receive payment.

### Phase 4: Hero AI & Patrol Routes (3-4 hours)

**New files:**
- `engine/hero-system.js` — IIFE module: Hero entity types, patrol route generation, cycle timer, interaction with dungeon tiles (smash/solve/kill/loot), post-patrol damage marking

**Modified files:**
- `engine/enemy-ai.js` — Extend sight cone system for Hero-class entities (wider cone, longer range, no awareness decay)
- `engine/game.js` — Wire Hero cycle timer, warning system, sprite rendering
- `engine/minimap.js` — Render Hero patrol trail (faded path on explored tiles)
- `engine/toast.js` — Hero approach warnings

**Verification:** Be on a floor when Hero cycle triggers, hear warning, see Hero enter and patrol, watch Hero smash crates and dirty tiles, hide in side corridor, Hero passes by, see resulting damage on minimap.

### Phase 5: Stealth & Detection (2-3 hours)

**Modified files:**
- `engine/hero-system.js` — Add detection state machine (unaware → suspicious → spotted → engaged)
- `engine/enemy-ai.js` — Noise propagation system (existing `noise` field on breakables + new noise events for cleaning/restocking)
- `engine/input.js` — Add crouch/hide interaction behind breakables
- `engine/lighting.js` — Expose per-tile light level for darkness detection range reduction
- `engine/dialog-box.js` — Hero encounter dialogs (dismissive early game, threatening mid game)
- `engine/player.js` — Shove/stun mechanic for early-game Hero encounters

**Verification:** Get spotted by Hero, get shoved. Hide behind crate on next encounter, Hero walks past. Use dark corridors to avoid detection. Noise from Pressure Washer draws Hero attention.

### Phase 6: Hero Boss Fights (2-3 hours)

**Modified files:**
- `engine/hero-system.js` — Convert Hero entities to boss combatants in late game
- `engine/combat-bridge.js` — Wire Hero boss combat (unique decks per Hero class)
- `data/cards.json` — Add Hero-specific card sets (Fighter, Mage, Rogue, Paladin decks)
- `data/enemies.json` — Add Hero enemy entries with boss stats
- `engine/reassembly-system.js` — Altar challenge trigger for Hero confrontation

**Verification:** Approach Hero at Reassembly Altar with 20+ card deck, trigger boss fight, fight through Hero's class-specific deck, win, receive legendary drop.

### Phase 7: Cleaning Tool Progression & Polish (2-3 hours)

**New files:**
- `data/tools.json` — Cleaning tool definitions (speed, range, noise, unlock requirements)

**Modified files:**
- `engine/cleaning-system.js` — Wire tool selection, speed multiplier, range cone
- `engine/player.js` — Guild rank tracking, tool unlock checks
- `engine/shop.js` — Sell cleaning tools at guild shop
- `engine/dialog-box.js` — NPC legendary card rumors, guild rank-up dialogs

**Verification:** Buy Mop at guild, equip, clean faster. Unlock Pressure Washer, use Magic Remote to aim. Guild rank progression visible in menu.

### Phase 8: Economy Balancing & Work Order Contracts (1-2 hours)

- Tune coin yields per action (cleaning, restocking, sealing) against shop prices
- Tune Hero cycle timer against average floor clearing time
- Add cleaning contracts (bonus objectives) to work order board
- Test all three player paths (Scavenger, Casual Filler, Optimizer) end-to-end
- Verify legendary card drop rate feels aspirational but not impossible (~1 per 100 crate seals)
- Test full Act 1 → Act 3 progression: cleaning → restocking → Hero avoidance → Hero combat

---

## 17. Revised Player Journey (Gleaner Pivot)

### First session — Learning the Job

1. **Spawn** on Floor 0, auto-walk. Enter lobby, descend to Cellar B1.
2. **See the Hero's wake** — dirty tiles, smashed crates, corpse tiles. Dialog: *"Someone destroyed this place. Your job: fix it."*
3. **First cleaning** — scrub a dirty wall tile. Coin pops out. Satisfying. Do a few more.
4. **First crate encounter** — find a half-empty crate (2 slots filled, 2 empty). In Scavenger mode, smash it for the hydrated loot. OR if wearing Gleaner's Apron (given at start), open it and see the slot UI.
5. **First restock** — drag a bone from bag into an empty slot. 1 coin pops. Fill the second slot. Crate seals, sparkle effect, bonus coins + maybe nothing extra on the reward roll.
6. **Discover the loop** — clean more tiles, restock more crates, coins accumulate. Exit to surface.
7. **First shop trip** — buy potions at Coral Bazaar. Notice they match crate slot frames (pink border = potion frame).
8. **Second dungeon run** — restock with proper potions. 2-3 coins per slot instead of 1. Seal bonus is bigger. *"Oh, THAT'S how this works."*

### Act 1 First Dungeon — The Hero's Wake (detailed beat-by-beat)

The player's first dungeon entry is carefully paced to teach the three modes (combat, scavenge, flee) and pivot the game from crawler to maintenance sim. The Hero is ahead of the player, running *away* from them through the dungeon, leaving destruction behind.

**Beat 1 — The wake.** Player enters Cellar B1. The corridor ahead is trashed: dirty tiles, smashed crates, and corpse tiles litter the ground. The Hero's distant footsteps echo (spatial audio, fading out). The player can't catch up — they can only see the aftermath.

**Beat 2 — Damaged enemy.** A partially-defeated enemy blocks the path (low HP, spriteState `enraged`, telegraph emoji shows desperation). Combat is forced but trivial — 1-2 cards finish it. The death animation plays (origami fold), corpse drops. Player learns: card combat works, enemies can die, corpses are lootable.

**Beat 3 — Loot the corpse.** Player interacts with the fresh corpse. Salvage menu opens — a few bones, maybe a coin. Loot it dry. The corpse emoji transitions from the enemy's defeated sprite to a bare bone (🦴). Player learns: corpses are containers, looting has a visual payoff.

**Beat 4 — Scavenge the wake.** Two or three more corpses ahead (already dead from the Hero). A couple of smashed crates with spilled loot. Player picks through the remains — coins, basic items, maybe a card from a seal reward. This is the scavenge tutorial. No combat, just collecting.

**Beat 5 — The intact enemy.** The corridor opens into a room with a *full-health* enemy. It's awake (spriteState `idle`, awareness climbing). The enemy-alert SFX fires. The intent telegraph shows confidence — this isn't a damaged straggler. The player's starting deck (3-5 weak cards) isn't enough. The game teaches by implication: **you should flee.**

**Beat 6 — The pivot.** If the player flees, they exit back to the surface with their scavenged loot. The guild NPC explains the job: restock crates, clean tiles, maintain the dungeon. The scavenge game has begun. If the player fights and wins (unlikely but possible with good card draws), they earn bonus loot but take heavy damage — the economy still pushes them toward maintenance.

**Beat 7 — The remaining act.** For the rest of Act 1 the game is scavenge, restock, and clean. Disorganize puzzle tiles. Break and restock crates. Sweep dirty corridors. The player can grind on partially-hydrated crates and gamble on a lucky card hand for optional combat encounters, but the path of least resistance is the maintenance loop. Combat cards accumulate slowly through seal rewards and faction rep — the player earns their deck through labor, not grinding.

**Design intent:** The first dungeon teaches that this isn't a combat-forward game. The Hero is the destructive force; the player is the janitor. Combat is a tool, not the game. The emotional arc goes: *empowerment* (easy kill) → *greed* (loot everything) → *fear* (real enemy) → *retreat* (flee to safety) → *purpose* (the guild gives you a job).

### Mid game — Mastering the Routine

9. **Work orders** — Guild issues per-floor maintenance assignments. Clean, restock, re-arm traps, scramble puzzles.
10. **First Hero encounter** — warning sounds, Hero arrives, player hides in side corridor. Hero smashes half your freshly restocked crates. Comedy and frustration. Motivation to work faster.
11. **Guild rank ups** — better tools (Mop → Scrub Brush), access to deeper floors.
12. **Card accumulation** — seal rewards slowly build a combat deck. Rumors of legendary cards from NPCs.
13. **Monster reassembly** — collect corpse parts, deposit at Reassembly Altar. The Necromancer is pleased.

### Late game — The Janitor Fights Back

14. **Full deck** (20+ cards) built entirely through labor. Not a single card from combat yet.
15. **Hero challenge** — confront the Seeker at a Reassembly Altar. Full RPS combat using earned deck.
16. **Hero defeat** — legendary equipment drop. New dungeon tier unlocked. The janitor has become the dungeon's true defender.
17. **Dragon alliance** (Act 2 hook) — the dragons recognize the Gleaner as the dungeon's caretaker, not an invader. Partnership against the Hero faction.

---

## § Cross-References

> Master index: **[CROSS_ROADMAP.md](CROSS_ROADMAP.md)** — dependency-ordered execution for playable prototype

| This Section | Links To | Relationship |
|--------------|----------|-------------|
| §2 World Graph | → DOC-4 §4 Floor ID Convention | Biome Plan defines spatial contracts per depth |
| §3 Floor Registry | → DOC-4 §5–§7 | Biome Plan has detailed floor aesthetics |
| §4 Gate-Contract System | → DOC-5 AUDIT §1.3 Level Gen | Base engine has Brogue-style procgen |
| §5 Floor Designs | → DOC-4 §5 Boardwalk, §6 Interiors, §7 Dungeons | Biome Plan has wall colors, palettes, props |
| §6 Hero Reveal | → DOC-4 §9 Boss Encounters, §18 Hero Path | Biome Plan has Hero combat deck + stealth system |
| §7 Economy Tuning | → DOC-1 GAP T2 Economy Closure | GAP doc has remaining T2 items for economy loop |
| §7.7 Tuning Levers | → DOC-6 CROSS_ROADMAP Phase F.5 | Cross-roadmap schedules the tuning pass |
| §9 Original Phases | ← DOC-6 CROSS_ROADMAP (superseded) | Original phases replaced by §16 for Gleaner pivot |
| §13 Gleaner Pivot | → DOC-4 §17 Gleaner Maintenance | Biome Plan has full system specs for all 3 loops |
| §13 Crate data structures | → DOC-4 §17.2, UNIFIED_INVENTORY contract §8 | Schema defined in inventory contract |
| §14 Hero Path System | → DOC-3 GONE_ROGUE Pass 3 (stealth extraction) | Stealth-system.js enables detection modifiers |
| §14 Hero Path System | → DOC-4 §18 Hero Path & Stealth | Biome Plan has hero type details, encounter stages |
| §15 Pressure Wash | → DOC-4 §17.1 Cleaning Loop | Biome Plan has per-texel grime removal spec |
| §16 Revised Phases | → DOC-6 CROSS_ROADMAP Phases B–F | Cross-roadmap maps these 8 phases to daily schedule |

**⊕ Cross-Roadmap Phase mapping (§16 → CROSS_ROADMAP):**
- Phase 1 (Crate Slots) → **Phase B.1–B.5**
- Phase 2 (Cleaning) → **Phase C.1–C.3**
- Phase 3 (Dungeon Reset) → **Phase C.4–C.5**
- Phase 4 (Hero AI) → **Phase D.1–D.2, D.5–D.6**
- Phase 5 (Stealth) → **Phase D.3–D.4**
- Phase 6 (Hero Boss) → **Phase E.1–E.2**
- Phase 7 (Tool Progression) → **Phase F.1–F.2**
- Phase 8 (Economy Balance) → **Phase F.3–F.5**

---

*End of Document*

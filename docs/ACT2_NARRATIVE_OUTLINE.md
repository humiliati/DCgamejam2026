# Act 2 Narrative Outline — Open City, Faction War, Seaway

**Created**: 2026-04-06
**Depends on**: `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` (faction dossiers, MacGuffin), `CORE_GAME_LOOP_AND_JUICE.md` (hero cycle, day/night, economy), `FLOOR3_BLOCKOUT.md` (Frontier Gate layout), `HERO_FOYER_ENCOUNTER.md` (Act 1 choreography style guide), `COZY_INTERIORS_DESIGN.md` (safe interior contract), `LIVING_INFRASTRUCTURE_BLOCKOUT.md` (housing/living infrastructure nodes), `NPC_FACTION_BOOK_AUDIT.md` (faction HQ populations and bark tone)
**Scope**: Story beats, faction-choice mechanic, Dispatcher arc, seaway introduction, and floor routing for Act 2. Does NOT cover Act 3 betrayals or endgame branching.

---

## 1. Tone Shift

Act 1 is Stardew Valley. The player learns to clean, restock, and endure. Combat is incidental. NPCs talk at the player through dialogue trees. The world is small (Floors 0-2 and their interiors). The conspiracy is wallpaper: lore books, ambient barks, a foyer encounter that teaches "you are not the hero" without a word of tutorial text.

Act 2 is GTA 2 meets Morrowind. The city opens. Factions are physical presences on the map, not just dialogue flags. Combat becomes a primary verb on both exterior and interior floors. NPCs teach their worldview through missions the player runs alongside them, not through branching conversation. The player picks a side, and the side they didn't pick becomes hostile for the rest of the game.

The maintenance loop persists but the stakes change. In Act 1, the player cleans dungeons because that's the job. In Act 2, the player cleans dungeons because the dungeon floors are contested territory and readiness determines which faction controls the output. The hero cycle continues, but the heroes dispatched now carry faction colors. The Taskmaster's clipboard is political.

---

## 2. Act 1 Handoff

Act 1 climax: Ironhold Depths (Floor 3.1.1). The Hero (The Seeker) stands over a dying dragon. The player confronts them. Three options: fight the Hero solo, side with the dragon, or attack both.

Regardless of choice, the immediate outcome is the same: the dragon dies. The Seeker either dies, flees, or is driven off. The difference is in faction reputation, which seeds the Act 2 state:

| Act 1 Choice | MSS Disposition | Pinkerton Disposition | Jesuit Disposition | BPRD Disposition |
|---|---|---|---|---|
| Fight Hero solo | Hostile | Neutral+ | Neutral | Pleased |
| Side with dragon | Allied | Neutral | Concerned | Displeased |
| Attack both | Hostile | Pleased | Pleased | Confused |

These dispositions are starting conditions, not locks. Act 2 faction choice overrides them.

---

## 3. Floor Routing

Act 2 unlocks three new areas and returns the player to two existing ones:

```
Act 1 floors (persist, now contested):
  "1"       The Promenade       — safe hub, but NPC population shifts
  "2"       Lantern Row         — faction shops, patrol routes change
  "2.2.1"   Hero's Wake B1      — revisitable, new faction loot
  "2.2.2"   Hero's Wake B2      — revisitable, deeper faction loot

Act 2 new floors:
  "3"       Frontier Gate       — contested exterior, four faction HQs
  "3.1"     Armory / Barracks   — faction-aligned interior (changes with allegiance)
  "3.1.1"+  Deep Vaults         — returned to with faction-specific objectives

Act 2 mid-point unlock:
  "0.1"     Seaway Vestibule    — interior beneath The Approach
  "0.1.1"   Seaway Tunnels      — depth 3, ancient lab / contraband locker
  "0.1.2"   Seaway Deep         — depth 3, deepest wing, Act 2 climax floor
```

The seaway entrance is on Floor 0 (The Approach), the tutorial courtyard the player walked through on Day 1. A tile that was WALL on first visit becomes DOOR after a mid-Act 2 trigger. The player walks over this spot every time they transition between Floor 0 and Floor 1. They have been passing the entrance since minute one.

---

## 4. Faction Choice Mechanic

### 4.1 Earning Favor

Floor 3 (Frontier Gate) has four faction buildings:

| Floor | Faction | Building | NPC Contact |
|---|---|---|---|
| 3.2 | MSS | Safehouse | The Seeker (if alive) or Lt. Mei |
| 3.3 | Pinkertons | Watchtower | Agent Crow |
| 3.4 | Jesuits | Chapel | Father Ashworth |
| 3.1 | BPRD | Barracks | Handler Vala (remote terminal) |

Each faction offers missions. Missions are dispatched dungeon runs with a faction objective layered on top of the standard maintenance loop. Examples:

- **MSS**: "Floor 2.2.1 has dragon-bone fragments. Retrieve them before Crow's team extracts them."
- **Pinkertons**: "The Jesuits cached something in the Deep Vaults. Get in, photograph the manifests, get out."
- **Jesuits**: "A containment seal failed on Floor 2.2.2. Reseal the chamber before any other faction notices."
- **BPRD**: "Standard maintenance on Floor 2.2.1. Log any anomalous items. Do not engage other operatives."

The player can run missions for any faction freely during early Act 2. Favor accumulates per faction. Missions for one faction do not reduce standing with others (yet).

### 4.2 The Lock

Once the player's favor with any single faction crosses a threshold (approximately 5 completed missions), that faction's contact offers an exclusive contract. Accepting the contract locks the player's allegiance and makes one opposing faction hostile.

| Chosen Faction | Hostile Faction | Reasoning |
|---|---|---|
| MSS | Pinkertons | Ancient blood feud, MSS cannot tolerate Pinkerton interference |
| Pinkertons | MSS | Mirror of above |
| Jesuits | BPRD | BPRD's mandate threatens the Jesuit secret; Jesuits cut the leash |
| BPRD | Jesuits | BPRD moves to contain the Jesuit operation; Jesuits go underground |

The remaining two factions become wary but not hostile. They stop offering missions and their NPCs give guarded dialogue, but their shops stay open and their patrols don't attack.

### 4.3 Hostility Consequences

When a faction becomes hostile, the following systems activate:

**Surface (Floor 1, 2, 3 exteriors):**
- Hostile faction NPCs switch from AMBIENT type to HOSTILE patrol routes on exterior floors
- 1-2 hostile operatives spawn per exterior floor per day, on patrol routes near faction-relevant locations
- Hostile patrols engage the player in card combat if line-of-sight is achieved within 4 tiles
- The hostile faction's shops close (vendor NPCs replaced with boarded-up doors or hostile sentries)
- Hostile faction building on Floor 3 becomes a locked door with a HOSTILE guard

**Interiors (Floor N.N):**
- Hostile faction operatives appear as enemy encounters on dungeon floors during maintenance runs
- They compete for faction objectives (if the player is retrieving dragon bones for MSS, a Pinkerton operative is also in the dungeon trying to get them first)
- Interior shops aligned with the hostile faction raise prices 2x or refuse service

**Dungeons (Floor N.N.N):**
- Hostile faction teams appear as mid-tier enemy groups (2-3 operatives) on depth-3 floors
- They are positioned near faction objective items
- They do not patrol; they camp objectives and fight when the player approaches

**Dispatcher's Office (Floor 2.1):**
- Mission briefings reference the hostile faction as an active threat
- The replacement dispatcher (see section 5) frames missions around the faction conflict

---

## 5. The Dispatcher Arc

### 5.1 Faltering (Early Act 2)

The original Dispatcher from Act 1 begins deteriorating. This is shown through behavior and environment, not dialogue:

**Day-by-day progression:**

| Day | Behavioral Change | Environmental Change |
|---|---|---|
| Act 2 Day 1 | Normal snide tone, but pauses mid-sentence once | None |
| Day 3 | Avoids eye contact (NPC facing angle offset by 15 degrees during dialogue) | Flask on desk (new interactable, no function) |
| Day 5 | Barks fire late (800ms delay instead of instant) | Unfiled reports stacked on desk (CLUTTER tile) |
| Day 7 | Dialogue tree has a new option: "You alright?" Response: "Mind your own floor." | Desk lamp off. Room dimmer (lighting override) |
| Day 9 | Stops meeting player at office. Found at the Driftwood Inn (Floor 1.2) bar instead | Office empty. Door still open. |
| Day 11 | Missing entirely. Not at office, not at inn. | Letter on desk: "Reassigned. New dispatcher arriving tomorrow." |

The player cannot prevent the deterioration. There is no "save the dispatcher" option. This is observed decline, not an interactive arc. The player watches someone crack under pressure they don't understand yet.

### 5.2 The Replacement (Mid Act 2)

Day 12: a new dispatcher occupies Floor 2.1. Clean desk. Pressed uniform. Calls the player by their callsign without checking a file. Knows their class, their floor history, their Act 1 choices. Too informed. Too smooth.

The replacement is a double agent for whichever faction is hostile to the player. Their job is to steer the player's maintenance assignments toward floors that benefit the hostile faction's goals while appearing to serve BPRD interests.

**Mechanical effect:** The replacement dispatcher's mission board subtly favors floors where hostile faction objectives are active. The player who pays attention notices they keep getting sent to the same dungeon chain. The player who doesn't pays the price in ambush encounters.

**NPC behavior tells the story:** The replacement never has barks that fire organically. They speak only when spoken to. They never reference the previous dispatcher. If the player asks about the old dispatcher, the response is a single line: "Personnel transfers are above both our pay grades, [Callsign]."

### 5.3 The Original Dispatcher (Late Act 2)

The original dispatcher is found in the Seaway (Floor 0.1.1). Alive. Hiding. They discovered something in the BPRD contraband locker that broke them: evidence that their work orders, the ones they'd been issuing to Gleaners for years, were designed to systematically destroy dragon-adjacent artifacts under the cover of "cleaning." Every dungeon maintenance cycle was an evidence purge. The dispatcher was the instrument and never knew.

If the player's chosen faction is BPRD, the dispatcher is hostile (terrified, assumes the player is sent to silence them). Any other faction: the dispatcher becomes an informant, providing a key item or intelligence needed for the Act 2 climax.

### 5.4 Housing Reassignment Arc (BnB -> Field Quarters)

Act 1's Floor 1.6 is reframed as **company-funded temporary lodging** ("HomeBnB"), not owned property. The player's Day 0 supervisor line ("you just got here, room's on us for onboarding week") becomes diegetic setup for the downgrade.

**Narrative avenue:** once Act 2 faction conflict escalates, BPRD revokes broad housing stipends under "operational security." Field operatives are reassigned to lower-comfort quarters tied to trust, allegiance, and district risk.

**Mechanical downgrade intent:** move the player from high-comfort sanctuary to a narrower base that preserves core safety but removes convenience systems, then let the player earn those systems back through mission and relationship play.

| Phase | Housing State | Narrative Framing | Mechanical State |
|---|---|---|---|
| Act 1 baseline | `1.6` HomeBnB (temporary) | New hire onboarding lodging in the nice district | Full comfort set for tutorial pacing |
| Act 2 early | Warning notice posted | "Stipend under review due to Frontier escalation" | No change yet, foreshadow only |
| Act 2 lock | Forced relocation ("Move Night") | Security reclassification + faction pressure | HomeBnB convenience disabled; player moved |
| Act 2 mid-late | Affinity quarters | Chosen faction/civil ties determine new room type | Reduced feature set (bed/save/stash + 1 utility) |
| Act 3/endgame | `1.6` reclaimed | Legal reclaim, purchase, or faction grant | Full feature restoration + prestige upgrades |

**Affinity routing (recommended):**

- High faction affinity: faction apartment/bunkhouse near HQ (3.N interiors).
- High civilian/community affinity: town apartment above shop/inn.
- Low/fragmented affinity: municipal bunkhouse with sparse amenities.

**Move Night sequence (single quest):**

1. Receive reassignment order from replacement dispatcher.
2. Pack 2-3 personal artifacts from `1.6` into a transfer crate.
3. Escort crate through a contested exterior corridor.
4. Arrive at assigned quarters; first-night bark/tutorial establishes downgraded systems.

This keeps the emotional beat personal while preserving Act 2's "surface is no longer safe" tone shift.

---

## 6. Teaching Characters Through Action

Act 1 teaches through dialogue trees and environmental clues. Act 2 teaches through shared space. Each faction contact demonstrates their worldview by how they behave during missions, not by what they say in conversation.

### 6.1 Escort and Witness Encounters

Faction missions occasionally place the faction contact NPC on the same dungeon floor as the player. The NPC operates independently (using EnemyAI patrol logic repurposed for allied behavior). The player watches them work.

| Faction NPC | Observed Behavior | What It Teaches |
|---|---|---|
| The Seeker / Lt. Mei (MSS) | Avoids killing dungeon creatures. Uses non-lethal takedowns. Stops to examine dragon-related artifacts reverently. | MSS genuinely believes in protection. They're not faking it. |
| Agent Crow (Pinkertons) | Efficient, brutal. Kills everything. But leaves dragon artifacts untouched and photographs them. | Crow is collecting intelligence, not destroying evidence. There's a plan. |
| Father Ashworth (Jesuits) | Moves ahead of the player and seals doors behind him. Rooms Ashworth passes through are suspiciously clean when the player arrives. | Ashworth is hiding something in the rooms he "clears." The player can't see what he removed. |
| Handler Vala (BPRD, via comms) | Never physically present. Speaks through the terminal. Gives precise directions that always route the player past dragon evidence without acknowledging it. | BPRD knows where everything is. They've mapped it. The "investigation" is theater. |

### 6.2 Faction Combat Styles

When the hostile faction's operatives appear as enemies, their combat behavior reflects faction identity:

| Faction Operatives | Combat Style | Card Suit Affinity |
|---|---|---|
| MSS | Defensive, high HP, prefer to disengage. Will retreat if below 40% HP. | Hearts (sustain, healing) |
| Pinkertons | Aggressive, glass cannon. High damage, low HP. Never retreat. | Spades (damage, pierce) |
| Jesuits | Balanced, use status effects (blind, slow, confuse). Prefer ambush positioning. | Diamonds (utility, control) |
| BPRD | Tactical, coordinated. One tanks while the other flanks. Mimic player combat patterns. | Clubs (defense, counter) |

---

## 7. The Seaway (Floors 0.1, 0.1.1, 0.1.2)

See `SEAWAY_FLOOR_DESIGN.md` for full blockout. Summary:

The seaway is a depth-2/depth-3 complex beneath Floor 0 (The Approach). The entrance is hidden until mid-Act 2, when a faction mission requires the player to investigate "anomalous readings beneath the old courtyard."

**What it was:** A Jesuit apothecary laboratory, circa 1624. The original site where panda chimeras were first engineered. Stone archways, iron-grated drainage channels, alcoves with the residue of biological experimentation. The player is never told this directly. The environment implies it: anatomical etchings on walls, glass vessels fused to ancient shelving, a faded Jesuit cross above a surgical theater.

**What it is now:** BPRD's off-books contraband locker. The ancient architecture is partially preserved, partially demolished to make room for modern infrastructure. Some wings are untouched cave with 400-year-old stonework. Other wings are sterile fluorescent corridors with caged storage racks holding seized artifacts, confiscated weapons, and evidence containers stamped with BPRD classification codes. The contrast is the point: the player walks from a medieval apothecary into a government warehouse and back again, and the transition is seamless because both serve the same purpose. Containment.

**Why it matters:** The seaway connects Floor 0's surface to Floor 3's deep content. It is the physical spine of the conspiracy: the site where the chimera program began is now the site where evidence of the chimera program is stored. The player traverses 400 years of institutional continuity in a single dungeon run.

---

## 8. Act 2 Beat Sequence

### Phase 1: Open City (Days 1-8)

- Floor 3 unlocks. Player explores Frontier Gate, meets faction contacts.
- Faction missions available from all four buildings. Player runs 2-3 for whichever factions interest them.
- Dispatcher begins faltering (background, observed).
- Housing stipend warning appears in `1.6` (mail/notice): temporary lodging status is now explicit.
- Maintenance loop continues on Floors 1-2. Hero cycle runs normally.
- Combat encounters increase slightly on dungeon floors (faction operatives appear as neutral NPCs, not yet hostile).

### Phase 2: Faction Lock (Days 9-14)

- Player crosses favor threshold with one faction. Exclusive contract offered.
- Accepting locks allegiance. One faction goes hostile immediately.
- Hostile faction operatives begin appearing on exterior floors. Surface is no longer safe.
- Shops close. Patrol routes become combat encounters.
- Dispatcher disappears (Day 11). Replacement arrives (Day 12).
- Replacement dispatcher issues housing reassignment order. "Move Night" quest fires.
- Dungeon floors now have hostile faction presence competing for objectives.

### Phase 3: Seaway Discovery (Days 15-20)

- Chosen faction sends the player to investigate beneath Floor 0.
- Seaway entrance opens. Floor 0.1 (Vestibule) is a short interior transition.
- Floor 0.1.1 (Seaway Tunnels) is the first depth-3 seaway floor. Mixed ancient/modern environment.
- Original dispatcher found hiding in the tunnels.
- Player retrieves a faction-critical item from the BPRD contraband locker.
- Hostile faction has a team in the seaway. First major multi-enemy combat encounter.
- Player settles into affinity-based quarters; upgrade hooks unlock (earn-back loop begins).

### Phase 4: Deep Vault Return and Climax (Days 21-25)

- Faction intelligence from the seaway points back to the Deep Vaults (Floor 3.1.1+).
- Player returns to the Deep Vaults with a new objective layered on familiar terrain.
- The vault has changed since Act 1: new doors unlocked, new wings accessible, evidence of recent faction activity.
- Act 2 climax: a confrontation in Floor 0.1.2 (Seaway Deep) where the player's faction and the hostile faction converge.
- The confrontation outcome is determined by combat, not dialogue. The player fights the hostile faction's lead operative.
- Victory: the player's faction secures the seaway. The route to Floor 3's deep content is open.
- The seaway's ancient lab wing is left ambiguous. The player has seen the anatomical etchings, the fused glass, the surgical theater. They have not been told what it means. The environment has planted the seed. Act 3 waters it.

---

## 9. What Act 2 Does NOT Reveal

These are Act 3 beats. Act 2 builds attachment and suspicion but does not confirm:

- The Gleaner's chimera biology (the "Gleaner Protocol")
- Handler Vala's full agenda
- Father Ashworth's role as architect of the cover-up
- The Pale Court's existence or identity
- The panda chimera connection (the seaway lab implies it but never states it)
- Why the original dispatcher broke (they tell the player "something terrible" but not what)

The player ends Act 2 with a faction, a hostile enemy, a contested city, and a growing sense that every institution they've encountered is hiding something. They do not yet know what.

---

## 10. Implementation Flags

Narrative state tracked via `Player.setFlag()` / `Player.getFlag()`:

| Flag | Type | Set When |
|---|---|---|
| `act2_started` | bool | Floor 3 first entered |
| `faction_favor_mss` | int | MSS mission completed (+1 each) |
| `faction_favor_pinkerton` | int | Pinkerton mission completed |
| `faction_favor_jesuit` | int | Jesuit mission completed |
| `faction_favor_bprd` | int | BPRD mission completed |
| `faction_locked` | string | Exclusive contract accepted ("mss" / "pinkerton" / "jesuit" / "bprd") |
| `faction_hostile` | string | Opposing faction ID |
| `dispatcher_phase` | string | "normal" / "faltering" / "missing" / "replaced" |
| `housing_status` | string | "homebnb_temp" / "reassigned" / "bunkhouse" / "faction_quarters" / "apartment" / "home16_reclaimed" |
| `housing_provider` | string | "bprd" / "mss" / "pinkerton" / "jesuit" / "civilian" / "municipal" |
| `housing_tier` | int | 0-4 amenity tier for current quarters |
| `home16_locked` | bool | HomeBnB convenience disabled after reassignment |
| `home16_reclaimed` | bool | Endgame reclaim complete |
| `move_night_done` | bool | Relocation quest completed |
| `dispatcher_found` | bool | Original dispatcher located in seaway |
| `seaway_open` | bool | Floor 0.1 entrance activated |
| `seaway_deep_cleared` | bool | Act 2 climax completed |
| `act1_choice` | string | "fight_hero" / "side_dragon" / "attack_both" |
| `seeker_alive` | bool | The Seeker survived Act 1 |

---

## 11. Biome-Narrative Integration (Act 2)

| Floor | Biome | Narrative Beat | Faction Presence |
|---|---|---|---|
| "3" Frontier Gate | frontier (grey stone, iron, salt air) | Open city, faction HQs, contested space | All four (buildings) |
| "3.1" Armory | barracks (cold steel, dim amber) | Faction-aligned interior, equipment | Chosen faction dominant |
| "3.1.1"+ Deep Vaults | vault (dark iron, green emergency light) | Return with new eyes, faction objectives | Chosen + hostile |
| "0.1" Seaway Vestibule | cave-modern (damp stone transitioning to tile) | Threshold, tone shift | Chosen faction intel |
| "0.1.1" Seaway Tunnels | apothecary-contraband (ancient stone / sterile lab, alternating) | Discovery, dispatcher found, BPRD cache | Hostile faction team |
| "0.1.2" Seaway Deep | surgical (cold white, iron grates, glass residue) | Climax floor, faction confrontation | Chosen vs hostile |

---

## 12. Open Questions

1. **Does the hero cycle change in Act 2?** Heroes dispatched during Act 2 could carry faction colors (a Pinkerton-aligned hero trashes different things than an MSS-aligned one). Or the hero cycle pauses during the faction war and resumes in Act 3 as a consequence of the player's choices.

2. **Can the player switch factions?** Current design says no. Once locked, locked. This is a Morrowind-style permanent commitment. But an escape hatch (extremely costly, lose all faction items) could exist for players who regret their choice.

3. **How many dungeon floors does Act 2 need?** The seaway adds 3 floors (0.1, 0.1.1, 0.1.2). The Deep Vaults expand (3.1.1 grows new wings). Floor 3 exterior is the new hub. Total new hand-authored content: 4-5 blockouts.

4. **Hostile faction difficulty curve.** Early hostile encounters should be winnable with Act 1 decks. Late Act 2 hostile teams should require faction-specific cards earned from mission rewards. This creates a natural gear check without explicit level gates.

---

## 13. Cross-References

| Document | Why It Matters For This Outline |
|---|---|
| `COZY_INTERIORS_DESIGN.md` | Defines depth-2 safety contract and interior feature taxonomy that housing downgrade must preserve at minimum tier. |
| `LIVING_INFRASTRUCTURE_BLOCKOUT.md` | Provides apartment/barracks/soup-kitchen/cot templates and verb-node placement for affinity housing states. |
| `VERB_FIELD_NPC_ROADMAP.md` | Supports affinity consequences via NPC verb changes (rest/social/duty) around player housing and faction HQ spaces. |
| `NPC_FACTION_BOOK_AUDIT.md` | Grounds faction HQ populations, bark tone, and building-native document placement for relocated quarters. |
| `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` | Macro act pacing and faction lock structure that this housing reassignment now plugs into directly. |
| `Tutorial_world_roadmap.md` | Establishes Act 1 starter shelter framing and current floor hierarchy (`1.6`, `2.1`, `2.2`, depth conventions). |
| `SEAWAY_FLOOR_DESIGN.md` | Mid-Act 2 discovery cadence used as the point where relocation consequences and trust realignment deepen. |
| **`NPC_TOOLING_ROADMAP.md` (DOC-110)** | Seven-tool authoring suite that produces the NPC populations, faction-branded sprites, archetype curves, enemy hydration, and bark pools called for throughout this outline. Act 2 roster expansion (§16.3 retrofuturistic) and reanimation tier dialogue content ship through P1 NPC Designer + P4 Archetype Studio + P5 Enemy Hydrator + P6 Sprite Studio. P7 Population Planner validates faction balance + supply-chain coherence per floor. |

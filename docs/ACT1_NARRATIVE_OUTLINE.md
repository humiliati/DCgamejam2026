# Act 1 Narrative Outline — The Long Approach

**Status:** Draft 1 — 2026-04-17. Authored from the design lock-ins of the 2026-04-17 brainstorm session. Pairs with `ACT2_NARRATIVE_OUTLINE.md` (locked) and `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` (faction dossiers).

**Pacing:** Stardew Valley → daily-cycle chores. Cozy combat. Heavy environmental storytelling. The conspiracy is revealed gradually through visual evidence (dragon-headed BPRD staff, surveillance hearths, retrofuturist materia infrastructure) that the player sees but the player-character does not consciously register.

**Climax:** A three-floor Jesuit grotto descent under The Approach (`0.1.1` → `0.1.2` → `0.1.3`), terminating in a four-way encounter (Hero, rogue dragon, Father Ashworth, player). A single back-door exit at the end of `0.1.3` deposits the player into faction territory at floor 3+. Reception varies by choice; geography is fixed.

**Critical structural note:** Act 1 does NOT end at `0.1.3`. The descent unlocks Act 2's geography but Gleaner continues the BPRD day-job loop — return to floor 1 before curfew, sleep at 1.6, deploy again. The double-life (BPRD day-shift, faction night-shift) persists until events in Act 2 force a hard break (see `ACT2_NARRATIVE_OUTLINE.md`).

---

## §1 Premise

The player-character (Gleaner) is hired by BPRD as a licensed dungeon scavenger. Day job: clean up after Heroes who have stormed the dungeons beneath the boardwalk town. Cozy, paying work, rotating contracts, daily cycle.

The conspiracy the player sees but the character does not name:

- **BPRD is dragons.** Vala (the dispatcher) and other senior BPRD staff are visibly dragon-headed in the player's view. NPCs treat them as ordinary. Gleaner's dialogue treats them as ordinary. The player notices.
- **Infrastructure runs on dragon power.** Materia-style energy nodes (FFVII visual reference) light streets, warm inns, power transit. Openly known in-fiction; not concealed.
- **The hearth is the eye.** Every interior hearth contains a "dragonfire" sprite — a large eyeball with CSS-quirk aggression that follows the player visually, even out of the hearth. The player learns to associate hearths with surveillance. The character does not name this.
- **The Hero hunts dragons.** The Heroes Gleaner cleans up after are eliminating dragons. Per BPRD's official position, this is a service. Per the conspiracy, the BPRD-dragons are running a hero-hunt-dragon economy that culls non-compliant dragons through Hero proxies, providing the regime with legitimacy and the world with spectacle.

The deeper layer (gradually revealed across Act 2 via the Jesuit canals): **MSS runs a panda chimera breeding program** under Jesuit ritual cover. Pandas are organ factories. The buyer is the Pale Court (vampires) at the seaway end. BPRD-dragons may know about the program; may not know the buyer's identity. The rogue dragon at `0.1.3` was running to the Jesuits to expose this when the Hero caught them.

## §2 The Vial — Hellforge Mechanic

A sealed Jesuit ink vial is the central player-driven economy item across Act 1. Mirrors Diablo 2's Mephisto's Soulstone / Hellforge Hammer pattern — inert most of the game, activated in one moment, and the player has to choose to preserve it across many hours and dungeons.

### Acquisition

Day 0, at the gate from floor 0 (The Approach) to floor 1 (Promenade), Father Ashworth hands the vial to every player automatically as part of a deployment blessing. Parting line:

> *"Keep this close. Don't let the firelight touch it. Don't ask why."*

This is also the player's first surveillance lesson. The instruction not to let the firelight touch the vial trains the player to *notice hearths*. After day 0, Ashworth relocates to the Chapel (`0.1`) and barks when the player visits.

### Use

The vial is checked three times across the grotto descent:

- `0.1.1` — unlocks an alcove behind an ikon (1624 record fragment)
- `0.1.2` — unlocks a sealed side passage (recently-dead priest mid-confession; names Ashworth)
- `0.1.3` — Ashworth breaks the seal and writes the upgraded memory-protection rite onto something the player will carry out

### Loss conditions

Stashing in 1.6 home is fine. Selling to a vendor: vendor refuses (Ashworth's mark on it). Drop-on-death does not destroy. Vial cannot be lost accidentally; it can be ignored.

### Without the vial

All three checks fail. Player still completes the descent. `0.1.3` still triggers. The encounter resolves as a three-way choice (Hero, rogue, defer) with surface-level dialogue. The fourth path ("I know what you are") is not available. Memory-protection rite at base level only.

## §3 Floor 0 — The Approach (revised)

Tutorial courtyard, exterior, depth 1. Already exists.

**Day 0 changes:**

- **Father Ashworth** at the gate to floor 1, in chasuble and stole. Scripted exchange handing the vial to the player. Cannot be skipped; the player passes through him to start the game.
- **The Lunatic** in the courtyard, ranting. Dismissable; player can ignore. Bark register:

> *"Watch the pandas when the cages come in at night. They breed wrong. The heroes never kill pandas — ask yourself who keeps them fed."*

No proper nouns. Three loose threads — "night," "breed wrong," "who keeps them fed" — that will rhyme with the rogue dragon's line at `0.1.3` ("MSS runs the breeding farms; the shipping goes through the seaway").

**After day 0:** Ashworth is gone. The Lunatic remains. The Lunatic's barks rotate as Act 1 progresses; player can return for additional fragments.

## §4 Floor 0.1 — The Chapel

NEW. Interior, depth 2. Father Ashworth's post.

**Aesthetic.** Mid-sized Jesuit chapel. Modest. Stone, candle alcoves, a small altar. A back door (locked early) leads to the grotto stairs. One hearth in the chapel — its eye watches the altar. Ashworth conducts daily rites with the eye on him.

**Inhabitants:** Ashworth (always present after day 0). Two or three Jesuit lay attendants doing chores. No combat.

**Function:** Player visits to interact with Ashworth. He barks but the player must engage to advance dialogue.

### Bark schedule

- **Early Act 1 (days 1–5):** Sacramental small talk. Blessings for deployment. Generic concern for soul.
- **Mid Act 1 (days 6–12):** Ashworth references the Lunatic ("strange fellow at the gate. He doesn't mean harm.") if the player has heard the Lunatic. Mild deflection.
- **Late Act 1 (days 13+):** Ashworth visibly shaken. References "rumors of a dragon gone dark." Sometime in this window, opens the grotto stairs:

> *"The canals are rising. I can't keep the door closed. Go down if you must."*

### The Confession Variant

If the player has the vial *visible* (not stashed) when entering the chapel, Ashworth's bark adjusts — he glances at the hearth, asks the player to come closer, says less. The hearth-aware variant is itself a piece of evidence the player can stack against the regime.

## §5 Floor 0.1.1 — Upper Grotto

NEW. Dungeon, depth 3.

**Aesthetic.** Vaulted stone, candle alcoves, water trickling along the walls. Reads as sacred. Ikons of saints set into the walls — at the right angle, the saint's face has too many teeth and the eyes are too round.

**Inhabitants:** Low-level rats. Tutorial-tier combat (callback to Marlo's `innkeeper_bottles` quest). The rats are the combat; the ikons are the writing. Player swings at vermin while a wall of dragon-eyes watches.

**Lore beats:**

- A library nook with prayer books. One marginalia note: *"today we sang the rite for three new arrivals from the East."*
- Vial-gated alcove behind a saint-ikon. Without vial: locked. With vial: opens to reveal a 1624 record fragment in the same script as the vial's seal.

**Exit:** Stairs down to `0.1.2`.

## §6 Floor 0.1.2 — The Flooded Works

NEW. Dungeon, depth 3.

**Aesthetic.** The channels widen. Stone troughs run with slow water. Brass-and-copper retrofuturist surgical equipment in alcoves — tables with leather restraints, drainage gutters, glass-lensed lamps. Nobody is currently working here. This is a ritual factory floor that's been recently used.

**Inhabitants:** A single elite — **the Prototype.** A half-formed chimera-panda. Visibly unstable, vocalizes wrong, mostly bipedal. Released or escaped from a stone pen. Hard fight for the act.

**Loot drop:** A **chimera organ.** Inert, slightly disturbing to hold. Inventory item. Reactivates narratively in Act 2 when the player encounters shipping manifests in the Jesuit canals — the player will recognize what they were carrying.

**Lore beats:**

- A rotting work log on a pedestal. Daily ritual schedule entries: *"Vespers, then the consecration of the litter. The little one bit me again today."*
- Vial-gated sealed door blocks a side passage. Without vial: locked. With vial: opens to a recently-dead priest. He was writing a confession when killed. The confession names Ashworth.

**Exit:** Stairs down to `0.1.3`.

## §7 Floor 0.1.3 — The Encounter

NEW. Dungeon, depth 3.

**Aesthetic.** Cathedral undercroft proper. Vaulted, candle-lit, an altar at the center. Dragon-eye ikons set into the vaulting watching downward. Flooded channels around the altar form a moat. A back door at the rear of the chamber (sealed during the encounter, opens after) leads to the seaway.

**Setup:** When the player enters, the rogue dragon is wounded on the altar. The Hero stands over them. Ashworth is in an alcove. Scene triggers as the player crosses the threshold.

**Why Ashworth is there:** He took a private priest's tunnel only the order knows about. He couldn't follow the rogue down to protect them, but he came after the killing started to officiate. The player walks in and understands he was always able to descend; he chose not to. The betrayal is geographic.

**Choreography.** Scripted dialogue scene with player interjections. Combat is *NOT* the default — this is a tragic scene playing out. The player's job is to interject. Combat may be triggered by specific player choices (siding with one party against another). Default state: speak, watch, choose.

### Choice mechanic

Available interjections depend on accumulated player state:

| State | Available interjection |
|---|---|
| Always | Side with Hero (kill the rogue) |
| Always | Side with Rogue (kill the Hero) |
| Always | Defer / flee |
| Vial + Lunatic-met + 1624 fragment + priest's confession + chimera organ | "I know what you are" — the fourth path |

Speaking the fourth path forces Ashworth to break the vial's seal and write the **upgraded memory-protection rite.** This is the game's first moment of Gleaner saying out loud what the player has been seeing for hours.

### Outcomes

| Choice | `seeker_alive` | `rogue_dead` | `act1_choice` | Other flags |
|---|---|---|---|---|
| Hero | true | true | `"hero"` | — |
| Rogue | false | true | `"rogue"` | — |
| Defer | true | false (dies offscreen of wounds) | `"defer"` | — |
| Exposure | true | true (wounds + Ashworth ritual completion) | `"exposure"` | `ashworth_broken=true`, `upgraded_rite=true` |

Faction favor adjustments: see §9.

**Ashworth's survival:** Ashworth is non-combatant in `0.1.3`. The player cannot kill him. He survives all four endings — too useful alive for Act 2 (he is the player's living conscience in Jesuit territory).

**Exit:** The back door at the rear of the chamber opens at end of encounter. Single physical exit. Always leads to the same destination floor (see §8).

## §8 The Back Door

The exit from `0.1.3` is a fixed seaway passage to a floor in the 3+ range. **Same physical destination for every player on every path.** What varies is reception, not geography.

**Rationale:** Branching exits multiply Act 2 authoring 4×. A single destination with a reception matrix concentrates choreography in one place (NPCs respond to flags) and keeps Act 2 maps reusable across runs.

**Destination — Jesuit District (working title, floor 3):** The grotto's flooded channels feed downstream into a Jesuit-controlled district. Player surfaces in a stone-lined canal under a chapel-house. Domestic Jesuit territory; the order's public face. Father Ashworth's chapel is a satellite of this larger institution.

**Curfew loop.** A second exit from floor 3 (a public bridge, a tavern back-door, or a Pinkerton informant's connection — TBD) leads back to the Promenade or Lantern Row. Gleaner has a day job. BPRD pays the rent on 1.6. **Curfew is enforced** (mechanically: HUD curfew clock; narratively: dispatcher reprimand on missed curfew).

## §9 Reception Matrix (Floor 3)

The faction whose territory the player surfaces in (Jesuits) gives the most immediate perks/debuffs. Other factions react with lighter pings until the player visits their HQ floors.

| `act1_choice` | Jesuit reception (immediate) | Other factions (delayed) |
|---|---|---|
| **hero** | Cold to hostile. Priests refuse blessings, fences charge double, no lay-attendant aid. One Jesuit who saw the rogue come in spits at the player on sight. | BPRD ↑↑ (Vala's promotion accelerates; replacement handler arrives on schedule). MSS neutral (uninterested). Pinkerton ↓ (saw you side with the regime). |
| **rogue** | Conflicted. Some priests welcome the player as a reluctant ally; others (Ashworth's faction) shun them for failing to spare both. Free passage through chapel-houses, one ritual healing per day, but no rite-protection above base. | BPRD ↓↓ (Vala fades; dispatcher arc enters faltering). MSS hostile (player has now interfered, MSS investigates). Pinkerton ↑ (respect for the kill). |
| **defer** | Indifferent. Player is a stranger. Standard merchant prices, no perks, no debuffs. Players have to earn their reception via Act 2 missions. | All factions: slight ↓ trust. The hardest Act 2 to navigate. |
| **exposure** | Fractured. The Jesuit district visibly splinters — some priests publicly support the player; others demand Ashworth be defrocked; a third group calls for the player's death. Reception varies room to room. Strongest perks (upgraded rite from Ashworth) and strongest debuffs (assassination attempts from regime-aligned priests). | All factions react sharply: Pinkerton ↑↑↑, MSS ↓↓↓, BPRD splinter event activates. |

This matrix should be reflected in `ACT2_NARRATIVE_OUTLINE.md §2` as the canonical handoff state. **TODO:** synchronize when this draft is approved.

## §10 Daily Cycle Post-`0.1.3`

Act 1 does not end at `0.1.3`. The descent unlocks Act 2's geography but does not close Act 1's daily routine. Gleaner is now leading a double life:

- **Day shift (BPRD):** Standard cleanup contracts on existing Act 1 floors (1.x, 2.x). Vala (or replacement) issues briefings. Player gets paid. Sleeps at 1.6.
- **Night shift (faction work, 3+):** Player travels to faction territory. Picks up faction missions. Completes them. Returns to Promenade before curfew.
- **Curfew:** Soft mechanical enforcement. Missing curfew = dispatcher reprimand, missed day-shift contract, possible BPRD favor tick down. Repeated misses → handler attention, Vala dialogue shifts.
- **Morning recount:** Each morning the dragonfire delivers the player's "memory" of yesterday. Without the rite, the recount edits out faction work. With base rite, edits are subtle. With upgraded rite (fourth path), no edits. The player is the only witness to the difference.

This double-life structure persists across Act 2 until events force a hard break (per `ACT2_NARRATIVE_OUTLINE.md` — housing seizure, dispatcher missing, etc.).

## §11 Faction HQ Geography (proposed)

Per the design lock: "put faction HQ on each floor."

| Floor | Faction | Status |
|---|---|---|
| 2.1 | BPRD (Dispatcher's Office) | EXISTS |
| 3 | Jesuit District (back-door destination) | NEW |
| 4 | Pinkerton District (domestic, blood-feud) | NEW |
| **No fixed HQ** | MSS | DESIGN |

**MSS as the spectral villain.** Rather than a visitable HQ, MSS is encountered through their *operations* — pop-up squad encounters, found documents, sabotage missions targeting their breeding pipeline. The player never walks into "MSS HQ." This makes MSS feel less containable and matches their narrative role as the foreign operator.

**Implication:** Two new exterior floors needed (3, 4) plus dungeon depths beneath each. MSS encounters are sprinkled across other faction floors as antagonist events.

## §12 Act 1 Body Plants — Required

Things that must be present in existing Act 1 floors (1.x, 2.x) for the climax to land:

- **Vala dialogue depth:** 3-4 missions through her, with at least one humanizing branch. She must be a relationship, not a quest stub. Required for Act 2 dispatcher arc to land.
- **The hearth eye in 4+ interiors:** Inn (1.2), Dispatcher's Office (2.1), Watchman's Post (2.2), and the player's own bathroom mirror or kitchen (1.6). The pattern teaches the player to notice. By `0.1.3` the player understands what the eyes are.
- **Dragon-headed BPRD staff in 3+ NPCs:** Vala plus one senior contractor in 2.1 plus one surprise (maybe the Watchman, maybe a roving inspector). NPCs treat them as ordinary in dialogue.
- **The Hero through three mouths:** Marlo (gossip), Vala (briefing), the Watchman (eyewitness). Three contradictory portraits. Player walks into `0.1.3` with a complicated picture of who the Hero is.
- **A named victim of the Hero in 2.2.2:** One corpse with a relative in town. Player has to either deliver the bad news or hide it. Reframes the Hero from abstract bad guy to "this person killed a stranger you talked to yesterday."
- **Infrastructure-as-confession quest:** One BPRD work order to maintain a dragon-power node. Gleaner does dragon maintenance with no narrative comment. Player feels the complicity.
- **Rogue's whisper:** One mention in Act 1 of "a dragon gone dark in the depths" or "a node that stopped responding." Marlo gossip, dispatcher overheard, or Pinkerton leak.

These plants must be authored before `0.1.3` ships, otherwise the climax has nothing to call back to.

## §13 The Morning Recount (Reading B locked)

The dawn voiceover is the dragonfire narrating Gleaner's memory of the previous day. The dragonfire is the antagonist; the recount is its move; the player is the only witness to what's edited out.

**Mechanic (proposed):** Each morning, a brief cinematic plays. Dragonfire voiceover summarizes "yesterday." Player sees:

- A short montage of yesterday's events as the dragonfire describes them.
- One or more **suspicion buttons** — small UI prompts ("That's not how I remember it.") that bank a **suspicion token**.
- Without intervention, the recount stands. With intervention, suspicion tokens accumulate.

**Suspicion tokens** are the player's resistance currency. They unlock:

- Clearer late-game recounts (more accurate)
- Dialogue options in faction missions (Gleaner can recall what they actually did)
- Possibly: an alternate path to the fourth-path gate (suspicion threshold + vial = "I know what you are" available even without all evidence items?)

**Authoring scope warning:** This mechanic is the most expensive piece of Act 1 to build. Each day's recount needs both the dragonfire's edited version *and* the suspicion-trigger prompts. For jam-quality, a stripped-down version (one or two recounts, narratively gated to specific story beats) is acceptable. Full per-day recounts is post-jam.

## §14 Implementation Flags

New flags this design introduces (Layer 0 `QuestTypes` registration, Layer 1 `QuestRegistry` resolution):

- `vial_acquired` (bool)
- `vial_visible_during_chapel_visit` (bool, latches per visit)
- `lunatic_heard_count` (int)
- `chapel_visit_count` (int)
- `ashworth_bark_tier` (enum: `"early"`, `"mid"`, `"late"`)
- `grotto_door_open` (bool)
- `1624_fragment_collected` (bool, gated on vial)
- `priest_confession_collected` (bool, gated on vial)
- `chimera_organ_collected` (bool, dropped by Prototype)
- `act1_choice` (enum: `"hero"`, `"rogue"`, `"defer"`, `"exposure"`)
- `seeker_alive` (bool)
- `rogue_dead` (bool)
- `ashworth_broken` (bool, true if fourth path)
- `upgraded_rite` (bool, true if fourth path)
- `suspicion_tokens` (int, banked from morning recount intervention)
- `faction_favor_{mss,pinkerton,jesuit,bprd}` (int, set at `0.1.3` outcome and adjusted by Act 2 missions)

These should be added to `data/quests.json` quest predicates and to `engine/quest-registry.js` resolvers in a follow-up implementation pass.

## §15 Open Questions / Deferred Decisions

1. **Floor 3 vs floor 4 for back-door destination.** Currently committed to 3 (Jesuit District). If the existing Act 2 plan locks 3 = Frontier Gate, the Jesuit district may need to move to 3.X or 4. Verify against `ACT2_NARRATIVE_OUTLINE.md §3` before authoring.
2. **Pinkerton HQ floor number.** Tentatively 4. May shift if Frontier Gate is preserved.
3. **MSS encounter design.** No fixed HQ. Need to propose the encounter system (random encounter timer? quest-triggered? both? location-keyed)?
4. **Suspicion token UI.** Where in HUD? How many per day? Auto-applied vs player-spent?
5. **Curfew enforcement granularity.** Hard timer or soft pressure? Penalty severity?
6. **Ashworth's death conditions in Act 2.** He survives `0.1.3`. What kills him later (if anything)? The fourth-path Jesuit fracture creates assassination attempts on him; should one succeed?
7. **Fourth-path gating items.** Currently five required (vial, Lunatic-met flag, 1624 fragment, priest's confession, chimera organ). Too restrictive? Too lenient? Playtest will tell.
8. **Day 0 deployment loop.** Does the player physically traverse floor 0 every morning, or is floor 0 a one-time tutorial floor? Affects whether the Lunatic's barks are accessible across Act 1.
9. **The "second exit" from floor 3.** What is it physically? Bridge, tavern back-door, sewage tunnel? Affects geography of Act 2 daily commute.
10. **Act 2 outline sync.** `ACT2_NARRATIVE_OUTLINE.md §2` (handoff matrix) needs to be updated with the four `act1_choice` values and faction-favor seed values from §9 of this doc.
11. **TOC entry.** Add this doc to `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` in a follow-up.

---

## Companion docs

- `STREET_CHRONICLES_NARRATIVE_OUTLINE.md` — faction dossiers, MacGuffin
- `ACT2_NARRATIVE_OUTLINE.md` — locked Act 2 design (handoff target)
- `QUEST_SYSTEM_ROADMAP.md` — DOC-107 quest engine the flags above plug into
- `BLOCKOUT_REFRESH_PLAN.md` — floor-authoring pipeline the new floors (`0.1`, `0.1.1`, `0.1.2`, `0.1.3`, `3`, `4`) flow through
- `NPC_SYSTEM_ROADMAP.md` — Ashworth, Lunatic, named-victim NPC authoring goes here
- `SEAWAY_FLOOR_DESIGN.md` — pre-existing spec for the same physical space as §4–§7 of this doc (see §16 audit)
- `Tutorial_world_roadmap.md` v2.2 — canonical floor registry; floor 3 "Frontier Gate" needs rename (see §17)
- `SUIT_SYSTEM_ROADMAP.md` — suit-to-faction mapping is hard-coded via `dungeon-schedule.js` (see §16.1)
- `engine/dungeon-schedule.js` — 3-day hero rotation; Heart is off-rotation (the dispatch release hook, see §17)

---

## §16 Audit — Alignment with Code + Existing Docs

*Completed 2026-04-17 after drafting §1–§15. Cross-references: `engine/dungeon-schedule.js`, `engine/dispatcher-choreography.js`, `engine/quest-types.js`, `docs/Tutorial_world_roadmap.md` v2.2, `docs/SEAWAY_FLOOR_DESIGN.md`, `docs/SUIT_SYSTEM_ROADMAP.md`, `docs/HERO_FOYER_ENCOUNTER.md`, `docs/Floor Details/FLOOR0_BLOCKOUT.md`.*

### §16.1 Suit → Faction mapping is already in code

`dungeon-schedule.js` line 8 explicitly states: *"Floor 0 (♥ Heart) is the host's home territory — no readiness tracking."* The three aggressing factions (♣ Club, ♠ Spade, ♦ Diamond) are each tied to a dungeon contract; Heart is deliberately off-rotation because it's home field.

This confirms the brainstorm hypothesis verbatim: **Heart = BPRD**. The other three suits must map to the other three factions in `QuestTypes.FACTIONS` (`mss`, `pinkerton`, `jesuit`). Best narrative + biome fit:

| Suit | Code dungeon | Hero type | Biome palette | Faction assignment |
|---|---|---|---|---|
| ♥ Heart | Floor 0.1.N (off-rotation, home-field) | (none) | home / approach | **BPRD** |
| ♣ Club | 2.2 Hero's Wake (Day 0 starting crisis) | Scholar | Sealab / Marine / Wild | **MSS** (Chinese operatives, chimera farms, seaborne shipping) |
| ♠ Spade | 1.3.1 Soft Cellar (Day 3) | Seeker | Cellar / Earth / Burial | **Pinkerton** (detective seekers, underground blood feud) |
| ♦ Diamond | 3.1.1 Ironhold Depths (Day 6) | Crusader | Foundry / Crystal / Construct | **Jesuit** (literal crusader archetype, crystal cathedrals, 1624 order) |

**Consequence for Act 1:** No collision. The Heart = BPRD assignment is native. The Jesuit-at-Diamond-biome alignment means the floor-3 "Jesuit District" we drafted in §11 slots cleanly into the `3.1.1 Ironhold Depths` dungeon that's already on the Diamond hero day. The "Ironhold" label needs to be renamed or reframed — see §17.

**Action item:** Update `SUIT_SYSTEM_ROADMAP.md` §Biome Alignment to add a "Faction" column wiring Heart→BPRD, Club→MSS, Spade→Pinkerton, Diamond→Jesuit. Update `dungeon-schedule.js` JAM_CONTRACTS to add a `factionId` field on each contract (purely informational; the schedule doesn't need to branch on it yet).

### §16.2 The Seaway spec is the Act 1 climax (massive alignment)

`docs/SEAWAY_FLOOR_DESIGN.md` (authored 2026-04-06) already lays out floors `0.1`, `0.1.1`, `0.1.2` as:

- **Ancient 1624 Jesuit apothecary laboratory** (cave + lab wings)
- **BPRD modern off-books storage** (cache + vault wings) grafted onto the ancient structure
- **Surgical theater at the deepest point** (`0.1.2`) with an altar-shaped stone table, tiered seating, drainage channels

This is *identical* to the Jesuit chapel-grotto descent we drafted in §4–§7 of this doc, right down to the Jesuit cross above the lintel at `0.1`, the 1624 references, the chimera etchings in the cave wing, and the operating-table "altar" at `0.1.2`. The Seaway doc was framed as mid-Act 2 content behind a `seaway_open` flag. The brainstorm outcome rebrands the same space as Act 1 climax content.

**Concrete collision:** The Seaway doc uses three floors (`0.1`, `0.1.1`, `0.1.2`). The Act 1 draft uses four (`0.1`, `0.1.1`, `0.1.2`, `0.1.3`). The deepest Seaway floor `0.1.2` (surgical theater) is currently the Act-2-climax combat arena. The Act 1 draft places the rogue dragon encounter at a new `0.1.3`.

**Proposed reconciliation:** Keep the four-floor structure but remap labels.

| Floor | Seaway doc name | Act 1 name (this doc) | Reconciled name + purpose |
|---|---|---|---|
| `0.1` | Seaway Vestibule | The Chapel | **The Chapel (Jesuit) + Seaway Vestibule** — one space, dual function. Ashworth's post + equipment locker + descent door. |
| `0.1.1` | Seaway Tunnels | Upper Grotto | **Upper Grotto / Cache + Cave wings** — rats + 1624 ikon fragment + BPRD evidence cages |
| `0.1.2` | Seaway Deep (surgical theater) | The Flooded Works | **The Flooded Works / Lab + Vault wings** — prototype chimera-panda elite + priest's confession + surgical apparatus + drowned alcoves |
| `0.1.3` | (not in Seaway doc) | The Encounter | **The Surgical Theater / Altar Chamber (NEW)** — the altar-shaped table, tiered seating, the rogue+Hero+Ashworth confrontation |

The original Seaway `0.1.2` (surgical theater) becomes the new `0.1.3`. What was `0.1.2` (vault + lab wings) stays, and `0.1.3` is the deepest floor — the ritual space where the altar sat for 400 years. The narrative slots cleanly because the Seaway's own §5 already frames `0.1.2` (now `0.1.3`) as "a single large chamber with antechambers ... built for an audience. Tiers of stone seating ring the central operating platform." That's the rogue encounter chamber we drafted.

**Consequence for `seaway_open` flag:** Currently gated behind mid-Act 2. Must be moved to Act 1 Day-7-or-Week-2 as the dispatch-release trigger (see §17). The "wall-becomes-door" reveal at `0.1` still works — the door to `0.1` is WALL until the dispatch (`heart_dispatch_issued` flag) fires. First time the player walks past the spot on floor 0 after dispatch, it's a door. Before dispatch, it's a wall.

**Vault wing faction items collision:** The Seaway doc's §4.4 table assigns a different retrieval item to each faction:

| Faction | Item | What it actually is |
|---|---|---|
| MSS | Dragon resonance beacon | Chimera tracking device |
| Pinkertons | Classified personnel dossier | Ashworth's 400-year service record |
| Jesuits | Containment seal blueprint | Map of chimera facilities worldwide |
| BPRD | Anomaly source triangulation data | Coordinates of every living dragon |

These can be **preserved but gated by Act 2 reception instead of Act 1 faction affiliation**. When the player re-enters after crossing the back door, their reception at the destination floor determines which vault wing item they can retrieve on a return trip. The Act 1 pass only gives them the chimera organ (from the `0.1.2` elite) and the 1624 fragment (from the `0.1.1` ikon). The vault items become Act 2 reputation-gated rewards, not Act 1 branches.

**Dispatcher-found-in-cave-wing collision:** Seaway §4.5 posits "the original dispatcher" hiding in the cave wing bedroll. This must be repurposed. Proposal: **the bedroll and ration packs are Father Ashworth's own staging**. Ashworth has been prepping the grotto for the rogue dragon's arrival for weeks, sleeping rough to avoid Chapel surveillance. The bedroll in the cave wing is his. The player discovers this environmentally. No "original dispatcher" NPC needed; the Seaway doc's scene reads as Ashworth's panic-cache when repurposed.

**Action item:** Rewrite `SEAWAY_FLOOR_DESIGN.md` to:
1. Add the new `0.1.3` (surgical theater / altar chamber) and move its old `0.1.2` content there.
2. Reframe `0.1.2` as Lab + Vault wings (drowned works + priest's confession).
3. Reframe the original dispatcher as Ashworth's bedroll cache.
4. Move `seaway_open` trigger from mid-Act 2 to the Act 1 Heart-dispatch event.
5. Keep the vault-wing faction-item table but gate it on Act 2 reputation, not Act 1 choice.

Defer until after Act 1 draft is locked. Currently captured as a §15 open question (#10, now expanded).

### §16.3 Floor 3 collision — Frontier Gate vs Jesuit District

`Tutorial_world_roadmap.md` v2.2 §3.1 registers floor `"3"` as **"Frontier Gate"** with `"3.1"` as "Armory" and `"3.1.1"` as "Deep Vaults" (later renamed "Ironhold Depths" in `dungeon-schedule.js`). Act 1 draft §11 places the **Jesuit District HQ** at floor 3.

Given §16.1 (Diamond = Jesuit), the Diamond dungeon `3.1.1 Ironhold Depths` IS the Jesuit dungeon. The building at `3.1` and the exterior at `3` should be Jesuit-coded. The "Frontier Gate" label is a stale placeholder from before the faction audit.

**Proposed rename:**
| Floor | Old label | New label |
|---|---|---|
| `3` | Frontier Gate (exterior) | **Cathedral Square** or **Jesuit Precinct** (exterior, Foundry-adjacent biome, lantern-lit) |
| `3.1` | Armory (interior) | **Reliquary** or **Jesuit Scriptorium** (interior, ritual vestments + archives) |
| `3.1.1` | Deep Vaults / Ironhold (dungeon) | **Ironhold Reliquary** (dungeon — retain Diamond/Crystal palette; frame as cathedral under-vault not fortress armory) |

Retaining "Ironhold" is acceptable — iron + crystal + cathedral reads as a Foundry/Jesuit hybrid. The Crusader hero type already on Day 6 of the rotation works perfectly for Jesuits. The dispatcher and player-character read the hero as "another crusader"; the player reads it as "a Jesuit sending Crusaders against a dragon," which is the faction-indictment reveal Act 1 is setting up.

**Pinkerton HQ floor.** §15 open question #2 tentatively placed this at floor 4. Floor 4 is currently unregistered anywhere. Proposal: register `4` as **"Pinkerton Precinct"** (exterior), `4.1` as **"Detective Bureau"** (interior, no dungeon yet). Pinkerton Earth/Cellar biome fits — brick precincts, sooty alley walls, iron grates. Defer to post-Act-1-lock; not required until the back-door reception matrix in §9 is wired.

**MSS "spectral HQ".** §11 + §15 #3 noted MSS has no fixed HQ. This stays. Random-encounter system stays deferred (task #104).

### §16.4 Floor 0 — No collision, one missing piece

`FLOOR0_BLOCKOUT.md` shows floor 0 has six meadow pods, a central road, and DOORs to 0.5.1, 0.5.2, 0.5.3, 0.5.4 (building interiors). **No existing door to `0.1`.** The Seaway doc's "wall-becomes-door" technique fits cleanly — we pick a floor-0 location that's currently WALL (the shrub perimeter is a strong candidate, since player eyes don't read shrub as load-bearing structure).

**Proposed `0.1` door location:** The eastern facade south of the Roman Arch, between the lower courtyard (42,28) and the SE corner. Specifically a currently-`|` facade tile near (42,30). Before dispatch: normal facade. After dispatch: door opens into a stone stairwell down to Chapel `0.1`.

Alternate location: behind the Dozing Vagrant NPC in the SW house pod (floor 0.5.3 building), framing Chapel `0.1` as a basement under the house. More intimate; weaker spatial payoff. Prefer facade location.

**Ashworth placement on floor 0 (day 0).** §3 of this doc places Ashworth at "the gate to floor 1." The gate is the Roman Arch at (44,17). Two viable spots:

1. **In front of the arch at (43,17) or (43,18)**, blocking passage until the player interacts (force-turn pattern, same as Dispatcher on floor 1 gate). Strongest narrative read; zero combat risk; reinforces "deployment blessing as rite."
2. **Beside the arch at (43,15) or (43,20)** (pillar flanking positions), barking on proximity but not blocking. Less forceful; player might bypass the vial handoff.

Prefer option 1. Pattern is already implemented via `DispatcherChoreography`; Ashworth can use the same collision-mask + bark-cascade pattern with a different NPC stack and a vial-pickup scripted moment. Removes on day-1 morning.

**Lunatic placement on floor 0.** Floor 0 already registers interactive NPCs per §5 zone table (Interactive Traveler at NC bonfire, Old Camper at NE shack, Dozing Vagrant at SW house, Off-duty Gleaner at SC bonfire). The Lunatic can replace the Traveler at the NC bonfire (central gathering spot, natural for a ranting figure). Or add a new standalone ambient NPC — prefer NC bonfire replacement for economy of NPCs.

**Action item:** Update `FLOOR0_BLOCKOUT.md` §Zones with the `0.1` door location and Ashworth + Lunatic entries. Task #107 author-pass covers this.

### §16.5 Dispatcher release mechanism — gap confirmed

`engine/dispatcher-choreography.js` contains the complete gate-encounter choreography (collision mask, force-turn, bark cascade, key-redirect, cinematic camera). The current dispatch pattern is **single-path**: Dispatcher says "head east to cleaning truck on Lantern Row," player gets the keyring, walks through gate, goes to Dispatcher's Office (2.1), gets standard cleanup contract.

**No current code path** hands the player a Heart-dungeon dispatch. The dispatch system routes through `DungeonSchedule.getNextGroup()` which only returns Club/Spade/Diamond contracts — Heart is excluded by design (line 314 of `dungeon-schedule.js`: *"Non-combo-eligible groups (Heart) don't affect streak at all"*).

This means the Act 1 climax release needs a **new dispatch channel**. See §17 for the design.

### §16.6 Hero Foyer encounter — unaffected

`docs/HERO_FOYER_ENCOUNTER.md` is scoped to floor `2.2.1` (Hero's Wake B1) and uses the `CinemaController` + scripted hero walk. This is the Day-0 Club starting crisis. Unaffected by Act 1 climax — different floor, different hero encounter, different beat.

**Reuse opportunity:** The `0.1.3` encounter in §7 of this doc (rogue + Hero + Ashworth confrontation) is a cinematic that wants the same systems: `MovementController.freeze`, `MouseLook.lockYaw`, `Raycaster.setLetterbox`, `CinemaController.play`, `DialogBox` modal cascade, `Lighting.addBeacon` for the altar. All of these were built for 2.2.1 and are reusable. `0.1.3` doesn't need new systems; it needs new data (beat table, bark pool, layout JSON).

Register the `0.1.3` cinematic as a new scene in `data/foyers/` (`data/foyers/rogue-encounter.js` following the `hero-wake.js` convention).

**Action item:** Task #108 should reference `HERO_FOYER_ENCOUNTER.md` §5 as the reuse template.

### §16.7 Faction favor and flags — enum already exists

`engine/quest-types.js` line 103 defines:

```js
FACTIONS = { MSS: 'mss', PINKERTON: 'pinkerton', JESUIT: 'jesuit', BPRD: 'bprd' }
```

This matches §14's flag list exactly. `faction_favor_{id}` flags and `act1_choice` flag can be added to `data/quests.json` and resolved via `QuestRegistry.setResolvers` without engine changes. Task #109 covers this.

The `act2_unlocked` flag (already completed per task #62) is the existing Act-2-gate flag. The new Act 1 flags fire before it and set the Act 2 initial conditions §9's reception matrix reads.

### §16.8 Summary of code-vs-doc alignment

| Vector | Status | Action |
|---|---|---|
| Suit → faction mapping | **Aligned in code, not documented** | Add to `SUIT_SYSTEM_ROADMAP.md` |
| Heart = BPRD home field | **Aligned in code** | Zero work; document the intentional choice |
| Floors `0.1`/`0.1.1`/`0.1.2` exist as Seaway | **Collision — needs rebrand** | Rewrite `SEAWAY_FLOOR_DESIGN.md` (§16.2 action list) |
| Floor `0.1.3` (new) | **Not yet authored** | Author via World Designer → BO-V; task #108 |
| Floor 3 = Frontier Gate | **Stale label** | Rename to Cathedral Square / Jesuit Precinct |
| Floor 0 `0.1` door location | **Unassigned** | Pick east facade near (42,30); task #107 |
| Ashworth on floor 0 | **No NPC stack exists** | Author NPC composer preset; task #105 |
| Lunatic on floor 0 | **No NPC stack exists** | Author NPC composer preset; task #106 |
| `FACTIONS` enum | **Already in code** | Zero work |
| `faction_favor_*` flags | **Not in quests.json yet** | Task #109 |
| Dispatch release for Heart dungeon | **Code gap** | See §17 |
| CinemaController for `0.1.3` | **Already in code** | Reuse; author scene data |
| `seaway_open` trigger | **Gated to mid-Act-2** | Move to Act-1 Heart dispatch |

---

## §17 Dispatch Release — Week 1 vs Week 2

The brainstorm posed two release options. This section commits to a choice, spec's the trigger, and documents the alternative as the post-jam extension.

### §17.1 Decision: hybrid (Week-1 early unlock + Week-2 critical dispatch)

**Jam-scope release (Week 1, Day 3 or Day 4): Heart home-field unlock.** The `0.1` door on floor 0 becomes walkable, an Ashworth bark at the Chapel triggers on first visit, and the player can explore `0.1`/`0.1.1`/`0.1.2` at their own pace. No urgent dispatch; `0.1.3` is gated behind a Chapel back-door lock that requires vial checks at `0.1.1` and `0.1.2`.

**Act-1-climax release (Day 7 or Week 2, post-jam-polish): critical Heart dispatch.** The BPRD dispatcher issues a formal dispatch to the Heart dungeon for the first time — framed in-fiction as "we have an anomaly in the Chapel basement, none of the other crews responded, you're on it." This flips the Chapel from "open side quest" to "the reason you're here." `0.1.3` unlocks. Ashworth completes the rite. Encounter fires.

**Why hybrid.** The Week-1-only option (single encounter dispatch) skips all environmental seeding and makes the encounter feel unearned. The Week-2-only option (sidequests-first then critical dispatch) requires authoring 3–5 `0.1.N` sidequests, which is out of scope for the jam. The hybrid reuses the Week 1 window as environmental-seeding time (player pokes at the Chapel, hears Ashworth bark, finds the 1624 fragment, discovers the elite at `0.1.2`, accumulates the vial checks) and the Week 2 dispatch as the forcing function.

**Timeline in the 8-day jam arc:**

| Day | Scheduled rotation | Heart-channel state |
|---|---|---|
| 0 | ♣ Club (2.2 Hero's Wake) — starting crisis | Ashworth hands vial; `0.1` door is WALL |
| 1 | — | Vial in inventory, Lunatic bark available |
| 2 | — | — |
| 3 | ♠ Spade (1.3.1 Soft Cellar) | **`heart_unlock_issued` fires.** `0.1` door becomes DOOR. Chapel barks activate. |
| 4 | — | Player explores 0.1 → 0.1.1 → 0.1.2 between cleaning shifts. Vial checks fire. |
| 5 | — | Ashworth dialogue advances. Priest's confession at 0.1.2 names Ashworth. |
| 6 | ♦ Diamond (3.1.1 Ironhold) | Player should have all four vial fragments by now |
| 7 | — | **`heart_dispatch_issued` fires.** Formal BPRD dispatch. `0.1.3` door in Chapel opens. Encounter fires on arrival. Act 1 outcome flags set. |
| 8 | Arc summary | Post-encounter. Player returns home; Act 2 begins. |

Day 7 is optimal because all three aggressing-faction hero days have resolved by then; the combo streak is locked in; the player has maximum agency for the climax with no scheduled interference.

**Day 7 can slip to Day 8 or 9 for post-jam polish.** If we want the full Stardew-paced Week 2 treatment post-jam, extend the arc: Day 8 = Ashworth intensifying pressure, Day 9 = second Hero spotting near Chapel, Day 10 = critical dispatch + encounter.

### §17.2 Trigger: `heart_unlock_issued` (Day 3)

**What fires it.**
- Day counter reaches 3 (from `DayCycle.getCurrentDay()`)
- Player has the vial in inventory (`player.flags.has_jesuit_vial`)
- `act2_unlocked` is false (belt-and-braces; shouldn't be reachable if it's true)

**What it does.**
1. Sets `player.flags.heart_unlock_issued = true`
2. Fires `QuestChain.onFlagChanged('heart_unlock_issued', true)` — advances the relevant quest step
3. On next arrival at floor 0, runs a post-pass that swaps the facade tile at `(42,30)` from WALL to DOOR (or whichever tile is chosen in §16.4). Tile swap persists in the floor cache.
4. Registers `doorTargets['42,30'] = '0.1'` on floor 0's data
5. Ashworth spawns at Chapel `0.1` (if not already) with first-visit bark cascade
6. Toast: "A door you hadn't noticed. On The Approach. Father Ashworth keeps a chapel." (dim register, short TTL)
7. DebriefFeed entry: "New area: The Chapel" with link-to-floor minimap hint

**Wiring point.** `engine/day-cycle.js` `onDayAdvance` hook. Add a side-effect block that checks the three conditions and fires the flag. Alternative: register as a declarative quest step in `data/quests.json` with a `day-reaches` predicate (new predicate kind — may need engine support, defer to a later slice).

### §17.3 Trigger: `heart_dispatch_issued` (Day 7)

**What fires it.**
- Day counter reaches 7
- Player has unlocked `0.1` (`player.flags.heart_unlock_issued`)
- Player has all three vial check completions (`flags.vial_1624_fragment`, `flags.vial_priest_confession`, `flags.vial_organ_retrieved`) **OR** is on the fourth-path-forfeit track
- `act2_unlocked` is false

**Consequence.** Act 1 canonically ends on Day 7 evening regardless of whether the player completed the 0.1.3 encounter. If they didn't, `act1_choice = 'timeout'` flag fires at Day 7 midnight and the encounter is force-triggered on next Chapel visit with a degraded set of choices (no "expose" option available).

**What it does.**
1. `player.flags.heart_dispatch_issued = true`
2. Dispatcher force-turn fires on floor 1 next arrival (reuses `DispatcherChoreography` with a new dialogue tree key — `dispatcher.heart_critical` instead of the current `intro` tree)
3. New bark cascade: *"Gleaner. Sit down. I need to talk to you about the Chapel... something opened up on Day 3 and three crews have gone dark. You're next. Don't die."*
4. Implicit contract: the player must descend to `0.1.3` by end of day
5. Quest marker shifts from wherever it was (Chapel `0.1`) to `0.1.3`
6. Ashworth at Chapel barks a final line when the player visits: *"Then it's today. Come with me."* — Ashworth joins as an AI-pathed companion NPC for the descent to `0.1.3`, matching the companion-NPC pattern from the Seaway doc's §4.5 escort sequence

**Wiring point.** Same as §17.2. Dispatcher choreography needs a dialogue-tree branch on the `heart_dispatch_issued` flag — that's a data-only change to `engine/dispatcher-choreography.js`'s `showDispatcherGateDialog()` function (add a third branch alongside `firstTime` and `return_greeting`).

### §17.4 Why Heart is off the main combo rotation

The existing `dungeon-schedule.js` comment (line 314) says Heart is "non-combo-eligible." This is a *mechanical* statement: Heart hero days don't affect the streak. The narrative reason: **Heart is the player's faction, so Heart dungeons are not adversarial Hero targets**. The Heart dispatch is a *special event*, not a recurring rotation beat. This is why it gets its own trigger path (§17.2, §17.3) rather than a contract entry in `JAM_CONTRACTS`.

**Do not add Heart to `JAM_CONTRACTS`.** Doing so would pit a Hero against the player's own faction on a rotation, which breaks the fiction. The Heart dispatch is one-shot and narrative-coupled.

### §17.5 Post-jam expansion (Week 2 sidequest bed)

For the post-jam fresh-bug-free release (April 25 target), extend Day 3–Day 6 with authored Chapel sidequests:

- **Day 3: Ashworth's bark intro + vial acquisition continues**
- **Day 4: Sidequest — "The Missing Acolyte"** — a young Jesuit has gone missing; player tracks them to `0.1.1` Cave wing, finds their bedroll and empty ration packs (environmental — the missing acolyte IS Ashworth; the bedroll is his; player doesn't know yet). Returns to Chapel with the bedroll. Ashworth reacts. +1 suspicion token.
- **Day 5: Sidequest — "Ikon Restoration"** — Ashworth asks the player to clean a defaced ikon in the Cave wing. This is where the 1624 fragment is hidden; cleaning reveals it. Tests the vial.
- **Day 6: Sidequest — "The Drowned Works"** — Ashworth sends the player to check a leak in the Lab wing. They discover the prototype chimera-panda elite. Combat. Retrieves the organ. Tests the vial at `0.1.2`.
- **Day 7: Critical dispatch as §17.3.**

Each sidequest is a short in-and-out run (15–20 minutes) that surfaces one environmental-storytelling beat. The cumulative effect is the player has explored the entire Chapel + grotto layout before the Day 7 encounter, making the climax arrival feel like a return, not a discovery.

**Post-jam only.** Not in scope for April 5 submission.

### §17.6 Open questions specific to §17

- **Heart-unlock toast vs. silent unlock.** Does the player get an on-screen toast when the `0.1` door opens, or do they discover it by walking past? Prefer silent discovery for the "mental map cracks" moment per Seaway doc §2. Trade-off: some players may never notice if the facade isn't eye-level.
- **Does Ashworth follow the player into `0.1.3`?** §17.3 says yes (companion NPC pattern). This changes the encounter choreography — four parties in the room (Hero, rogue, Ashworth, player) instead of three that the player meets in stages. Needs revision of §7 in this doc. Recommendation: yes, Ashworth follows, but re-draft §7 accordingly.
- **Does the dispatcher's Day 7 bark reference the `0.1.3` chamber explicitly, or just say "the Chapel basement"?** Explicit is clearer, vague is more atmospheric. Prefer vague.
- **What happens to the player's standing cleaning shift on Day 7?** The critical dispatch overrides standard work orders. Document as "the MorningReport on Day 7 acknowledges the Heart dispatch supersedes the normal crew rotation."


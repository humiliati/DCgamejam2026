# Dungeon Gleaner — Core Game Loop & Juice Design

**Created**: 2026-03-29  
**Scope**: Identifies the game's three toyful pillars, defines the narrative hero cycle and day/night pressure system, expands peek interactions for the time cycle, specifies dungeon persistence across work days, details the mailbox hero-run report format, catalogs every dungeon reset element, defines the daily vermin refresh and reanimation economy, and specifies fail state design (death hero-rescue with cycle shift, curfew NPC wink, humiliation gradient).  
**Audience**: All team members — engineers, artists, and the designer.

---

## 1. The One-Line Pitch

> **You are the dungeon's janitor. Clean it up, restock it perfectly — and pray the heroes don't wreck it all when they come back tomorrow.**

The game is a **toyful maintenance loop** framed as blue-collar dungeon work. The player is never the hero. They are the crew that makes heroism possible. The central tension is: *can I get this place ready before the next wave of adventurers kicks in the door?*

---

## 2. The Three Core Pillars

These three loops must each feel good in isolation. Together they compound into the full experience.

| # | Pillar | One-Liner | Primary Verb |
|---|--------|-----------|-------------|
| 1 | **Clean** | The dungeon is trashed. Make it spotless. | Scrub |
| 2 | **Restock** | The crates are empty. Fill them back up. | Fill |
| 3 | **Endure** | Heroes are coming. Survive the cycle. | Prepare |

The pillars must feel distinct. Cleaning is tactile and spatial. Restocking is economic and inventory-driven. Enduring is strategic — managing time, choosing which floors to prioritise, and living with the consequences when the heroes arrive.

---

## 3. Kingdom Two Crowns Economy Model

Kingdom Two Crowns works because the coin drop is constant, building is visible, and the payoff is immediate. The Gleaner economy borrows this structure directly.

### 3.1 The Drip → Jackpot Structure

```
Loot corpse        → 1–2 coins   (ambient drip)
Seal a crate       → 2–5 coins   (mid-beat reward)
Complete a floor   → 10–30 coins (act-close payout)
Perfect readiness  → Rare card   (jackpot)
```

Every interaction produces *something*. The player always has a reason to do the next small thing. The jackpot (rare combat card) is dangled just far enough away to keep the loop spinning.

### 3.2 Visible Economy

The readiness score (0–100%) is always on screen during a maintenance run. It is the economy's "kingdom wall" — a single number the player obsesses over. Sub-scores break it down:

| Sub-score | Weight | Quick Read |
|-----------|--------|-----------|
| Crates restocked | 25% | Crate fill bar |
| Tiles cleaned | 20% | Grime overlay intensity |
| Traps re-armed | 15% | Trap icon pulse |
| Puzzles scrambled | 10% | Puzzle tile tint |
| Corpses cleared / enemies restocked | 15% | Corpse glow / NPC count |
| Doors relocked & buttons reset | 10% | Lock icon / button state |
| Vermin repopulated (daily bonus) | 5% | Rat/bat ambient count |

**Design rule:** Every action the player takes must visibly move at least one of these bars. If an action doesn't move a bar, it doesn't belong in the core loop.

### 3.3 "Just One More Crate" Pull

The slot-filling mechanic in `crate-system.js` creates a completion pull identical to Kingdom Two Crowns' coin-drop-to-upgrade cycle:

1. Player opens a 4-slot crate. 2 slots are already filled (natural hydration).  
2. Player fills the 3rd slot from their bag.  
3. The 4th slot glows: *one more item and it seals*.  
4. Player **must** find that last item. This creates spontaneous exploration.  
5. Crate seals → reward coins drop with a satisfying *clink* SFX sequence.  
6. The next crate is right there. It has empty slots.

The dungeon is its own supply network. The player learns to read the floor for the items they need before they need them.

---

## 4. The Hero Cycle — Narrative Deploy

### 4.1 Design Philosophy: No Button, Just Consequences

The original concept was a "Bridge Simulator" deploy button — press it, watch the hero go. That design was mechanical: a UI element disconnected from the world. The refined model removes the button entirely. **Heroes come whether you're ready or not.**

The player's job isn't to *press a button*. It's to *prepare the dungeon before the heroes arrive*. The deploy is an event that happens *to* you, not an action you take. This reframes the maintenance loop from a test-lab experiment to a blue-collar career: punching the clock, doing the work, hoping you got enough done before the next shift of adventurers kicks in the door.

### 4.2 The 3-Day Hero Cycle

Heroes arrive on a **fixed cadence**. Every 3rd in-game day, the Adventurer's Guild dispatches a new party into the dungeon chain. The Gleaner cannot stop this. They can only influence *where* the heroes go.

```
Day 1:  WORK DAY     — Clean, restock, re-arm. Dungeons are yours.
Day 2:  WORK DAY     — Continue maintenance. Pressure builds.
Day 3:  HERO DAY     — Heroes arrive at dawn. Results by dusk.
        ─────────────────────────────────────────────────
Day 4:  WORK DAY     — Clean up the new mess. Collect payout.
Day 5:  WORK DAY     — Restock for next cycle.
Day 6:  HERO DAY     — Heroes return.
        ...and so on.
```

The 3-day cadence creates natural rhythm. Two days of prep, one day of reckoning. The player always knows: *"Heroes come the day after tomorrow."*

### 4.3 The Taskmaster NPC — Baiting Heroes

The **Taskmaster** is an NPC at the Gleaner's Guild (Floor 1.3) who manages the Adventurer's Registry. Talking to the Taskmaster on a work day lets the player **mark specific floors as "ready for heroes"**.

**Interaction flow (peek-style dialog):**
1. Face the Taskmaster → peek shows a clipboard with a floor list.
2. Each floor entry shows its current readiness % and a toggle: `☐ OPEN` / `☑ BAITED`.
3. The player checks floors they feel are ready. Unchecked floors are locked — heroes skip them.
4. On Hero Day, heroes *only* enter baited floors (plus any floor ≥ 60% readiness automatically).
5. If no floors are baited and none are above threshold, heroes wander the town and leave disappointed. **No payout — but no damage either.** The Gleaner wasted a cycle.

**Strategic depth:** The player can bait a floor at 50% readiness if they're desperate for coins. The heroes will go in, but the low readiness means the hero struggles — fewer crates to loot, fewer monsters to fight. The hero may even *die* in a poorly stocked dungeon (the traps and monsters the Gleaner placed are the dungeon's defenses). A dead hero means no payout *and* the dungeon is half-trashed anyway. Risk/reward.

**Taskmaster dialogue lines:**
- *"Mark the floors you're proud of. Heroes won't touch the rest."*
- *"You sure about the Cellars? Forty percent ready is asking for trouble."*
- *"No floors marked? Suit yourself. The Guild still charges board."*

### 4.4 Implied Deploy — The Player Discovers Results Naturally

The hero run happens overnight (between Day 2 night → Day 3 dawn) or during the daytime of Hero Day while the Gleaner is topside. The player **never watches a CCTV feed or presses a button**. Instead, they discover the results organically:

| Discovery Method | Where | What the Player Learns |
|-----------------|-------|----------------------|
| **Morning mail** | Mailbox at player's home | *"Adventurer's Guild report: Coral Cellars — 3 heroes dispatched, 2 returned. Payout: 47 coins."* |
| **NPC barks** | Town NPCs on Hero Day | *"Did you hear? A Scholar went into the Bazaar cellar and solved every puzzle in ten minutes."* |
| **Re-entering the dungeon** | Stairs down on Day 4 | The mess tells the story. Smashed crates, dead monsters, triggered traps. The Gleaner reads the aftermath. |
| **Taskmaster debrief** | Gleaner's Guild | Full breakdown: which hero entered, what they smashed, readiness-based payout. |
| **Dungeon graffiti** | Wall textures on trashed floors | Heroes leave chalk marks: *"SEEKER WAS HERE"*, tally marks of kills. Environmental storytelling. |

This makes the hero run feel like a *force of nature* — like the seasons in Stardew Valley — not a button press. The player's relationship with the hero cycle is: prepare → wait → discover → react.

### 4.5 What Heroes Do (Unchanged from Original Design)

Hero behavior is deterministic per type. The player learns patterns over multiple cycles and optimizes accordingly.

| Hero Type | Smashes | Solves | Loots | Traps |
|-----------|---------|--------|-------|-------|
| Fighter (Seeker) | All breakables | Brute force | Heavy | Triggered |
| Scholar | Puzzles only | Everything | Light | Avoided |
| Rogue (Shadow) | Locks only | Bypass | Cherry-picked | Bypassed |
| Crusader | Monster stocks | None | Armour only | Triggered |

The Taskmaster tells the player which hero type is scheduled for the next Hero Day. The player can then prioritize: *Crusader coming? Over-stock the monster crates. Scholar? Scramble the puzzles perfectly.*

### 4.6 Payout Tiers (Based on Readiness at Hero Arrival)

| Readiness | Result | Payout |
|-----------|--------|--------|
| **< 40%** | Hero dies or retreats | 0 coins. Dungeon half-trashed. Wasted cycle. |
| **40–59%** | Hero struggles through | Reduced payout (50% of standard). |
| **60–79%** | Standard run | Full payout (coins + seal bonuses). |
| **80–89%** | Clean run | +50% bonus coins. |
| **≥ 90%** | Perfect run | Double coins + guaranteed rare card roll. |

**Full-chain bonus:** If *all* floors in a dungeon chain are ≥ 60%, a chain multiplier applies (+50% total). This incentivizes maintaining entire dungeon complexes, not just cherry-picking the easiest floor.

---

## 5. Day/Night Cycle — Living World Pressure

### 5.1 Why the Cycle Exists

The 3-day hero cycle provides macro-pressure (heroes come every third day). The day/night cycle provides **micro-pressure** within each work day. Together they create the Stardew Valley "just one more thing" pull: the player is never forced to stop, but the world moves on whether they're ready or not.

The Day/Night cycle provides:
1. **Natural pacing** — the player can't grind infinitely on one floor.  
2. **Economic structure** — shops open at dawn, close at dusk. The Gleaner's Guild posts work orders each morning.  
3. **Skybox storytelling** — the world visually communicates time passing. The dungeon's mood shifts.  
4. **Death consequences** — staying out past curfew or dying in the dungeon means waking up at home with debuffs.

### 5.2 The Player's Home

The Gleaner lives in a **dedicated bunk room at Floor 1.6** — a rented room off The Promenade (Floor 1), reached via the DOOR at (17, 7) on the Promenade's east wall. This is the player's **anchor point** — the place they always return to. It is to Dungeon Gleaner what the farmhouse is to Stardew Valley.

> **Floor ID:** `"1.6"` (depth 2, interior). 10×8 hand-authored grid. Biome: `home` (warm amber plank walls, dark wood floor). See TUTORIAL_WORLD_ROADMAP §18.5 for the full grid layout.
>
> **Day 1 note:** On the very first session the home floor contains the player's **work keys** (DOOR tile at 5,3). The player must retrieve these before the Dispatcher NPC will clear the dungeon gate. This establishes Floor 1.6 as a destination before it's established as a *home* — the player discovers the hearth before they learn it's theirs.

**Home features:**
- **Bed** (bonfire tile, 2,2) — Interact (peek-style) to sleep and advance to next day. Rest bonuses applied. BarkLibrary pool: `home.morning.wakeup`.
- **Work Keys** (DOOR tile, 5,3, Day 1 only) — Interact to collect. Triggers `_onPickupWorkKeys()` in Game. Tile reverts to EMPTY after pickup.
- **Stash chest** — Persistent storage. Items survive death (existing `stash` in Player state).
- **Mailbox** (pillar tile, 2,5) — Read overnight results: hero run reports, Guild notices, NPC gossip. New mail indicated by a flag icon on the HUD.
- **Mirror** — Quick stat/loadout check (existing HUD info, presented diegetically).
- **Wall clock** — Shows the current day number and time of day. Also shows which day in the hero cycle: `"Day 2 of 3 — Heroes arrive tomorrow."`.

**Fail-state respawn:** After curfew collapse or death in a depth 1–2 area, the player respawns at Floor 1.6 spawn point (5, 6). The `IntroWalk.SEQUENCES.HOME_DEPARTURE` named sequence scripts a short walk to the exit door before restoring free movement. BarkLibrary pool: `home.morning.curfew_wakeup` (distinct tone from normal wake-up).

The existing `Skybox` module has 7 biome presets with zenith/horizon colour pairs. The day/night system interpolates between **three sky states** per biome, driven by the game clock:

| Sky State | Clock Position | Zenith Shift | Horizon Shift | Stars |
|-----------|---------------|-------------|--------------|-------|
| **Dawn** | 0–15% of day | Indigo → warm blue | Dark → peach/amber | Fade out |
| **Day** | 15–75% of day | Biome default | Biome default | Off |
| **Dusk** | 75–90% of day | Blue → orange/purple | Default → deep red | Fade in |
| **Night** | 90–100% + overnight | Deep indigo/black | Dark horizon | Full |

**Implementation:** `Skybox.render()` already accepts a `time` parameter for the title screen animation cycle. The day/night system passes the game clock's normalised time (0.0–1.0) through the same pipeline. Each biome preset gets three additional colour stops (`dawn`, `dusk`, `night`) alongside its existing base palette. `Skybox.lerp()` smoothsteps between them.

**Dungeon skybox:** Interior (depth 2) and dungeon (depth 3) floors have no sky. But the **door peek** for exits to exterior floors shows a glimpse of the current sky state — the door crack reveals whether it's day, dusk, or night outside. This is a subtle time cue: *"It's getting dark. I should head up."*

### 5.4 Day Structure

```
──────────────────────────────────────────────────────
 DAWN (0–15%)
   ↓  Gleaner wakes at home (bed). Mail arrives.
   ↓  Skybox: indigo → amber → blue.
   ↓  Shops open. Work orders posted at Guild.
   ↓  NPC morning barks: "Heroes hit the Cellars last night.
      What a mess."
──────────────────────────────────────────────────────
 DAY (15–75%)
   ↓  Full work time. Clean, restock, explore.
   ↓  Skybox: bright biome palette.
   ↓  All shops and services available.
──────────────────────────────────────────────────────
 DUSK (75–90%)
   ↓  Warning bell rings (town bell SFX, diegetic).
   ↓  Skybox shifts to orange/red.
   ↓  Shops begin closing. NPCs head indoors.
   ↓  HUD clock pulses: "Sundown approaching."
   ↓  Player should consider heading home.
──────────────────────────────────────────────────────
 NIGHT (90–100%)
   ↓  Shops closed. Town is dark and quiet.
   ↓  Skybox: deep indigo, stars visible.
   ↓  Dungeon enemies grow more aggressive (+1 awareness).
   ↓  The Gleaner can keep working but at increased risk.
──────────────────────────────────────────────────────
 CURFEW (~2:00 AM equivalent — 100% of day)
   ↓  If player is still in dungeon or town:
      Auto-collapse. Fade to black. Wake at home.
      "You passed out from exhaustion."
      Debuffs applied (see §5.6).
──────────────────────────────────────────────────────
```

### 5.5 Clock Mechanics

| Parameter | Default | Notes |
|-----------|---------|-------|
| Full day length | 10 minutes real time | Configurable tuning lever |
| Dawn phase | 0:00–1:30 (0–15%) | Wakeup, mail, shops open |
| Day phase | 1:30–7:30 (15–75%) | Core work time (6 real minutes) |
| Dusk phase | 7:30–9:00 (75–90%) | Warning bell, shops closing |
| Night phase | 9:00–10:00 (90–100%) | Risky but legal. Enemies buffed. |
| Curfew (forced sleep) | At 10:00 (100%) | Auto-collapse with debuffs |
| Hero Day schedule | Dawn: heroes depart. Dusk: heroes return. | Player works topside. |
| **Interior time-freeze** | **Depth-2 floors (N.N)** | **World clock pauses inside buildings** |

> **The Time-Freeze Rule:** When the player is on any depth-2 floor (building interior — ID format `N.N`), the world clock **stops**. Time does not advance. No curfew can trigger. Shops don't close. The player can browse, read, drink, and converse at their own pace. The clock resumes instantly on exit to a depth-1 (exterior) or depth-3 (dungeon) floor. See DOC-10 §2 for full specification and edge cases.
>
> This creates a clean **safety contract**: every building interior is a haven where the player is free from time pressure. Dungeons and exteriors are the pressure zones. The player learns intuitively: "inside = safe, outside = clock ticking."

### 5.6 Sleep, Death & Waking at Home

Sleep and death both end the current day. The difference is how the player *arrives* at the next morning — and what debuffs they carry. Death is tightly coupled to the hero cycle (full detail in §17).

**Voluntary sleep (bed interaction):**
- Player faces bed at home → peek shows a pillow with a clock overlay.
- `[F] Sleep` advances to next dawn. Full HP/energy restore. No debuffs.
- If it's a work day: normal morning. If it's the night before Hero Day: heroes run overnight.

**Death (any depth) — Hero Rescue:**
- The Gleaner is found by the hero's party during their pass through the dungeon. The hero cycle **shifts forward** to the death date — Hero Day becomes *tomorrow*.
- The Gleaner wakes up at home (bed / bonfire spawn location) the morning after death.
- A **mailbox report** arrives that morning with halved rewards and a narrative account of the hero finding the Gleaner unconscious (see §17).
- Narrative device: *"The Adventurer's Guild reports that The Seeker found you face-down in the Coral Cellars. They dragged you topside. How humiliating."*
- **Debuffs** (persist until the following dawn):
  - `GROGGY` — Movement speed −20% (WALK_TIME 500ms → 625ms).
  - `SORE` — Cleaning efficiency −1 tier (dirty→clean takes 2 scrubs instead of 1).
  - `HUMILIATED` — NPC dialogue references the rescue for 1 day. No mechanical effect — pure shame.
- **Currency:** 25% penalty (depth 1–2) or 50% penalty + item scatter (depth 3).
- The rest of the current day and the next work day are both **lost** — the hero ran early.

**Curfew failure (not home by 2 AM):**
- Lighter consequence than death. No hero rescue, no cycle shift.
- The Gleaner passes out and wakes at home the next morning with `GROGGY` + `SORE` debuffs but **no currency penalty**.
- **No hero involvement.** But the next morning, when the player transitions from their home floor (Floor 1.6) to the Promenade (Floor 1), a **hero NPC** is standing outside and gives a knowing wink and a bark: *"Rough night, Gleaner? I've been there."*
- Crates the player was filling mid-task **do not seal** — partial fills are lost.
- The day clock is not shifted. The hero cycle continues on its normal cadence.

**Debuff summary table:**

| Wake Condition | Currency Penalty | HP/Energy | Debuffs | Hero Cycle Effect | Day(s) Lost? |
|---------------|-----------------|-----------|---------|-------------------|-------------|
| Voluntary sleep | None | Full restore | None | None | No — chosen |
| Curfew failure | None | Full restore | GROGGY + SORE (1 day) | None — hero NPC wink | 1 day — overworked |
| Death (depth 1–2) | 25% | Full restore | GROGGY + SORE + HUMILIATED (1 day) | Hero Day shifts forward | 2 days — rescued |
| Death (depth 3) | 50% + item scatter | Full restore | GROGGY + SORE + HUMILIATED + SHAKEN (2 days) | Hero Day shifts forward | 2 days — catastrophic |

`SHAKEN` (depth-3 death only): Max HP reduced by 20% for 2 days. The deep dungeon leaves a mark.
`HUMILIATED` (death only): Town NPCs reference your rescue. No stat effect — narrative sting only.

### 5.7 Bonfire as Checkpoint — Not as Home

Bonfires remain as mid-dungeon rest points. They **restore HP and energy** and **set a floor-local respawn point** for hazard damage during the same day. But they do **not** count as "sleeping" — using a bonfire does not advance the day. The bonfire is a coffee break. The bed at home is a good night's rest.

**Bonfire interaction (peek-style):**
- Face bonfire → peek shows flickering flame in a stone ring.
- `[F] Rest` → Full HP + energy restore. Bonfire position cached as respawn point.
- If the player takes hazard damage (traps, fire, spikes) and hits 0 HP on the same floor, they respawn at the bonfire with the existing 25% currency penalty.
- Bonfire does **not** affect the day clock, debuffs, or hero cycle.

---

## 6. Juice Inventory — Making Every Action Feel Satisfying

"Juice" is the layer of visual, audio, and haptic feedback that makes a good mechanic feel *great*. Each pillar gets a juice pass below.

### 6.1 Clean Pillar Juice

| Action | Juice Opportunity |
|--------|------------------|
| Scrub a dirty tile | Grime texture fades per-sweep with a wet squeegee SFX. Each swipe reveals the clean tile beneath as a wipe animation (left-to-right, 0.15s). |
| Complete a tile row | Short ascending chime (like Tetris line clear). Briefly shows clean tile sparkle FX (3-frame particle burst). |
| Floor clean ≥ 50% | Ambient audio shifts from "echo + drip" to "clean hum". Fog density decreases slightly — the dungeon *feels* less oppressive. |
| Floor fully clean | A short jingle plays (3 notes). HUD clean sub-score fills green. The wall textures swap to the "pristine" variant. |
| Wrong tool for grime type | Tool SFX plays "thud" instead of "squeak". Tool durability drops 2× instead of 1×. Visual: spray splatter on the tile, no progress. |

### 6.2 Restock Pillar Juice

| Action | Juice Opportunity |
|--------|------------------|
| Open empty crate | Crate lid opens with a creak SFX. Interior shows empty slot frames — a visual "hunger". |
| Place item in slot | Satisfying *thunk* + item drops into frame with a short scale-up/down bounce (0.1s). Slot frame pulses gold briefly. |
| Fill 3rd of 4 slots | 4th slot "beckons" — a slow gold pulse cycles on the empty slot. An ambient tension tone fades in (barely audible). |
| Seal a full crate | Lid closes with a satisfying *clunk*. Coin icons animate out of the crate (+2 +3 text with float-up fade). Crate tile swaps to CRATE_SEALED variant (brighter, with a small padlock icon texture). |
| Seal with matching suit card | Gold burst particle effect (larger than standard). Extra coin icons. A special 2-note stab SFX (the "jackpot" sound). |
| Readiness bar crosses 25%/50%/75% | HUD sub-bar briefly expands (scale 1.1×, 0.2s), snaps back. A notch tone plays (C, E, G for the three milestones). |
| Readiness hits 100% | Full fanfare (4-note phrase). HUD glow effect on all sub-scores. Deploy button activates with gold pulse. |

### 6.3 Hero Cycle Juice (Replaces Deploy Button Juice)

| Action | Juice Opportunity |
|--------|------------------|
| Hero Day dawn announcement | Town bell rings three times (distinct from dusk bell's single toll). Skybox snaps to a sharper, more dramatic dawn palette. HUD shows `⚔️ HERO DAY` badge for 3 seconds. |
| NPC bark about hero results | Speech bubble pops above NPC with a 0.2s bounce. Text scrolls letter-by-letter. Bark SFX: short vocal chirp (genre-neutral). |
| Mailbox flag raised | Flag icon bounces twice (spring animation) on the HUD. A paper-rustle SFX plays. |
| Reading mail report | Parchment texture unfolds (peek-style). Coin totals tally up with arcade score-counter sound. Red text for failed floors, green for passed. |
| Re-entering trashed dungeon | First-person view of the aftermath: crate debris scattered, grime on walls, toppled props. A low, ominous chord plays. The dungeon *looks* different than when the player left it. |
| Payout arrives (via mail) | Coins animate from the mailbox icon to the player's total with stagger timing. Each coin has a *clink* SFX with slight random pitch variance. |
| Rare card (mail reward) | The card slides out of the mail parchment, flips face-up, and lands with a card-slap SFX. A light burst plays behind it. |
| Taskmaster clipboard interaction | Peek shows clipboard with floor list. Checking a floor: checkmark stamps down with a satisfying *thwack*. Readiness % numbers glow green (≥60%) or pulse red (<60%). |
| Death → hero rescue mail | The mailbox report arrives with a red-bordered parchment variant. The preamble reads in italics: *"The Seeker found your operative unconscious…"*. Halved coin totals tally up with a slower, minor-key counter sound. A 😳 `HUMILIATED` icon slides onto the HUD. |
| Hero NPC wink (curfew) | On the morning after curfew failure, a hero NPC stands outside the player's front door (Floor 1 side of the 1↔1.6 transition). On approach: speech bubble with a wink emoji and bark: *"Rough night?"*. Bubble has a jaunty bounce (0.15s). A short chuckle SFX plays. |

### 6.4 Day/Night Cycle Juice

| Moment | Juice Opportunity |
|--------|------------------|
| Dawn (wake at home) | Camera fades in slowly (1.2s). Warm amber light through the room window. A rooster crow or morning bell SFX. HUD clock fades in at `DAY 4 — 6:00 AM`. |
| Skybox day transition | Zenith/horizon colours smoothstep over 30 real seconds. Clouds drift. Sun position (bright spot on horizon gradient) tracks the clock. |
| Dusk warning bell | Single toll of the town bell (diegetic). Skybox shifts toward orange/red. HUD clock border pulses amber. Shopkeeper NPCs start walking indoors. |
| Night falls | Star field fades in (existing Skybox star layer). Town ambient SFX shifts from "market bustle" to "crickets + distant waves". Torch-lit windows glow on building facades. |
| Curfew collapse | Screen desaturates rapidly (0.3s). A stumble SFX plays. Fade to black faster than normal (0.4s). Dawn fade-in shows the player in bed with `GROGGY` icon on HUD. |
| Death fade (hero rescue) | Screen goes deep red (0.4s) then black (0.6s). A low brass drone plays — ominous, not triumphant. Fade-in is slower (2.0s) and washed-out, with the player in bed. HUD shows `HUMILIATED` badge before debuff icons load. A toast: *"The heroes found you."* |
| Post-death hero day shift | The HUD day counter jumps forward visibly: the number ticks up (like an odometer) with a *click-click* sound. `⚔️ HERO DAY` badge appears immediately. The player registers: their death cost them work time. |
| Debuff applied | Debuff icon (☁ for GROGGY, 🩹 for SORE, 💀 for SHAKEN, 😳 for HUMILIATED) slides onto the HUD status bar with a dull *thud* tone. Icon pulses once, then persists. |
| Debuff expires | Icon shatters with a small particle burst and a *chime* SFX. Toast: *"You feel rested."* |
| Door peek sky glimpse | When peeking at an exit door from inside a dungeon, the door crack shows the current exterior sky gradient (dawn/day/dusk/night). A subtle wind SFX plays through the crack. |
| Hero Day morning | Dawn palette is more dramatic (deeper orange, silhouetted mountains). A war horn SFX plays faintly in the distance. HUD badge: `⚔️ HERO DAY`. |

### 6.5 Ambient and Meta Juice

| Area | Juice Opportunity |
|------|------------------|
| **Footsteps** | Different SFX for each tile condition (wet/dirty tile = splat, clean tile = crisp click, damaged tile = crunch). |
| **Tool wear** | Tool sprite gets a dirt overlay texture as durability drops. At 25% durability, the tool icon shakes on the HUD. At 0%, a *snap* SFX and a "broken tool" toast notification. |
| **Readiness hologram** | In Gleaner mode, looking at a floor entrance shows a ghosted percentage readiness overlay in the door frame — like a sci-fi diagnostic panel reading `72% READY`. |
| **NPC reactions** | Town NPCs comment on floor readiness at specific thresholds. At 100%: *"I heard the Foundry's clean for the first time in decades."* At 0%: *"That dungeon's an absolute shambles."* |
| **Combo Seal** | Sealing three or more crates within 10 seconds triggers a combo counter (`x2 COMBO`, `x3 COMBO`) with escalating SFX and coin multiplier. |
| **Dungeon smell meter** | A flavour HUD element (a nose icon) that fills as grime accumulates and drains as cleaning progresses. Has no mechanical effect — pure feel. |

### 6.6 Pre-Phase Juice (Morning Send-Off)

Juice moments specific to the Day 1 morning sequence (TUTORIAL_WORLD_ROADMAP §18.7):

| Moment | Juice |
|--------|-------|
| **Auto-walk across Floor 0** | Camera sway from MovementController lerp, ambient step SFX. Pre-dawn cedar sky (biome: `cedar`). |
| **Floor 0 → 1 transition** | `enter_building` TransitionFX preset; door creak SFX; sunset sky fades in on Floor 1. |
| **Ambient bark fires** | Toast slides in from bottom-left. 2.5s display, no dismiss needed. Font matches clipboard style. |
| **Dispatcher first appearance** | NPC sprite renders at (5,2): 🐉 head, dark jacket, clipboard. No fanfare — environmental discovery. |
| **Dispatcher bump** | Existing `ui-blop` bump SFX + bark fires from `npc.dispatcher.gate.intro`. |
| **Home door discovery** | Door at (17,7) is partially obscured by east pillar — a micro-discovery. No pointer or highlight. |
| **Entering home (Floor 1.6)** | Transition to warm amber plank room after the blue-cool Promenade. Contrast signals safety. |
| **Key pickup** | `pickup-success` SFX + Toast: `🗝️ Work keys. The Dispatcher will want to see these.` |
| **Gate clears** | Dispatcher sprite vanishes (immediate, no animation — Phase 0 polish adds a dismissal walk). Dungeon DOOR is now a normal interactive tile. |
| **Bark variety** | BarkLibrary weights ensure the same player never hears the same morning bark twice in a row. Anti-repeat cooldown (25s) prevents over-firing during the ~3 minute sequence. |

### 6.7 Cozy Interior Juice

Interior interactions (depth-2 floors only) use a distinct juice palette — warmer, gentler, and deliberately slower than dungeon or exterior feedback. The goal is sensory contrast: after the tension of dungeon work, every interior interaction should feel like putting down a heavy bag.

| Moment | Juice |
|--------|-------|
| **Enter building** | Door-creak SFX transitions to warm ambient hum. HUD clock shows ❄️ pause icon. Brief oneShot toast: "Time holds still here." |
| **Exit building** | Clock digits pulse amber (1s) to signal time resumption. Exterior ambient sounds fade back in. |
| **Face bookshelf** | Subtle warm glow on wall column. `page-turn` SFX (soft, papery). |
| **Read book** | DialogBox opens with book icon + title. Pages are instant (no typewriter — books are not speech). Page counter at bottom. |
| **Turn page** | `page-turn` SFX. Text swaps instantly. |
| **Close book** | DialogBox fades out. Brief bark fires from `interior.bookshelf.<biome>` pool. |
| **Conspiracy lore read** | oneShot bark after reading a lore book: "Something about that passage felt... important." |
| **Face bar counter** | Toast billboard: drink name + effect + taps remaining. Ambient glass-clink SFX. |
| **Drink** | `pickup-success` SFX + Toast with drink emoji. Subtle amber screen-edge vignette (0.3s). |
| **Last drink** | "That's the last one." bark. Billboard shows "Empty!" on next face. |
| **Return after exit** | Taps reset. Billboard shows full count. Bartender bark: "Refills on the house." |
| **Long stay (60s)** | Gentle ambient bark: "No rush. The dungeons will wait." Reassurance signal. |

Detailed juice specifications and per-building interaction inventories are in DOC-10 (COZY_INTERIORS_DESIGN.md).

---

## 7. The Pressure Gradient — Difficulty as Readiness Targets

The game's difficulty curve is the readiness target increasing over hero cycles. This is a Kingdom Two Crowns-style escalation: each cycle, the Guild demands higher standards. Heroes get more destructive. New dungeon floors unlock with tougher maintenance requirements.

```
Cycle 1 (Days 1–3):   60% target   — Easy mode. Even partial restocking pays.
Cycle 2 (Days 4–6):   65% target   — Slightly harder. Must clean AND restock.
Cycle 3 (Days 7–9):   70% target   — Medium. All four sub-scores matter.
Cycle 4 (Days 10–12): 75% target   — Hard. New hero types arrive (Scholar, Crusader).
Cycle 5+ (Day 13+):   80–90% target — Expert. Perfect runs required for jackpot.
```

The target escalation is displayed transparently on the Taskmaster's clipboard and the Guild work order board. The player always knows what's expected — and can see their current readiness vs. the threshold at a glance.

---

## 8. The 3-Day Cycle as the Session Rhythm

The hero cycle creates a **natural session boundary** that is both larger and more satisfying than a single day. The player always knows:

1. *What they need to do* (readiness targets on the work order board).  
2. *When the heroes arrive* (the cycle counter: `Day 2 of 3 — Heroes tomorrow`).  
3. *What they'll get when it's over* (payout depends on readiness at hero arrival).

The session rhythm is a 3-day heartbeat:

```
Day 1: Wake at home → Read mail (last cycle's results) →
       Check work orders → Descend → Clean + Restock →
       Return home before curfew → Sleep

Day 2: Wake at home → Continue maintenance → Visit shops
       (sell salvage, buy restock supplies) →
       Talk to Taskmaster (mark floors as ready) →
       Descend for final push → Return home → Sleep

Day 3: HERO DAY → Wake at home → Heroes depart at dawn →
       Work topside (town errands, shop, Guild quests) →
       Heroes return at dusk → NPC barks about results →
       Payout arrives → Sleep → New cycle begins
```

This is the *"one more cycle"* pull. Day 1 is fresh and full of potential. Day 2 is the crunch — *"just one more crate before heroes arrive."* Day 3 is the payoff — the player reaps what they sowed and plans the next round. The dungeon is the farm. The hero cycle is the harvest. The Gleaner's Guild is the shipping crate at the end of the pier.

---

## 9. Implementation Notes

These design elements map to existing and planned modules:

| Design Element | Module | Status |
|----------------|--------|--------|
| Readiness score | `crate-system.js` + `floor-state-tracker.js` (planned) | Partial (crate sub-score in B4) |
| 3-day hero cycle | `day-cycle.js` (planned) — cycle counter, hero dispatch, day state machine | Not started |
| Taskmaster NPC | `interact-prompt.js` extension + new peek (`taskmaster-peek.js`) | Not started |
| Day/Night clock | `day-cycle.js` — normalised time 0.0–1.0, phase enum (DAWN/DAY/DUSK/NIGHT) | Not started |
| Skybox day/night | `skybox.js` — add `dawn`/`dusk`/`night` colour stops to each preset, lerp in `render()` | Ready to extend |
| Player home (bed) | `bed-peek.js` (planned) — sleep verb, debuff preview, cycle counter display | Not started |
| Mailbox | `mailbox-peek.js` (planned) — hero run reports, parchment UI | Not started |
| Job board | `job-board-peek.js` (planned) — work orders, readiness targets, hero schedule | Not started |
| Death → home respawn | `hazard-system.js` — modify depth 1–2 death to return home + apply debuffs | Refactor existing |
| Curfew collapse | `day-cycle.js` — 100% time trigger → forced sleep with debuffs | Not started |
| Debuff system | `player.js` extension — debuff state array, duration tracking, stat modifiers | Not started |
| Bonfire (mid-dungeon) | `hazard-system.js` — unchanged: floor-local respawn + restore. Not sleep. | Existing ✅ |
| Tile cleaning | `cleaning-system.js` (Phase C) | Not started |
| Dusk warning SFX | `AudioSystem` + `DoorContractAudio` pattern | Ready to wire |
| Crate seal juice | `crate-ui.js` canvas rendering | In progress (B2) |
| Coin drop animation | HUD toast + `TransitionFX` | Partial |

### 9.1 Priority Order for Jam Scope

The time cycle is a large system. For the jam deadline (April 5), the minimum viable slice is:

1. **Day/Night skybox** — visual time cue. Extend `Skybox` presets with 3 colour stops. Wire `time` parameter from a simple frame counter. (~2h)
2. **Bed peek** — sleep verb that advances to the next day. Minimal: just fade to black and increment a day counter. (~1h)
3. **3-day counter on HUD** — `"Day 2 of 3"` text. Hero Day triggers dungeon-trashing pass. (~1h)
4. **Mailbox peek** — show a single parchment with the last hero run report (text-only). (~1h)
5. **Taskmaster peek** — clipboard with floor readiness list and check/uncheck toggles. (~2h)

Total minimal implementation: **~7h**. Debuffs, curfew collapse, and night-phase enemy buffs are post-jam polish.

---

## 10. Design Axioms

These principles guide every design decision on the core loop:

1. **Every action pays**. If the player does something, they get feedback and a reward signal within 1 second.  
2. **The hero is weather, not the enemy**. Heroes arrive like seasons. The player prepares for them like a farmer prepares for harvest. You don't fight the weather; you work with it.  
3. **The clock creates choices**. The day/night clock is not punishment. It is the device that makes *decisions* feel meaningful. Without the clock, there is no reason to ever stop restocking.  
4. **Visible progress bars are the game**. The player should be able to walk into a floor and instantly understand: how clean is it, how full are the crates, and what readiness am I at? If they can't read this at a glance, the HUD has failed.  
5. **The jackpot card is always one cycle away**. The rare card reward from a Perfect Run must always feel achievable but not guaranteed. The player knows exactly what score they need.  
6. **Home is the heartbeat**. Every day starts and ends at home. The bed is the save point, the mailbox is the reward delivery, and the mirror is the stat check. If the player doesn't want to go home, the home loop has failed.  
7. **Discovery over declaration**. The player discovers hero results through mail, NPC barks, and dungeon exploration — not through UI popups or score screens. The world tells the story.

---

## 11. Peek Interaction Expansion

The existing peek system (DoorPeek, CratePeek, ChestPeek, CorpsePeek, LockedDoorPeek, MerchantPeek, PuzzlePeek) uses a consistent 3D box animation pattern: the player faces an interactable tile, a box appears at screen centre, animates open, and shows context-specific content. The following new peek types extend this system for the time cycle.

### 11.1 Bed Peek (`bed-peek.js`)

**Trigger:** Face the bed tile at the player's home (inn room / Guild bunk).

**Box animation:** A pillow and blanket on a simple cot. The blanket flips back (like a crate lid sliding off) to reveal a clock face showing the current day/time and a sleep option.

**Content:**
```
┌─────────────────────────────┐
│  🛏️  REST FOR THE NIGHT     │
│                             │
│  Day 2 of 3                 │
│  Current time: DUSK (78%)   │
│  Heroes arrive: Tomorrow    │
│                             │
│  [F] Sleep → Advance to Dawn│
│                             │
│  Status: No debuffs         │
└─────────────────────────────┘
```

**On interact:** Fade to black (0.8s). Day counter increments. If Hero Day: hero run executes overnight. Fade in at dawn. Mail delivered.

**Debuff preview:** If the player has active debuffs, the peek shows them with remaining duration:
```
  ☁ GROGGY — 1 day remaining
  🩹 SORE  — 1 day remaining
```

### 11.2 Mailbox Peek (`mailbox-peek.js`)

**Trigger:** Face the mailbox tile at the player's home.

**Box animation:** Wooden mailbox with a red flag. Flag is up if there's unread mail. On open: a parchment scroll slides up out of the mailbox.

**Content (Hero Day results):**
```
┌─────────────────────────────────┐
│  📜  ADVENTURER'S GUILD REPORT  │
│  ───────────────────────────    │
│  Coral Cellars (Floor 1.1.1)   │
│  Readiness: 72% ✓              │
│  Hero: The Seeker (Fighter)    │
│  Result: Cleared. 3 crates     │
│  smashed, 2 monsters slain.    │
│  Payout: 34 coins              │
│  ───────────────────────────    │
│  Coral Bazaar (Floor 1.1)      │
│  Readiness: 45% ✗ (below 60%)  │
│  Hero: SKIPPED                 │
│  Payout: 0 coins               │
│  ───────────────────────────    │
│  TOTAL: 34 coins deposited     │
│  💳 Card drop: Common ♠ Strike │
│                                 │
│  [F] Dismiss                    │
└─────────────────────────────────┘
```

**Content (work day — no new mail):**
```
┌─────────────────────────────┐
│  📭  No new mail.            │
│  Next hero cycle: 2 days     │
└─────────────────────────────┘
```

**NPC bark integration:** If the player doesn't check mail by midday, an NPC in town says: *"You've got mail at the inn, Gleaner. Might want to check it."*

### 11.3 Job Board Peek (`job-board-peek.js`)

**Trigger:** Face the work order board at the Gleaner's Guild (Floor 1.3).

**Box animation:** A cork board with pinned parchment sheets. Board swings forward (like a door opening toward the player).

**Content:**
```
┌─────────────────────────────────────┐
│  📋  WORK ORDERS — Cycle 3          │
│  ─────────────────────────────────  │
│  Floor           Readiness  Target  │
│  Coral Cellars   ████░░ 67%   70%  │
│  Coral Bazaar    ██░░░░ 38%   60%  │
│  Boardwalk Ext.  ███░░░ 52%   60%  │
│  ─────────────────────────────────  │
│  Next hero type: Scholar            │
│  Heroes arrive:  Tomorrow (Day 3)   │
│  ─────────────────────────────────  │
│  Bonus: All floors ≥ 80% → +50%    │
│                                     │
│  [F] Dismiss                        │
└─────────────────────────────────────┘
```

**Progress bars** use the existing resource colour system: green (≥ target), amber (within 10%), red (below 50%).

### 11.4 Taskmaster Peek (`taskmaster-peek.js`)

**Trigger:** Face the Taskmaster NPC at the Gleaner's Guild.

**Box animation:** Clipboard and quill held out toward the player. Clipboard tilts forward.

**Content:**
```
┌─────────────────────────────────────┐
│  📋  HERO DISPATCH REGISTRY         │
│  ─────────────────────────────────  │
│  Mark floors for the next hero run: │
│                                     │
│  ☑ Coral Cellars    67% READY       │
│  ☐ Coral Bazaar     38% ⚠ RISKY    │
│  ☑ Boardwalk Ext.   52% ⚠ RISKY    │
│  ─────────────────────────────────  │
│  Floors ≥ 60% are auto-included.   │
│  Risky floors may cause hero death. │
│                                     │
│  [↑/↓] Navigate  [F] Toggle  [ESC] │
└─────────────────────────────────────┘
```

**Toggle mechanic:** Uses existing `InputManager` up/down + interact key. Checking a risky floor (<60%) shows a confirmation toast: *"The Seeker won't survive 38% readiness. Proceed anyway?"*

### 11.5 Bonfire Peek (Expanded)

**Existing:** Bonfire interaction is a simple `HUD.showCombatLog('🔥 Rested at bonfire')` with instant HP/energy restore.

**Expanded peek:**
- Face bonfire → peek shows a stone fire ring with flickering orange glow animation.
- Sub-label: `"[F] Rest — Restore HP & Energy"`.
- If the player has items that can be cooked/combined at a bonfire (future feature), the peek shows a cooking slot.
- Key difference from bed: **bonfire never advances the day clock**. It's a pit stop, not a destination.

```
┌─────────────────────────────┐
│  🔥  BONFIRE                 │
│                             │
│  HP:     ████████░░  82%    │
│  Energy: ██████░░░░  63%    │
│                             │
│  [F] Rest → Full restore    │
│  Time: DAY (45%) — no rush  │
└─────────────────────────────┘
```

### 11.6 Bookshelf Peek (New — Interior Furnishing)

**Tile:** `TILES.BOOKSHELF` (25) — non-walkable, opaque wall furnishing.

**Module:** `engine/bookshelf-peek.js` — autonomous peek overlay.

**Behaviour:** Face bookshelf for 400ms → DialogBox opens with the book's first page. Navigate pages with A/D keys. Escape closes. Walking away auto-closes after 200ms.

**Book data:** `data/books.json` — 13 books across 5 categories (tip, lore, manual, notice, letter). Each book has a `biome` field; BookshelfPeek selects the biome-appropriate book for each shelf position using a stable position-based index. Explicit assignment via `floorData.books[]` overrides random selection.

```
┌─────────────────────────────────┐
│  📘 Gleaner's Field Manual      │
│     — Movement                  │
│                                 │
│  WASD or arrow keys to move.    │
│  Q/E to strafe left and right.  │
│  Hold SHIFT to move faster.     │
│                                 │
│  — Page 1 of 2 —               │
│  [A] ← Prev  [D] Next →        │
│  [Esc] Close                    │
└─────────────────────────────────┘
```

**Content purpose:** Tips (guild bookshelves teach mechanics), Lore (inn bookshelves drip Dragon Conspiracy), Notices (guild work-order forms), Letters (home has the first conspiracy hook).

**Juice:** `page-turn` SFX on open/turn. Bark from `interior.bookshelf.<biome>` pool on close. oneShot conspiracy bark on lore discovery. See §6.7.

### 11.7 Bar Counter Peek (New — Interior Furnishing)

**Tile:** `TILES.BAR_COUNTER` (26) — non-walkable, opaque half-wall furnishing.

**Module:** `engine/bar-counter-peek.js` — autonomous billboard + interact handler.

**Behaviour:** Face counter for 300ms → Toast billboard shows drink name, effect, and taps remaining. Press OK to consume a drink (tiny stat boost). 3 taps per counter per visit; resets on floor re-enter.

**Per-biome menus:**
- **Inn:** ☕ Boardwalk Brew (+1 energy), 🍺 Deep Ale (+5% speed), 🧃 Coral Tonic (clear 1 debuff)
- **Bazaar:** 🍵 Spice Tea (+1 energy), 🧃 Coral Juice (+3 HP), 🫖 Warm Brew (+3% speed)
- **Guild:** ☕ Black Coffee (+2 energy), 🥤 Stim Drink (+8% speed), 💊 Guild Remedy (clear 1 debuff)
- **Home:** 🥛 Glass of Water (+1 energy), 🍲 Leftover Stew (+2 HP)

```
┌───────────────────────────────────┐
│  🍺 Deep Ale — +5% speed         │
│     (1 floor)                     │
│     2/3 remaining  [OK] Drink     │
└───────────────────────────────────┘
```

**Design intent:** The bar counter is the interior equivalent of a bonfire — a micro-rest that says "you're safe here." The effects are intentionally tiny; the value is emotional, not mechanical. See DOC-10 §5 for full specification.

---

## 12. Time Cycle Accommodation Inventory

This section catalogs **every game system that interacts with the day/night cycle** and evaluates whether it fits naturally, requires adaptation, or should be deferred.

### 12.1 Fits Naturally (No Adaptation Needed)

| System | How It Fits | Notes |
|--------|------------|-------|
| **Skybox** | Already has `time` parameter for title animation. Pass game clock instead. | 3 new colour stops per preset. |
| **Shop hours** | Shops open at dawn, close at dusk. Existing `MerchantPeek` shows "CLOSED" label. | No code change — just a time gate. |
| **NPC barks** | `DialogBox` already supports triggered dialogue. Add time-gated bark pool. | Pool: dawn barks, dusk barks, Hero Day barks. |
| **HUD clock** | HUD already renders dynamic elements. Add a sun-position icon + day counter. | Tiny canvas widget. |
| **Readiness score** | Already computed. Just snapshot it at hero arrival time. | No change to `crate-system.js`. |
| **Bonfire restore** | Unchanged. Mid-dungeon rest. Doesn't interact with day clock. | Existing ✅. |

### 12.2 Requires Adaptation (Small Scope)

| System | Adaptation | Est. Hours |
|--------|-----------|-----------|
| **Death (depth 1–2)** | Change respawn from bonfire-on-same-floor to home. Add debuff state to `Player`. | 2h |
| **Death (depth 3)** | Add `SHAKEN` debuff (20% max HP reduction, 2 days). Game over screen mentions stash survives. | 1h |
| **Floor transition** | On ascending to exterior (depth 1) after dusk, show night skybox instead of day. | 30min |
| **Interact prompt** | Add BED, MAILBOX, JOB_BOARD, TASKMASTER to `ACTION_MAP` in `interact-prompt.js`. | 1h |
| **Tile constants** | Add `TILES.BED`, `TILES.MAILBOX`, `TILES.JOB_BOARD`, `TILES.TASKMASTER_NPC` to `tiles.js`. | 30min |
| **Floor generation** | Player's home floor (1.2 or 1.3) needs bed, mailbox, stash tiles placed at fixed positions. | 1h |
| **Dungeon trashing** | On Hero Day, run a dungeon-trashing pass: for each baited floor, randomise damage to crates/tiles/traps based on hero type. | 2h |
| **Hero type schedule** | Simple rotation: Seeker → Scholar → Shadow → Crusader → repeat. Advance per cycle. | 30min |

### 12.3 Deferred (Post-Jam)

| System | Why Deferred | Jam Workaround |
|--------|-------------|----------------|
| **Night-phase enemy buff** | Requires awareness system tuning. | Enemies are the same difficulty day/night. |
| **Curfew collapse** | Needs a smooth "passed out" animation and forced-transition. | Player can always return home manually. |
| **Cooking at bonfire** | Item combination system doesn't exist yet. | Bonfire is rest-only. |
| **NPC schedules** | NPCs moving between locations based on time. | NPCs are static — always at their station. |
| **Weather system** | Rain, fog overlays tied to day/time. | Clear weather always. |
| **Seasonal hero escalation** | Hero types get stronger over weeks (gear upgrades). | Hero difficulty is static. |
| **Dream sequences** | Narrative cutscenes during sleep (conspiracy hints). | Sleep is a simple fade transition. |
| **Alarm clock item** | Extends curfew by 30 minutes. Shop purchase. | No curfew mechanic in jam build. |

### 12.4 Time-Aware Peek Interactions Summary

Every peek interaction that should display or react to the current time:

| Peek Type | Time-Aware Element |
|-----------|--------------------|
| **DoorPeek** (exit to exterior) | Show current sky state through door crack. |
| **BedPeek** | Show current time, day counter, hero cycle countdown, debuff preview. |
| **MailboxPeek** | Show unread mail flag. Mail only arrives at dawn after Hero Day. |
| **JobBoardPeek** | Show readiness vs. target. Target escalates per cycle. |
| **TaskmasterPeek** | Show hero schedule. Only interactive on work days (not Hero Day). |
| **BonfirePeek** | Show current time as context ("DAY 45% — no rush" vs "NIGHT 92% — get home!"). |
| **MerchantPeek** | Show "OPEN" / "CLOSED" based on time of day. |
| **CratePeek** | No time element. Crates don't care what time it is. |
| **CorpsePeek** | No time element. |
| **ChestPeek** | No time element. |
| **PuzzlePeek** | No time element. |

---

## 13. Dungeon Persistence & Multi-Floor Maintenance

### 13.1 Work Persists Across Days

When the player restocks Floor 1.1.1 on Day 1 and returns on Day 2, **every sealed crate, cleaned tile, re-armed trap, and scrambled puzzle is exactly where they left it**. The dungeon remembers. This is the foundation of the maintenance loop: progress is cumulative across the 2 work days before Hero Day.

The only things that change between days are:
- **Daily vermin refresh** (§16) — a fresh set of rats and bats spawns in cleared rooms.
- **Ambient decay** (cosmetic) — cleaned tiles gain a faint dust overlay after 1 day. No mechanical effect, just visual: *"I cleaned this yesterday, it could use a touch-up."*

### 13.2 Dungeon Difficulty Tiers & Expected Pace

Not all dungeons restock at the same rate. The player manages a portfolio of dungeons, and the expectation is that **low-level dungeons are quick to reset while deep dungeons take the full 2-day window** — or longer.

| Dungeon Tier | Example Floor | Reset Tasks | Expected Pace | Notes |
|-------------|--------------|-------------|---------------|-------|
| **Shallow** (1.1.1) | Coral Cellars | ~8 crates, ~20 dirty tiles, 2 traps, 1 puzzle | Fully restockable in 1 day | Bread-and-butter income. Can be perfected for bonus. |
| **Mid** (1.1.2) | Coral Depths | ~14 crates, ~40 tiles, 4 traps, 2 puzzles, 3 corpses | Restockable in 1.5 days | Requires both work days and good time management. |
| **Deep** (1.1.3+) | Coral Abyss | ~20 crates, ~60 tiles, 6 traps, 3 puzzles, 6 corpses, 2 formidable enemies | Barely touchable in 2 days | Partial restocking is the norm. Strategic triage required. |
| **Surface interior** (1.1) | Coral Bazaar | ~5 crates, ~15 tiles, 0 traps, 1 puzzle | Half a day | Town-adjacent. Low payout, but reliable. |

**Design implication:** The player must **triage**. They cannot fully restock everything in 2 days. They choose: *Do I perfect the Cellars for a guaranteed payout, or push into the Abyss for a risky but lucrative run?* This is the Stardew Valley crop-selection problem: time is the scarce resource, and every floor is a field that demands attention.

### 13.3 Hero Exploration Across Multiple Dungeons

On Hero Day, the dispatched hero doesn't just enter one floor. They follow a **dungeon chain** — descending from the entrance through every baited floor in sequence:

```
Hero enters Floor 1.1 (Coral Bazaar — baited, 72% ready)
    ↓ clears it — smashes 2 crates, solves puzzle
Hero descends to Floor 1.1.1 (Coral Cellars — baited, 85% ready)
    ↓ clears it — good run, most crates survive
Hero descends to Floor 1.1.2 (Coral Depths — baited, 41% ready)
    ↓ struggles — 2 traps misfire, hero takes damage
    ↓ hero retreats (readiness too low to continue)
Floor 1.1.3 (Coral Abyss — not reached)
```

The hero's **penetration depth** depends on cumulative readiness. Well-stocked upper floors give the hero momentum. A poorly stocked mid-floor stops the chain. This means the player's restocking order matters: bottom-up restocking is risky (hero might not reach it), top-down is safe but leaves the lucrative deep floors untouched.

---

## 14. Hero Run Report — Mailbox Detail Design

### 14.1 Report Structure

The mailbox report is the primary feedback loop for the hero cycle. It must communicate **what happened to each dungeon** without walls of text. The solution: **dungeon thumbnail cards** — one per floor, arranged vertically in the mail parchment.

```
┌─────────────────────────────────────────────────┐
│  📜  ADVENTURER'S GUILD — CYCLE 3 REPORT        │
│  ─────────────────────────────────────────────  │
│                                                  │
│  ┌──────────┐  Coral Bazaar (1.1)               │
│  │ ░░▓▓██░░ │  Readiness: 72% ✓                 │
│  │ ░░▓▓██░░ │  Hero: The Seeker (Fighter)       │
│  │ ░░▓▓░░░░ │  ⚔ 1 monster slain                │
│  └──────────┘  📦 2 crates smashed               │
│                🧩 1 puzzle solved                 │
│                🪙 Payout: 18 coins                │
│                                                  │
│  ┌──────────┐  Coral Cellars (1.1.1)            │
│  │ ██████▓▓ │  Readiness: 85% ✓ CLEAN RUN       │
│  │ ████████ │  Hero: The Seeker (Fighter)       │
│  │ ██████▓▓ │  ⚔ 3 monsters slain                │
│  └──────────┘  📦 4 crates smashed               │
│                🧩 0 puzzles (none present)        │
│                🪤 2 traps triggered               │
│                🪙 Payout: 42 coins (+50% bonus)   │
│                                                  │
│  ┌──────────┐  Coral Depths (1.1.2)             │
│  │ ▓▓░░░░░░ │  Readiness: 41% ✗ HERO RETREATED  │
│  │ ░░░░░░░░ │  Hero: The Seeker (Fighter)       │
│  │ ▓▓░░░░░░ │  ⚔ 0 monsters (fled before combat)│
│  └──────────┘  📦 1 crate smashed                │
│                🪤 2 traps misfired (hero damaged) │
│                🪙 Payout: 0 coins                 │
│                ⚠ Hero retreated — low readiness   │
│                                                  │
│  ─────────────────────────────────────────────  │
│  TOTAL: 60 coins deposited                      │
│  💳 Card drop: Uncommon ♦ Riposte               │
│  ─────────────────────────────────────────────  │
│  Chain bonus: ✗ (Depths failed — chain broken)  │
│                                                  │
│  [↑/↓] Scroll   [F] Dismiss                     │
└─────────────────────────────────────────────────┘
```

### 14.2 Dungeon Thumbnail

Each floor in the report gets a **small grid thumbnail** (8×8 or 10×10 pixel block). This is a minimap-scale representation of the floor layout, colour-coded by post-hero condition:

| Thumbnail Colour | Meaning |
|------------------|---------|
| `██` Dark green | Tile intact (crate sealed, trap armed, tile clean) |
| `▓▓` Amber | Tile damaged (crate smashed, trap triggered, tile dirty) |
| `░░` Red/dark | Tile destroyed or empty (corpse left, puzzle solved, blood stain) |
| `▒▒` Blue | Tile untouched by hero (hero didn't reach this area) |

The thumbnail gives an **instant visual read** of how much damage the hero did. A mostly-green thumbnail = clean run, barely any restocking needed. A mostly-red thumbnail = the hero wrecked the place.

**Implementation:** The thumbnail is generated from the floor's tile grid at the moment the hero run completes. Each tile maps to a single pixel. The raycaster's existing `Minimap` module already renders per-tile colour — the thumbnail reuses that pipeline at a smaller scale.

### 14.3 Report Content Scales with Readiness

The quality of the report — and the *tone* — depends on the floor's readiness at hero arrival:

| Readiness | Report Tone | Example Detail |
|-----------|------------|----------------|
| **≥ 90%** | Celebratory | *"The Seeker breezed through a perfectly stocked dungeon. Every trap fired. Every monster fought. Textbook run."* |
| **70–89%** | Professional | *"Standard clearance. 4 crates looted, 2 traps triggered. Minor damage."* |
| **50–69%** | Concerned | *"The Scholar struggled in the under-stocked Depths. Several empty crate frames disappointed. Puzzles were already solved — no challenge."* |
| **< 50%** | Critical | *"The Seeker retreated from the Abyss after two traps misfired and a bare corridor offered nothing to loot. The Guild questions your commitment."* |

### 14.4 Activity Breakdown Icons

Each line item in the report uses a consistent icon vocabulary:

| Icon | Activity | Restocking Implication |
|------|----------|----------------------|
| ⚔ | Monsters slain | Corpses to clear, enemies to restock/reanimate |
| 📦 | Crates smashed | Crates to refill (slots emptied) |
| 🧩 | Puzzles solved | Puzzles to re-scramble |
| 🪤 | Traps triggered | Traps to re-arm |
| 🚪 | Doors unlocked | Doors to re-lock |
| 🔘 | Buttons pushed | Buttons to reset |
| 🩸 | Blood tiles left | Tiles to pressure-wash |
| 💀 | Hero died | No payout. Dungeon half-trashed. Hero's corpse is lootable (morbid bonus). |

---

## 15. Dungeon Reset Elements — What the Hero Leaves Behind

When a hero runs through a baited floor, they leave a specific set of **reset tasks** for the Gleaner. Each element was seeded during floor generation and now needs to be restored. The readiness score (§3.2) tracks all of these.

### 15.1 Element Catalog

| Element | Seeded State (pre-hero) | Post-Hero State | Gleaner Reset Verb | Readiness Category |
|---------|------------------------|-----------------|-------------------|--------------------|
| **Crate** | Sealed, full (4/4 slots) | Smashed open, 0–1 items remain | Refill slots → Seal | Crates restocked (25%) |
| **Corpse** | Not present | Fresh corpse with blood pool (2–4 bloody tiles) | Pressure-wash blood tiles, then harvest or reanimate corpse | Corpses cleared (15%) |
| **Puzzle** | Scrambled (unsolved) | Solved (levers pulled, blocks placed) | Re-scramble: interact to randomize puzzle state | Puzzles scrambled (10%) |
| **Trap** | Armed (hidden) | Triggered (visible, broken mechanism) | Re-arm: place trap component in mechanism | Traps re-armed (15%) |
| **Door** | Locked | Unlocked (hero picked or bashed it) | Re-lock: interact with lock mechanism | Doors/buttons reset (10%) |
| **Button** | Unpushed (raised) | Pushed (depressed, mechanism activated) | Reset: interact to raise button, deactivate mechanism | Doors/buttons reset (10%) |
| **Enemy (formidable)** | Alive, patrolling (friendly NPC to Gleaner) | Dead (hero killed it) → corpse | Full reanimation at altar (high value) | Enemies restocked (15%) |
| **Vermin (rats/bats)** | Alive, ambient | Dead (hero killed or Gleaner cleared) | Daily refresh (auto) or reanimate for bonus credit | Vermin repopulated (5%) |

### 15.2 Corpse Cleanup — Pressure Washing

Corpses are the messiest reset task. When a hero slays a monster, it leaves:
1. A **corpse tile** at the death position (interactable).
2. A **blood splash** on 2–4 adjacent tiles (grime variant: `TILE_BLOOD_STAIN`).

**Cleanup flow:**
1. Pressure-wash the bloody tiles first. Each tile takes 1 scrub action (same as dirty tile cleaning). Washing reveals the clean floor beneath.
2. Once surrounding blood is cleared, the corpse tile becomes interactable.
3. Interact with corpse → **Harvest** (scavenger mode: collect parts for coin) **or Reanimate** (Gleaner mode: begin reanimation process — see §16).
4. Corpse removed. Tiles fully clean. Readiness contribution recorded.

**Juice:** Blood tiles have a distinct glossy-red overlay. Pressure-washing plays a *hiss-splash* SFX. The clean tile sparkles briefly as the blood vanishes. A "SCRUBBED" micro-toast pops with +1 coin.

### 15.3 Puzzle Re-Scrambling

Solved puzzles are visually distinct: levers are all pulled to one side, pressure plates are depressed, sliding blocks are in their solved configuration. The Gleaner interacts with the puzzle to **randomize** it back to an unsolved state.

**Interaction:** Face solved puzzle → peek shows the solved configuration. `[F] Scramble` → puzzle state randomizes. Animation: blocks slide to new positions (0.3s). SFX: mechanical *click-clack-clunk*.

**Design note:** The Gleaner doesn't need to *solve* puzzles — they just mess them up. This is thematically satisfying: you're making the dungeon harder for the next hero. The scramble is instant because the work is in *finding* all the puzzles, not in solving them.

### 15.4 Door Relocking & Button Resetting

Doors the hero unlocked need to be re-locked. Buttons the hero pushed need to be reset. These are quick interactions — each takes a single `[F] Interact` and plays a *click* SFX.

**Doors:** Face unlocked door → peek shows an open lock icon. `[F] Re-lock` → lock icon snaps shut. Door texture swaps to locked variant. SFX: *clank*.

**Buttons:** Face pushed button (depressed into wall) → peek shows a flat button. `[F] Reset` → button pops out to raised position. SFX: *spring-click*. If the button controlled a mechanism (portcullis, bridge, rotating wall), the mechanism resets too.

**Design note:** Doors and buttons are the lightest reset task — fast to do, low coin value (1 each), but they contribute to the 10% readiness weight. The player can blitz through a corridor relocking doors in seconds. This creates a satisfying speed-run micro-loop within the larger maintenance rhythm.

### 15.5 Persistence Rules Summary

| Element | Persists Across Days? | Reset by Hero Run? | Daily Refresh? |
|---------|----------------------|-------------------|----------------|
| Sealed crate | ✅ Yes — stays sealed until hero smashes it | ✅ Hero empties it | No |
| Cleaned tile | ✅ Yes — stays clean (faint dust cosmetic only) | ✅ Hero may dirty it (combat splatter) | No |
| Re-armed trap | ✅ Yes — stays armed until hero triggers it | ✅ Hero triggers it | No |
| Scrambled puzzle | ✅ Yes — stays scrambled until hero solves it | ✅ Hero solves it | No |
| Locked door | ✅ Yes — stays locked until hero unlocks it | ✅ Hero unlocks it | No |
| Reset button | ✅ Yes — stays reset until hero pushes it | ✅ Hero pushes it | No |
| Reanimated enemy (formidable) | ✅ Yes — patrols until hero kills it | ✅ Hero kills it | No |
| Reanimated vermin | ❌ Cleared daily | ✅ Hero kills them too | ✅ Fresh batch each dawn |
| Blood tiles | ✅ Yes — stays until player pressure-washes | No (hero doesn't clean) | No |
| Player's partial crate fills | ✅ Yes — items in slots persist | ✅ Hero may smash the crate (items lost) | No |

---

## 16. Daily Vermin Refresh & Reanimation Economy

### 16.1 The Vermin Layer

Every dungeon floor has **vermin spawn nodes** — fixed positions in corridors and rooms where rats, bats, and cave spiders appear. These are the dungeon's ambient wildlife. On each work day at dawn, vermin nodes refresh:

- Nodes the player cleared yesterday spawn new vermin.
- Nodes with still-living vermin remain unchanged.
- Vermin never spawn in rooms the player is currently occupying (no pop-in).

**Vermin purpose:**
1. **Micro-combat encounters.** Light combat that keeps the player engaged between maintenance tasks. Vermin use the existing card combat system but with trivial difficulty — 1–2 HP, predictable attack patterns.
2. **Reanimation material.** Defeated vermin leave small corpses that can be reanimated for a minor readiness bonus.
3. **Ambient life.** Vermin make the dungeon feel alive. Their squeaks and flutters are part of the soundscape.

### 16.2 The Reanimation Mechanic

Defeated enemies (vermin or formidable) leave corpses. The Gleaner can **reanimate** these corpses at a **Reassembly Altar** (existing tile type from DOC-4 §17), converting them from dead obstacle to living dungeon inhabitant — a friendly NPC that patrols the floor.

**Reanimation flow:**
1. Defeat enemy in combat (or find hero-killed corpse).
2. Interact with corpse → `[F] Harvest` (scavenger: coins) **or** `[F] Reanimate` (Gleaner: readiness).
3. If reanimate: carry corpse remains to the nearest Reassembly Altar.
4. Interact with altar → deposit remains → altar animation plays (necromantic glow, 1.5s).
5. Reanimated creature spawns at the altar and begins patrolling. It is **friendly to the Gleaner** (won't attack, responds to proximity with a nod or ambient bark). It is **hostile to heroes** on Hero Day.

**Reanimated creatures are coworkers.** They patrol corridors, stand guard in rooms, and add to the dungeon's atmosphere. A well-reanimated floor looks like a living ecosystem — not a dead ruin.

### 16.3 Reanimation Value Hierarchy

Not all corpses are worth the same. The value hierarchy incentivizes the player to prioritize formidable enemies over vermin — but vermin restocking is still worth doing for completionists.

| Creature Type | Combat Difficulty | Reanimate Effort | Readiness Value | Coin Value | Notes |
|--------------|------------------|-----------------|----------------|-----------|-------|
| **Rat** | Trivial (1 HP) | Instant at altar | +1% vermin score | 1 coin | Quick. Many nodes. Adds up. |
| **Bat** | Trivial (1 HP) | Instant at altar | +1% vermin score | 1 coin | Same as rat. Flying variant. |
| **Cave Spider** | Easy (2 HP) | Instant at altar | +2% vermin score | 2 coins | Slightly tougher, slightly better. |
| **Skeleton** | Medium (4 HP) | 1 component + altar | +5% enemy score | 5 coins | Requires bone component (salvaged or bought). |
| **Construct** | Hard (6 HP) | 2 components + altar | +8% enemy score | 8 coins | Requires mechanical parts. Hero-killed constructs leave usable parts. |
| **Elemental** | Hard (8 HP) | 3 components + altar | +12% enemy score | 12 coins | Requires elemental cores (rare drop or shop). Most valuable standard reanimate. |
| **Mini-boss** | Boss (15+ HP) | 5 components + altar + puzzle | +20% enemy score | 25 coins | Floor-specific. Only appears once per Hero cycle. Full questline to reanimate. |

### 16.4 Friendly NPC Behavior (Reanimated Creatures)

Reanimated creatures become part of the dungeon's cast:

- **Patrol routes:** They walk fixed paths between their spawn node and 2–3 nearby waypoints. Same `Pathfind` module used by hostile enemies, but with the aggro flag disabled for the Gleaner.
- **Ambient barks:** Reanimated skeletons might clatter their jaw. Reanimated constructs hum with mechanical resonance. These are 1–2 second ambient SFX that play when the player is within 3 tiles.
- **Hero Day role:** On Hero Day, reanimated creatures fight the hero. Their combat effectiveness depends on the dungeon's readiness. A well-reanimated floor with strong creatures gives the hero a real challenge — and a bigger payout if the hero survives.
- **Death on Hero Day:** Heroes kill reanimated creatures, turning them back into corpses. The cycle begins again.

### 16.5 The Restocking Value Pyramid

The complete restocking value hierarchy, from highest to lowest maintenance effort and reward:

```
        ┌─────────────┐
        │  FORMIDABLE  │  Skeleton, Construct, Elemental, Mini-boss
        │  ENEMIES     │  High value. Multi-step reanimate. 
        │  (15% weight)│  These are the "crop" you cultivate.
        ├─────────────┤
        │  CRATES &    │  Refill slots, seal crates. Medium effort.
        │  TRAPS       │  The bread-and-butter of restocking.
        │  (40% weight)│  Kingdom Two Crowns coin drip lives here.
        ├─────────────┤
        │  TILES &     │  Pressure-wash blood, scrub grime.
        │  CORPSES     │  Satisfying but time-consuming.
        │  (20% weight)│  The "cleaning" pillar's home turf.
        ├─────────────┤
        │  PUZZLES,    │  Quick interactions. Low coin value.
        │  DOORS,      │  Speed-run material. Completionist bait.
        │  BUTTONS     │  The "last 10%" of readiness.
        │  (20% weight)│
        ├─────────────┤
        │  VERMIN      │  Daily refresh. Trivial combat + reanimate.
        │  (5% weight) │  Extra credit. "Nice to have" income.
        └─────────────┘
```

The pyramid communicates priority: **formidable enemies are the most impactful restocking task, vermin are the least.** But a perfectionist who clears every rat node and seals every crate will hit 100% readiness — and the jackpot card that comes with it.

### 16.6 Day-Over-Day Example: A Two-Day Restocking Run

```
DAY 1 (Floor 1.1.1 — Coral Cellars, post-hero state):
  ─────────────────────────────────────────
  Readiness: 0% (everything trashed)
  8 crates smashed, 20 dirty tiles, 3 blood pools (6 bloody tiles),
  2 traps triggered, 1 puzzle solved, 2 doors unlocked,
  3 rat nodes (alive), 1 skeleton corpse, 1 construct corpse

  Morning: Descend. Start at entrance.
  → Pressure-wash 6 bloody tiles near skeleton corpse. (+3% clean)
  → Harvest skeleton corpse for parts. (+bone component in bag)
  → Re-arm 2 traps from bag supplies. (+15% traps)
  → Restock 4 of 8 crates (run out of supplies). (+12% crates)
  → Scramble puzzle. (+10% puzzles)
  → Kill 3 rats in corridor combat. Reanimate 2 at altar. (+2% vermin)
  → Relock 1 door on the way out. (+5% doors)
  
  End of Day 1: Readiness at ~47%. Head home before dusk.
  
DAY 2 (Floor 1.1.1 — continuing):
  ─────────────────────────────────────────
  Readiness: 47% (yesterday's work persists)
  3 new rats spawned at cleared nodes. Construct corpse still there.
  4 crates still need restocking. 14 dirty tiles remain. 1 door unlocked.

  Morning: Buy restock supplies at Coral Bazaar shops.
  → Descend. All sealed crates from yesterday still sealed. ✅
  → Restock remaining 4 crates. (+13% crates — total 25%)
  → Scrub 14 dirty tiles. (+14% clean — total 37%)
  → Reanimate construct at altar (2 mechanical parts). (+8% enemies)
  → Kill 3 new rats, reanimate all 3. (+3% vermin — total 5%)
  → Relock final door. (+5% doors — total 10%)
  
  End of Day 2: Readiness at ~85%. Clean run territory!
  Bait floor with Taskmaster for tomorrow's hero.
  
DAY 3 (HERO DAY):
  ─────────────────────────────────────────
  Hero enters at 85% readiness. Clean run bonus applies.
  Report arrives in mailbox at dusk.
  Payout: 42 coins + 50% bonus = 63 coins.
  Thumbnail: mostly green with a few amber patches.
  "The Seeker cleared the Cellars efficiently. Well maintained."
```

---

## 17. Fail States — Death & Curfew Narrative Design

### 17.1 Design Philosophy: Failure Feeds the Loop

Death and curfew failure are **not** game-overs. They are narrative beats that **accelerate the hero cycle** and create consequences the player must recover from. The player's failure becomes the hero's opportunity — and the hero's success becomes the player's humiliation.

The guiding principle: *Every failure state returns the player to bed, delivers consequences through the mailbox, and makes the world react.* The player always wakes up. The question is: what did they miss?

### 17.2 Death — Hero Rescue & Cycle Shift

When the Gleaner dies (any depth), the hero's party stumbles upon the unconscious operative during their next pass. This **shifts the hero cycle forward** — Hero Day arrives immediately rather than on its scheduled cadence.

**Sequence of events:**

```
Player dies on Day 1 (Work Day):
  ─────────────────────────────────────────
  1. DEATH
     Screen goes deep red → fade to black.
     Narrative overlay: "You fell in the Coral Cellars.
     The darkness took you."
  
  2. HERO RESCUE (overnight)
     The hero's next pass finds the Gleaner unconscious.
     Hero Day shifts forward: the scheduled Day 3 hero run
     now happens on Day 2 instead.
     The hero runs through all baited dungeons — but finds
     them at whatever readiness the player achieved before dying.
  
  3. WAKE AT HOME (morning of Day 2 — now Hero Day)
     Fade in slowly (2.0s, washed-out palette).
     Player is in bed at their home / bonfire spawn location.
     Debuffs applied: GROGGY + SORE + HUMILIATED.
     Mailbox flag is up — the hero run report has arrived.
  
  4. MAILBOX REPORT (death variant)
     Red-bordered parchment. Preamble in italics:
     "The Adventurer's Guild reports that The Seeker found
      Operative [Callsign] face-down in the Coral Cellars.
      They dragged you topside. How humiliating."
     All payouts are HALVED (hero ran through sub-optimally
     stocked dungeons and lost time rescuing the Gleaner).
     Thumbnail dungeon cards show the abbreviated hero run.
  
  5. NEW WORK CYCLE BEGINS (Day 3)
     The cycle resets. The player lost 1–2 work days.
     The dungeons are trashed from the hero run AND from
     whatever the player didn't finish before dying.
```

**Cycle shift rules:**

| When Player Dies | Normal Hero Day | Shifted Hero Day | Work Days Lost |
|-----------------|----------------|-----------------|----------------|
| Day 1 (early cycle) | Day 3 | Day 2 | 2 work days |
| Day 2 (late cycle) | Day 3 | Day 3 (no shift — already imminent) | 1 work day |
| Day 3 (Hero Day) | Day 3 | Day 3 (already Hero Day) | 0 — but payout halved |

**Why this works:** Death is punishing without being a brick wall. The player keeps all sealed crates and cleaned tiles from before they died. The hero still runs. The payout still arrives — just halved. The sting is emotional (humiliation narrative) and temporal (lost work days), not a total reset.

### 17.3 Death Report — Mailbox Variant

The mailbox report after a death-triggered hero run uses a **distinct visual treatment** to make the shame tangible:

```
┌─────────────────────────────────────────────────┐
│  📜  ADVENTURER'S GUILD — EMERGENCY REPORT      │
│  ─────── ⚠ OPERATIVE RESCUE ⚠ ──────────────  │
│                                                  │
│  The Seeker located Operative [Callsign]         │
│  unconscious in the Coral Cellars (Floor 1.1.1). │
│  The operative was returned to their quarters.   │
│  The Guild has docked rescue costs from payout.  │
│                                                  │
│  ┌──────────┐  Coral Cellars (1.1.1)            │
│  │ ▓▓░░░░░░ │  Readiness at rescue: 47%         │
│  │ ░░░░▓▓░░ │  Hero: The Seeker (Fighter)       │
│  │ ▓▓░░░░░░ │  ⚔ 2 monsters slain                │
│  └──────────┘  📦 3 crates smashed               │
│                🪤 1 trap triggered                │
│                🪙 Payout: 17 coins (HALVED)       │
│                ⚠ Rescue cost: −5 coins           │
│                                                  │
│  ┌──────────┐  Coral Bazaar (1.1)               │
│  │ ░░░░░░░░ │  Readiness: 32% ✗ HERO SKIPPED    │
│  │ ░░░░░░░░ │  (Below threshold — not attempted) │
│  │ ░░░░░░░░ │  🪙 Payout: 0 coins                │
│  └──────────┘                                    │
│                                                  │
│  ─────────────────────────────────────────────  │
│  TOTAL: 12 coins deposited (after rescue cost)  │
│  💳 Card drop: None (halved run — no bonus)      │
│  ─────────────────────────────────────────────  │
│  ⚠ "The Guild expects its operatives to stay    │
│     conscious. Try harder, Gleaner."             │
│                                                  │
│  [↑/↓] Scroll   [F] Dismiss                     │
└─────────────────────────────────────────────────┘
```

**Key differences from a normal hero report:**
- Red border and `⚠ OPERATIVE RESCUE` header.
- Rescue preamble narrative (italicised, humiliating).
- All coin payouts **halved** (rounded down).
- A flat **rescue cost** deducted (5 coins — scales with dungeon depth: 5/10/15 for depth 1/2/3).
- No rare card drop. The halved run doesn't qualify for jackpot rewards.
- A snide Guild closing remark. Rotating pool of barbs:
  - *"The Guild expects its operatives to stay conscious."*
  - *"Perhaps the Cellars are above your pay grade."*
  - *"The Seeker asked us to remind you: the pointy end goes toward the enemy."*
  - *"Your rescue was logged. Three more and you're on probation."*

### 17.4 Curfew Failure — The Lighter Path

Failing to return home before 2 AM (100% day time) is a lesser fail state. No hero involvement, no cycle shift. The Gleaner simply overworked and collapsed.

**Sequence of events:**

```
Player is outside home at 2 AM:
  ─────────────────────────────────────────
  1. CURFEW COLLAPSE
     Screen desaturates rapidly (0.3s). Stumble SFX.
     Fade to black (0.4s).
     Narrative flash: "You pushed too hard.
     Your legs gave out on the Promenade steps."
  
  2. WAKE AT HOME (next morning)
     Normal dawn fade-in (1.2s). Player is in bed.
     Debuffs: GROGGY + SORE. No currency penalty.
     No mailbox report — the hero cycle is unchanged.
  
  3. HERO NPC WINK
     When the player exits their home floor (Floor 1.6)
     to the Promenade (Floor 1), a hero NPC is waiting
     just outside the door. One-time encounter:
     
     The NPC turns to face the player. Speech bubble pops
     with a wink (😏 smirk emoji):
     Bark: "Rough night, Gleaner? I've been there."
     
     The NPC then walks away and despawns after 5 seconds.
     This is a one-morning-only event — if the player
     doesn't exit home that morning, they miss it.
  
  4. NORMAL DAY CONTINUES
     No cycle shift. No payout change. The only cost is
     the lost partial day and the debuffs.
```

**Why the wink works:** It's a human moment. The hero isn't gloating — they're commiserating. It signals that heroes are *people*, not forces of nature. It softens the sting of curfew failure and foreshadows the conspiracy layer: the hero knows who you are. They're watching. But they're not unkind about it. Yet.

### 17.5 The Humiliation Gradient

The fail states form a gradient from mild inconvenience to devastating setback, and the narrative tone tracks accordingly:

```
                    ┌─────────────────────────────┐
  CATASTROPHIC      │  Death at depth 3            │
  50% currency      │  Hero cycle shifts forward   │
  + item scatter    │  GROGGY + SORE + HUMILIATED  │
  + SHAKEN (2 days) │  + SHAKEN. Mail: halved,     │
                    │  rescue cost, no card drop.  │
                    │  Guild snark: maximum.        │
                    ├─────────────────────────────┤
  SEVERE            │  Death at depth 1–2          │
  25% currency      │  Hero cycle shifts forward   │
                    │  GROGGY + SORE + HUMILIATED  │
                    │  Mail: halved, rescue cost.  │
                    │  Guild snark: moderate.       │
                    ├─────────────────────────────┤
  MILD              │  Curfew failure              │
  No currency loss  │  No cycle shift              │
                    │  GROGGY + SORE               │
                    │  No mail. Hero NPC wink.     │
                    │  Tone: sympathetic.           │
                    ├─────────────────────────────┤
  NONE              │  Voluntary sleep             │
                    │  Full restore. No debuffs.   │
                    │  "Good night, Gleaner."       │
                    └─────────────────────────────┘
```

### 17.6 NPC Reaction Pool (HUMILIATED Debuff Active)

While the `HUMILIATED` debuff is active (1 day after death), town NPCs draw from a special bark pool:

| NPC Type | Bark |
|----------|------|
| Shopkeeper | *"Heard the hero carried you out. Need a health potion? …On credit?"* |
| Taskmaster | *"The Guild's form for operative rescue has your name on it. Again."* |
| Random townsfolk | *"I saw them bring you back last night. You looked peaceful, at least."* |
| Random townsfolk | *"My kid wants to be a Gleaner. I'm reconsidering."* |
| Inn bartender | *"On the house. You look like you need it."* (Grants a small HP restore item) |
| Hero NPC (rare) | *"No shame in it, Gleaner. The Cellars have claimed better than you."* |

These barks replace the NPC's normal dialogue for one day only. They are never repeated — each NPC delivers their HUMILIATED bark once, then returns to their standard rotation.

### 17.7 Implementation Notes — Fail State Wiring

| System | Change Required | Complexity |
|--------|----------------|-----------|
| `Player.onDeath()` | Trigger cycle shift + bed-return instead of bonfire respawn | Medium |
| `day-cycle.js` (planned) | Accept `shiftHeroDayForward()` call from death handler | Small |
| `mailbox-peek.js` (planned) | Add death-variant parchment template (red border, halved payouts, rescue preamble) | Medium |
| `floor-state-tracker.js` (planned) | Snapshot readiness at death time for the hero run to use | Small |
| `interact-prompt.js` | Spawn hero NPC at Floor 1 door on curfew-morning flag | Small |
| `dialog-box.js` | Add `HUMILIATED` bark pool to NPC bark rotation logic | Small |
| `HUD` | Add `HUMILIATED` debuff icon (😳) to status bar rendering | Trivial |
| `TransitionFX` | Death fade: red→black variant (distinct from normal fade) | Small |

---

## § Cross-References

| Tag | Reference |
|-----|-----------|
| `→ DOC-4 §17` | Gleaner Maintenance system (Cleaning, Restocking, Dungeon Reset) |
| `→ DOC-4 §18` | Hero Path & Stealth — patrol routes, hero types, encounter flow |
| `→ DOC-4 §19` | Faction Economy — who hires the hero, who pays the Gleaner |
| `→ DOC-2 §13` | Gleaner Pivot — original maintenance loop specs |
| `→ DOC-2 §13.3` | Dungeon Reset Loop — readiness score, work orders, monster reassembly, secret restoration |
| `→ DOC-2 §14` | Hero Path System — cycle timer, route generation |
| `→ DOC-2 §16 Phase 3` | Dungeon Reset tasks (work orders, readiness submission) |
| `→ DOC-1 Phase C` | Cleaning system implementation (tile conditions, cleaning tools) |
| `→ DOC-1 Phase D` | Hero AI implementation (patrol, sight cones, wake of carnage) |
| `→ DOC-6` | Audio Engine — SFX wiring for day/night bells, barks, peeks |
| `→ DOC-9 §3` | Bark System Architecture — bark pool key convention for interior NPC/interaction barks |
| `→ DOC-9 §9` | Building Interior NPC Assignment — NPC roster per building, homeFloor pattern |
| `→ DOC-10` | Cozy Interiors Design — time-freeze rule, bookshelf/bar interactions, building inventories, juice |
| `→ DOC-10 §2` | Time-Freeze Rule — depth-2 floors freeze world clock, edge cases, HUD indicator |
| `→ DOC-10 §4–5` | Bookshelf + Bar Counter interaction specs |
| `→ DOC-10 §6` | Per-building interaction inventory (tiles, positions, content) |
| `→ DOC-10 §8` | Book data schema (`data/books.json`) |
| `⊕ PHASE C` | Cleaning system — clean pillar foundation |
| `⊕ PHASE D` | Hero AI — hero cycle foundation |
| `⊕ PHASE E` | Economy wiring — Kingdom Two Crowns drip model |
| `⊕ PHASE F` | Dungeon persistence — per-tile state save/load across day boundaries |

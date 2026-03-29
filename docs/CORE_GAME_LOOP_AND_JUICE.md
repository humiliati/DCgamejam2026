# Dungeon Gleaner — Core Game Loop & Juice Design

**Created**: 2026-03-29  
**Scope**: Identifies the game's three toyful pillars, defines the narrative hero cycle and day/night pressure system, expands peek interactions for the time cycle, and catalogs juice opportunities to make every action feel satisfying.  
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
| Crates restocked | 40% | Crate fill bar |
| Tiles cleaned | 30% | Grime overlay intensity |
| Traps re-armed | 20% | Trap icon pulse |
| Puzzles scrambled | 10% | Puzzle tile tint |

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

The Gleaner lives in a **rented room** at the Driftwood Inn (Floor 1.2) or a **bunk at the Gleaner's Guild** (Floor 1.3). This is the player's **anchor point** — the place they always return to. It is to Dungeon Gleaner what the farmhouse is to Stardew Valley.

**Home features:**
- **Bed** — Interact (peek-style) to sleep and advance to next day. Rest bonuses applied.
- **Stash chest** — Persistent storage. Items survive death (existing `stash` in Player state).
- **Mailbox** — Read overnight results: hero run reports, Guild notices, NPC gossip. New mail indicated by a flag icon on the HUD.
- **Mirror** — Quick stat/loadout check (existing HUD info, presented diegetically).
- **Wall clock** — Shows the current day number and time of day. Also shows which day in the hero cycle: `"Day 2 of 3 — Heroes arrive tomorrow."`.

### 5.3 Day/Night Skybox Transitions

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

### 5.6 Sleep, Death & Waking at Home

Sleep and death both end the current day. The difference is how the player *arrives* at the next morning — and what debuffs they carry.

**Voluntary sleep (bed interaction):**
- Player faces bed at home → peek shows a pillow with a clock overlay.
- `[F] Sleep` advances to next dawn. Full HP/energy restore. No debuffs.
- If it's a work day: normal morning. If it's the night before Hero Day: heroes run overnight.

**Death at Depth 1–2 (exterior/interior):**
- Non-lethal (existing behavior: bonfire respawn + 25% currency penalty).
- **New:** Instead of bonfire respawn on the same floor, the Gleaner **wakes up at home** the next morning.
- Narrative: *"You collapsed in the Coral Bazaar. A shopkeeper dragged you back to the inn."*
- **Debuffs** (persist until the following dawn):
  - `GROGGY` — Movement speed −20% (WALK_TIME 500ms → 625ms).
  - `SORE` — Cleaning efficiency −1 tier (dirty→clean takes 2 scrubs instead of 1).
  - `LIGHT POCKETS` — 25% currency penalty (existing) applied before waking.
- The rest of the current day is **lost**. The player effectively failed to return home by curfew.

**Death at Depth 3 (dungeon — permadeath):**
- Unchanged: `Player.onDeath()` → 50% currency scatter, hand/bag/equipped items drop.
- **New framing:** The game over screen reads *"The deep dungeon claimed you. Your stash at the inn survives."*
- On continuing (if implemented): player respawns at home with stash intact but everything else gone. Fresh start for the next 3-day cycle.

**Curfew collapse (passed out in the field):**
- Triggers if the player is anywhere except home at 100% day time.
- Same as depth 1–2 death debuffs (`GROGGY` + `SORE`) but **no currency penalty**.
- Narrative: *"You passed out from exhaustion. A patrol found you and carried you home."*
- Crates the player was filling mid-task **do not seal** — partial fills are lost.

**Debuff summary table:**

| Wake Condition | Currency Penalty | HP/Energy | Debuffs | Day Lost? |
|---------------|-----------------|-----------|---------|-----------|
| Voluntary sleep | None | Full restore | None | No — chosen |
| Curfew collapse | None | Full restore | GROGGY + SORE (1 day) | Yes — overworked |
| Death (depth 1–2) | 25% | Full restore | GROGGY + SORE (1 day) | Yes — failed |
| Death (depth 3) | 50% + item scatter | Full restore | GROGGY + SORE + SHAKEN (2 days) | Yes — catastrophic |

`SHAKEN` (depth-3 death only): Max HP reduced by 20% for 2 days. The deep dungeon leaves a mark.

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

### 6.4 Day/Night Cycle Juice

| Moment | Juice Opportunity |
|--------|------------------|
| Dawn (wake at home) | Camera fades in slowly (1.2s). Warm amber light through the room window. A rooster crow or morning bell SFX. HUD clock fades in at `DAY 4 — 6:00 AM`. |
| Skybox day transition | Zenith/horizon colours smoothstep over 30 real seconds. Clouds drift. Sun position (bright spot on horizon gradient) tracks the clock. |
| Dusk warning bell | Single toll of the town bell (diegetic). Skybox shifts toward orange/red. HUD clock border pulses amber. Shopkeeper NPCs start walking indoors. |
| Night falls | Star field fades in (existing Skybox star layer). Town ambient SFX shifts from "market bustle" to "crickets + distant waves". Torch-lit windows glow on building facades. |
| Curfew collapse | Screen desaturates rapidly (0.3s). A stumble SFX plays. Fade to black faster than normal (0.4s). Dawn fade-in shows the player in bed with `GROGGY` icon on HUD. |
| Debuff applied | Debuff icon (☁ for GROGGY, 🩹 for SORE, 💀 for SHAKEN) slides onto the HUD status bar with a dull *thud* tone. Icon pulses once, then persists. |
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

## § Cross-References

| Tag | Reference |
|-----|-----------|
| `→ DOC-4 §17` | Gleaner Maintenance system (Cleaning, Restocking, Dungeon Reset) |
| `→ DOC-4 §18` | Hero Path & Stealth — patrol routes, hero types, encounter flow |
| `→ DOC-4 §19` | Faction Economy — who hires the hero, who pays the Gleaner |
| `→ DOC-2 §13` | Gleaner Pivot — original maintenance loop specs |
| `→ DOC-2 §14` | Hero Path System — cycle timer, route generation |
| `→ DOC-2 §16 Phase 3` | Dungeon Reset tasks (work orders, readiness submission) |
| `→ DOC-1 Phase C` | Cleaning system implementation (tile conditions, cleaning tools) |
| `→ DOC-1 Phase D` | Hero AI implementation (patrol, sight cones, wake of carnage) |
| `→ DOC-6` | Audio Engine — SFX wiring for day/night bells, barks, peeks |
| `⊕ PHASE C` | Cleaning system — clean pillar foundation |
| `⊕ PHASE D` | Hero AI — hero cycle foundation |
| `⊕ PHASE E` | Economy wiring — Kingdom Two Crowns drip model |

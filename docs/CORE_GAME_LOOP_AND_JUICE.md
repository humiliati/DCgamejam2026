# Dungeon Gleaner — Core Game Loop & Juice Design

**Created**: 2026-03-29  
**Scope**: Identifies the game's three toyful pillars, defines the hero-dispatch economy, and catalogs juice opportunities to make every action feel satisfying.  
**Audience**: All team members — engineers, artists, and the designer.

---

## 1. The One-Line Pitch

> **You are the dungeon's janitor. Clean it up, restock it perfectly, then ring the bell — and watch the hero destroy it all over again.**

The game is a **toyful maintenance loop** framed as blue-collar dungeon work. The player is never the hero. They are the crew that makes heroism possible. The central tension is: *can I get this place perfectly stocked before the hero kicks in the door?*

---

## 2. The Three Core Pillars

These three loops must each feel good in isolation. Together they compound into the full experience.

| # | Pillar | One-Liner | Primary Verb |
|---|--------|-----------|-------------|
| 1 | **Clean** | The dungeon is trashed. Make it spotless. | Scrub |
| 2 | **Restock** | The crates are empty. Fill them back up. | Fill |
| 3 | **Deploy** | Ring the bell. Send the hero in. | Deploy |

The pillars must feel distinct. Cleaning is tactile and spatial. Restocking is economic and inventory-driven. Deploying is the moment of validation — the release valve.

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

## 4. The "Send the Hero" Button — Deploy Mechanic

### 4.1 Bridge Simulator Pattern

In *Poly Bridge*, the player builds their bridge and then presses **Simulate** — a truck drives across and either makes it or collapses. The simulation is the payoff. All the building leads to that one moment.

Dungeon Gleaner's equivalent: the **Deploy button**. When the player believes a floor (or a full dungeon chain) is sufficiently restocked, they press Deploy. A Hero enters, follows their patrol route, and the player watches from safety as their work is stress-tested in real time.

```
Player thinks dungeon is ready
        │
        ▼
   [ DEPLOY HERO ]  ← the button
        │
        ▼
Hero enters at STAIRS_DN
Hero follows patrol route
Hero smashes crates, kills monsters, triggers traps
        │
        ▼
   Gleaner's Guild calculates payout
   based on readiness score at time of deploy
        │
        ▼
Dungeon is trashed again → begin next maintenance cycle
```

### 4.2 The Deploy Button — UX Contract

- **Location**: The Gleaner's Guild terminal (Floor 1.3), or equivalently at any floor's **work order board** for per-floor deploys.  
- **Label**: `[ DISPATCH HERO ]`  — diegetically framed as filing a work request with the Adventurer's Registry.  
- **Disabled state**: Button is greyed out with tooltip `"Dungeon not ready — check readiness"` until the floor reaches its minimum readiness threshold (default: 60%).  
- **Enabled state**: Button pulses with a slow gold glow. Readiness percentage is shown in the button label: `[ DISPATCH HERO — 78% READY ]`.  
- **On press**: Confirmation dialog — *"Submit dungeon for hero expedition? You will be expelled from the active floors during the run."*  
- **During the run**: Player is locked to the town level (Floor "1") and can watch via a **CCTV monitor** in the Gleaner's Guild — a minimap-style view showing the hero sprite moving through the floor graph. Flashes red when the hero smashes something. Pulses gold when the hero completes a puzzle.  
- **Payout**: After the hero exits via STAIRS_UP, the Guild terminal shows the payout breakdown: coins + (if score ≥ 80%) a rare card roll.

### 4.3 Per-Floor vs. Full-Chain Deploy

| Deploy Type | Scope | Minimum Readiness | Bonus Payout |
|-------------|-------|------------------|-------------|
| **Floor Deploy** | Single floor | 60% | Standard |
| **Dungeon Chain Deploy** | All floors in a chain | 70% average | +50% coins |
| **Perfect Run Deploy** | All floors ≥ 90% | 90% all | Guaranteed rare card |

Floor deploys are the player's bread and butter. Full chain deploys are the weekly paycheck. Perfect Run is the dungeon equivalent of Kingdom Two Crowns' "full wall, full archers" moment.

### 4.4 What the Hero Does During a Run

The hero is not random. Their behavior is deterministic per hero type and fully visible on the CCTV monitor. The player learns hero behavior through observation, then optimizes their restocking *around it*.

| Hero Type | Smashes | Solves | Loots | Traps |
|-----------|---------|--------|-------|-------|
| Fighter (Seeker) | All breakables | Brute force | Heavy | Triggered |
| Scholar | Puzzles only | Everything | Light | Avoided |
| Rogue (Shadow) | Locks only | Bypass | Cherry-picked | Bypassed |
| Crusader | Monster stocks | None | Armour only | Triggered |

**Implication**: If the player wants maximum payout, they learn which hero is being dispatched and restock accordingly. Crusader incoming? Over-stock the monster reassembly crates. Scholar incoming? Make sure the puzzles are scrambled perfectly.

---

## 5. Day/Night Cycle — Stardew Valley Pressure System

### 5.1 Why the Cycle Exists

The hero deploy is available as a voluntary action, but the game needs *involuntary pressure* — the feeling that time is running out. Stardew Valley's clock creates exactly this: the player is never forced to go to bed, but the day ends whether they're ready or not.

The Day/Night cycle provides:
1. **Natural pacing** — the player can't grind infinitely on one floor.  
2. **Involuntary hero dispatch** — if the player sleeps (ends the day), the hero runs automatically on whatever floors were ready at midnight.  
3. **Economic pressure** — payout only comes after a hero run. No run = no coins = no shop progress.

### 5.2 Day/Night Loop

```
────────────────────────────────────────────────────
 DAY (Player active in dungeon)
   ↓  Player cleans, restocks, re-arms
   ↓  Readiness bars fill
   ↓  Clock visible on HUD (sun position, 12-hour day)
   ↓  At ~80% of day time: warning bell rings
      "The guilds close at sundown. Finish up."
   ↓  Player chooses: stay and push for higher score,
      or exit to town before the clock hits midnight
────────────────────────────────────────────────────
 DUSK (Player in town)
   ↓  Player can visit shops, check work orders
   ↓  Clock still ticking (slower in town)
   ↓  Can manually press [ SLEEP ] at the inn
────────────────────────────────────────────────────
 NIGHT (Midnight — automatic or manual trigger)
   ↓  Screen fades to black ("Gleaner sleeps")
   ↓  Hero runs automatically on all ready floors
   ↓  CCTV summary plays at accelerated speed
   ↓  Payout calculated from run results
────────────────────────────────────────────────────
 DAWN (New day begins)
   ↓  Gleaner wakes at inn (or last safe position)
   ↓  Payout summary displayed on inn noticeboard
   ↓  All ready floors are now trashed again
   ↓  Work orders updated with new readiness targets
────────────────────────────────────────────────────
```

### 5.3 Clock Mechanics

| Parameter | Default | Notes |
|-----------|---------|-------|
| Day length | 8 minutes real time | Configurable tuning lever |
| Dusk warning | At 6 minutes (75%) | Bell SFX + HUD flash |
| Midnight auto-sleep | At 8 minutes | Forced sleep if player stays in dungeon |
| Town clock speed | 0.5× | Player gets more time to shop |
| Post-deploy pause | 30 seconds | Watch the CCTV summary, then new day starts |

**The midnight trap:** If the player is in the dungeon at midnight, they do not get a soft landing. The floor fades to black, the hero enters immediately, and the player respawns at the inn at dawn with whatever they had in their bag. Crates they were filling mid-task do not count as sealed — partial fills are lost. This creates genuine urgency without being punishing (the player loses potential payout, not progress).

### 5.4 Sleep as a Verb

The player can choose *when* to sleep. Pressing `[ SLEEP ]` at the inn is voluntary and has mechanical weight:
- **Sleep early** (< 70% day): Hero runs immediately. Low readiness = low payout. No time wasted, but you left coins on the table.  
- **Sleep on time** (70–100% day): Standard run. Normal payout.  
- **Sleep late** (forced at midnight): Hero runs on whatever was ready. Floors below threshold yield nothing (work order failed). Floors above threshold still pay.  

The Stardew pattern: *"Just let me seal this last crate"* is the intended mental state. The player should feel mild panic at 75% of day time and be making active tradeoff decisions.

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

### 6.3 Deploy Pillar Juice

| Action | Juice Opportunity |
|--------|------------------|
| Deploy button unlocks | Button animates from greyed-out to gold with a *shimmer* wipe. Tooltip changes from "Not ready" to "HERO READY". |
| Press Deploy | Button press SFX (heavy lever pull). Screen briefly shows the Adventurer's Registry seal (like a rubber stamp: *DISPATCHED*). |
| Hero enters STAIRS_DN | CCTV monitor flashes on. Hero sprite icon appears on minimap. Entry SFX: heavy footstep + dungeon door slam. |
| Hero smashes a crate | CCTV flash (red overlay for 0.2s). Crate icon on the floor graph turns red. A distant crash SFX plays. |
| Hero kills a reassembled monster | Short death SFX (distant). Monster icon removed from floor graph. |
| Hero exits via STAIRS_UP | CCTV dims. "RUN COMPLETE" banner. Coin total tallies up with an arcade score-counter sound. |
| Payout arrives | Coins drop into the player's total from the top of screen with stagger timing (like a slot machine paying out). Each coin has a *clink* SFX with slight random pitch variance. |
| Rare card awarded | The card flies in from offscreen, flips face-up, and lands with a card-slap SFX. A light burst plays behind it. |

### 6.4 Day/Night Cycle Juice

| Moment | Juice Opportunity |
|--------|------------------|
| Day begins (dawn) | Sky colour shifts from indigo → orange → blue via the skybox palette. A rooster crow or morning bell SFX. HUD clock hand snaps to 6am. |
| Dusk warning | Bell rings (diegetic — it's the town bell). Skybox starts shifting toward orange/red. HUD clock pings and the hour hand twitches. |
| Midnight (forced sleep) | Screen fades to black faster than the normal transition (0.4s instead of 0.8s). A *yawn* SFX plays. Mild screen desaturation before fade. |
| Wake at dawn | Fade-in slower (1.2s). Dawn colour palette on the skybox. Inn ambient sound. Payout summary on the noticeboard brightens as the player looks at it. |
| CCTV accelerated replay | Each hero footstep tick fires a compressed SFX (lower pitch, faster). The replay runs at 3× speed. Dramatic music stab when the hero exits. |

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

The game's difficulty curve is the readiness target increasing over time. This is a Kingdom Two Crowns-style escalation: the dungeon gets harder to maintain because heroes get more destructive, and the Guild demands higher standards.

```
Day 1–3:   60% target   — Easy mode. Even partial restocking pays out.
Day 4–7:   70% target   — Medium. The player must clean and restock.
Day 8–12:  80% target   — Hard. All four sub-scores must be meaningful.
Day 13+:   90% target   — Expert. Perfect runs required for jackpot.
```

The target escalation is displayed transparently at the work order board. The player always knows what's expected of them.

---

## 8. The Sleep → Wake Loop as the Session Rhythm

The Day/Night cycle creates a **natural session boundary**. The player always knows:

1. *What they need to do* (readiness targets on the work order board).  
2. *When they need to do it by* (the clock).  
3. *What they get when they're done* (the payout shown on the Deploy button).  

This makes the game easy to pick up and put down. Each night is a complete session. Each dawn is a fresh start. The loop is:

```
Wake → Check work orders → Descend → Clean + Restock → 
Ascend before midnight → Sleep → Watch hero run → 
Collect payout → Wake again
```

This is the *"one more day"* pull that makes Stardew Valley unputdownable. The dungeon is the farm. The hero is the harvest season. The Gleaner's Guild is the shipping crate at the end of the pier.

---

## 9. Implementation Notes

These design elements map to existing and planned modules:

| Design Element | Module | Status |
|----------------|--------|--------|
| Readiness score | `crate-system.js` + `floor-state-tracker.js` (planned) | Partial (crate sub-score in B4) |
| Deploy button | `gleaner-guild.js` (planned) or `shop.js` extension | Not started |
| Day/Night clock | `day-cycle.js` (planned) | Not started |
| CCTV monitor | Minimap layer + `hero-system.js` (planned) | Not started |
| Tile cleaning | `cleaning-system.js` (Phase C) | Not started |
| Dusk warning SFX | `AudioSystem` + `DoorContractAudio` pattern | Ready to wire |
| Crate seal juice | `crate-ui.js` canvas rendering | In progress (B2) |
| Coin drop animation | HUD toast + `TransitionFX` | Partial |

The Deploy button and Day/Night clock are **Phase D/E priority items** once Phase C (cleaning system) is playable.

---

## 10. Design Axioms

These principles guide every design decision on the core loop:

1. **Every action pays**. If the player does something, they get feedback and a reward signal within 1 second.  
2. **The hero is the evaluator, not the enemy**. The hero is a force of entropy that validates the player's work. They are not the final boss in the maintenance loop — they are the test vehicle.  
3. **The clock creates choices**. The day/night clock is not punishment. It is the device that makes *decisions* feel meaningful. Without the clock, there is no reason to ever stop restocking.  
4. **Visible progress bars are the game**. The player should be able to walk into a floor and instantly understand: how clean is it, how full are the crates, and what readiness am I at? If they can't read this at a glance, the HUD has failed.  
5. **The jackpot card is always one session away**. The rare card reward from a Perfect Run must always feel achievable but not guaranteed. The player knows exactly what score they need.

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
| `⊕ PHASE C` | Cleaning system — clean pillar foundation |
| `⊕ PHASE D` | Hero AI — deploy pillar foundation |
| `⊕ PHASE E` | Economy wiring — Kingdom Two Crowns drip model |

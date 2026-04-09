# Game Over — Hard Failure Design

This document describes the **hard game over** path for Dungeon Gleaner: the
end-of-week-2 failure state that returns the player to the title screen with
no combat-style rescue. It is distinct from the **soft rescue** that occurs
when the player is defeated in combat.

## The two failure kinds

Dungeon Gleaner has two clearly separated failure flows. They must never be
confused in code, UI, or player experience.

**Soft rescue (combat defeat).** When the player's HP drops to zero in a
combat encounter, the defeat is narratively framed as a rescue: a passerby,
a Guild runner, or the ambient safety net of the settlement intervenes. The
player loses turn progress, may drop currency or cards, and wakes up at a
checkpoint (safehouse, infirmary, or nearest shrine). The run continues.
The calendar does **not** advance. No title-screen return.

**Hard game over (rent + deadline failure).** When the player fails to
satisfy the two survival contracts the settlement imposes on them — paying
weekly rent at the safehouse, and reaching Vivec city before the end of
week two — the game ends. The screen fades, a failure vignette plays, the
save is marked terminal, and the player is returned to the title screen.
There is no rescue, no continue, no checkpoint. The run is over.

## The two survival contracts

### 1. Weekly safehouse rent

The player sleeps at the safehouse on Lantern Row. The landlord keeps a
ledger. Each in-game week the player must present rent in coin (or, in
future, a Guild voucher) before the week rolls over. On payment the
landlord stamps a page in the **Rent Receipt Book** — a journal item the
player carries permanently. The receipt book is:

- The proof of residence the Immigrant Inspector checks at the Vivec arch
  (see `engine/npc-system.js` → `floor3_inspector`, `gateCheck` tag).
- A narrative token of stability in a world of drifters.
- The player-facing visible clock. Every stamped page is a survived week.

**Failure condition.** If the week-rollover tick fires and the player has
not paid rent, the landlord evicts them at dawn. Eviction is the first
hard game over trigger. The safehouse door is barred from the inside; the
player has no sleeping location; the fade-to-title fires on the next tick.

### 2. Reach floor 4 before end of week 2

The player arrives in the settlement as an outsider. The entire first act
is a countdown to the Grand Arch crossing. Floor 3 (The Garrison) contains
the arch. The arch is a `LOCKED_DOOR` tile guarded by the Immigrant
Inspector. Passage requires the Rent Receipt Book showing the current
week's stamp.

**Failure condition.** At the end-of-week-2 rollover tick, if the player
has not yet been stamped through the arch, the arch is declared closed
for that immigration cycle. The Inspector walks away, the LOCKED_DOOR
tiles convert to plain WALL tiles, and the crossing disappears from the
world for the duration of the run. The fade-to-title fires on the next
tick. This is the second hard game over trigger.

These two contracts are deliberately coupled. The rent receipt is both the
literal means of paying to stay alive AND the document the Inspector
requires. A player who can pay rent can cross the arch. A player who
cannot do either fails in the same week for the same root reason:
insufficient weekly income to sustain residence.

## Week calendar

Week length and rollover timing are defined elsewhere in the calendar
system (see `CORE_GAME_LOOP_AND_JUICE.md`). For the purposes of this
document, assume:

- A week is seven in-game days.
- Rent is due on the final day of each week, before the bed-sleep that
  rolls the calendar into the next week.
- End of week 2 = the 14th in-game day rollover tick.
- The hard game over check fires on that tick, after all rent checks have
  resolved.

## Hard game over flow

1. **Trigger detection.** The calendar system fires a `week_rollover`
   event. The game loop checks: (a) was rent paid for the week that just
   ended? and (b) if the new week is week 3, has the player been stamped
   through the Vivec arch?
2. **Trigger resolution.** If either check fails, the game transitions
   into the hard-game-over state. Any in-progress combat is force-resolved
   as a silent rescue to avoid a soft-rescue screen competing with the
   hard over.
3. **Failure vignette.** A short context-dependent vignette plays:
   - *Eviction.* The landlord, apologetic but firm, sets the player's
     meager belongings outside the safehouse door and slides the bolt.
     Dawn fog. No dialogue.
   - *Arch closure.* The Inspector rolls up his papers, blows out his
     lantern, and walks east through the arch. The LOCKED_DOOR tiles
     seal. The crowd disperses silently.
4. **Fade.** Screen fades to black over 3-4 seconds. A single text line
   appears in period-appropriate serif: *"The week turned. You did not."*
5. **Title return.** The save slot is marked terminal (new field
   `run.terminated: true` with a reason code: `'eviction'` or
   `'arch_closed'`). The player is returned to the title screen. Any
   "Continue" option on that slot is disabled; only "New Run" is
   available for that save slot going forward.

## What hard game over is NOT

- **Not a combat outcome.** Combat defeat always routes through the soft
  rescue. If the player is in combat at the moment of the week rollover,
  the combat is force-resolved without damage, the rollover fires, and
  hard game over (if triggered) displays over the cleared combat screen.
- **Not recoverable.** There is no retry, continue, or rewind. The save
  slot is terminal for that run. The player can start a new run in the
  same slot, but the previous run is gone.
- **Not a punishment for exploration.** Players who are actively
  questing, dungeoneering, or socializing are free to do so as long as
  they earn enough coin for weekly rent and allocate time to pass the
  arch before week 2 closes. The failure is specifically for neglect of
  the two contracts, not for slow play per se.

## Design intent

The hard game over exists so the calendar has teeth. Without it, the
rent/deadline pressure is cosmetic and the Immigrant Inspector is a
theme-park prop. With it, every in-game decision is implicitly weighed
against the clock: is this side quest worth a day? can I afford to fail
this dungeon run and still make rent? should I skip the Tea House and
head straight for the safehouse ledger?

The goal is not to frustrate the player but to make the settlement feel
like a place with real edges. A player who engages with the economy and
the calendar will never see the hard game over. A player who ignores
both will see it once, understand what the game is asking, and either
start a new run with that knowledge or put the game down. Both outcomes
are acceptable. The soft rescue is where forgiveness lives; the hard
game over is where consequence lives. Keep them clean and separate.

## Implementation notes (for wiring)

- **LOCKED_DOOR tiles** for the Vivec arch are placed at Floor 3 tiles
  `(51,25)` and `(51,26)` with `lockedDoors` metadata referencing the
  `rent_receipt_book` key and human-readable name `proof of residence
  (see the Inspector)`. See `engine/floor-blockout-3.js`.
- **Inspector NPC** is registered as `floor3_inspector` in
  `engine/npc-system.js`. His gate-check tag declares the required book
  id and the unlock flag keys (`locked_door_3:51,25` and
  `locked_door_3:51,26`). The dialogue tree is wired in `engine/game.js`
  and currently stubs the `check_papers` branch to always reject;
  wire-up will read the Journal for the `rent_receipt_book` entry and
  route accordingly.
- **Aloof crowd** (four ambient NPCs) is registered alongside the
  Inspector. Their bark pool is `ambient.vivec_crowd` in
  `data/barks/en.js` and carries the immigration pressure narratively.
- **Rent receipt book** does not yet exist as a journal entry type.
  Introducing it will involve: (a) defining the `rent_receipt_book`
  entry in the journal schema, (b) adding a landlord NPC at the
  safehouse who appends a stamped page on rent payment, (c) adding the
  week rollover tick handler that checks paid/unpaid and fires either
  continuation or hard game over, (d) adding the arch closure scheduled
  event that fires at the end-of-week-2 rollover if the arch has not
  been crossed. These are four separate tasks and should be scoped
  individually.
- **Hard game over state** does not yet exist in the state machine. It
  will need a new top-level state distinct from the combat-defeat state,
  a save-slot flag, a fade/vignette sequence, and a title-screen hook
  that disables continue for terminal slots.

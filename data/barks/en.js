/**
 * Bark pools — English locale.
 *
 * Layer 5 (data, loaded after all engine modules). Registers all NPC
 * bark text with BarkLibrary. Engine code references pool keys only —
 * no bark text ever lives inside logic files.
 *
 * Pool key convention:
 *   ambient.<floor>          — random passerby on a given floor
 *   ambient.<floor>.<ctx>    — passerby during a specific context/time
 *   npc.<id>.<situation>     — named NPC lines for a specific situation
 *   system.<event>           — system-driven barks (day start, curfew, etc.)
 *
 * Fable-style weight guide:
 *   weight 3  — common / flavour filler
 *   weight 2  — situational standard
 *   weight 1  — less common
 *   weight 0.5 — rare colour
 *   oneShot   — story-critical, fires once per session max
 *
 * All bark text uses the 🗣️ prefix convention for ambient passerby lines
 * and no prefix for named NPC lines (speaker field carries the name).
 */

// ── Floor 0: The Approach ────────────────────────────────────────────
// Sparse — the courtyard is mostly empty at dawn. A couple of
// maintenance workers crossing the yard.

BarkLibrary.register('ambient.approach', [
  { text: '🗣️ "Early shift, huh?"',                                          weight: 3 },
  { text: '🗣️ "Watch your step — cobblestones are slippery at dawn."',       weight: 2 },
  { text: '🗣️ "The Guild notice board is already up. Heroes coming."',        weight: 2 },
  { text: '🗣️ "You the new Gleaner? Good luck in there."',                    weight: 1 },
  { text: '🗣️ "Smells like smoke from the lower cellars again..."',           weight: 1, style: 'bubble' }
], { cooldownMs: 20000 });

// ── Floor 1: The Promenade — general ambient ─────────────────────────
// Mixed crowd: shopkeepers opening up, delivery workers, idle citizens.
// These fire throughout the day whenever the player is near an NPC.

BarkLibrary.register('ambient.promenade', [
  { text: '🗣️ "Working day, Gleaner. Shouldn\'t you be underground?"',        weight: 3 },
  { text: '🗣️ "They say heroes arrive in three days. Place better be ready."',weight: 3 },
  { text: '🗣️ "Guild posted another reset contract. Big one."',               weight: 2 },
  { text: '🗣️ "That dungeon entrance looked sealed this morning..."',         weight: 2 },
  { text: '🗣️ "You forget your keys again? My cousin does that every week."', weight: 2, style: 'bubble' },
  { text: '🗣️ "Adventurers pay better when the traps actually work."',        weight: 1 },
  { text: '🗣️ "The Dispatcher was looking for you earlier."',                 weight: 1 },
  { text: '🗣️ "I heard the last Gleaner quit without finishing the reset. Brave of you to take the job."', weight: 0.5 }
], { cooldownMs: 30000 });

// ── Floor 1: The Promenade — morning (Day 1 pre-work nudge) ─────────
// These barks fire specifically during the morning arrival sequence on
// Day 1, before the player retrieves their work keys. Slightly more
// pointed — the town notices the player hasn't gone to work yet.

BarkLibrary.register('ambient.promenade.morning', [
  { text: '🗣️ "Why aren\'t you at work?"',                                    weight: 3 },
  { text: '🗣️ "Don\'t you know the adventurers are coming in three days?"',   weight: 3 },
  { text: '🗣️ "The dungeon won\'t reset itself, you know."',                  weight: 2 },
  { text: '🗣️ "Gleaner\'s Guild contract says dawn start. Sun\'s already up.",', weight: 2 },
  { text: '🗣️ "My nephew works the Coral Cellars. He says they\'re a mess after last cycle."', weight: 1, style: 'bubble' }
], { cooldownMs: 25000 });

// ── Floor 1: Hero Day ambient ────────────────────────────────────────
// Fired by the ambient bark system on the day heroes are scheduled
// to arrive. Citizens are excited, nervous, or gossiping.

BarkLibrary.register('ambient.promenade.heroday', [
  { text: '🗣️ "They\'re coming today. Saw the Guild banner go up at dawn."',  weight: 3 },
  { text: '🗣️ "Hope the Gleaner finished the reset in time..."',              weight: 3 },
  { text: '🗣️ "Three heroes registered. Betting the Rogue doesn\'t make it back."', weight: 2 },
  { text: '🗣️ "Shop\'s closing early. Don\'t want adventurers tracking blood in."', weight: 2, style: 'bubble' },
  { text: '🗣️ "I heard one of them is a Dragon Slayer."',                     weight: 1 },
  { text: '🗣️ "Imagine being a hero. All glory, no cleanup duty."',           weight: 0.5 }
], { cooldownMs: 40000 });

// ── Floor 1: Dusk / curfew warning ambient ───────────────────────────
// NPCs start heading home. Warn the player it's getting late.

BarkLibrary.register('ambient.promenade.dusk', [
  { text: '🗣️ "Getting dark. You should head in."',                           weight: 3 },
  { text: '🗣️ "Shops are closing. Everything alright?"',                     weight: 2 },
  { text: '🗣️ "Guild curfew\'s at two bells. Don\'t push it."',               weight: 2 },
  { text: '🗣️ "Last Gleaner who worked through the night ended up in the infirmary."', weight: 1 }
], { cooldownMs: 60000 });

// ── Dispatcher (player's employer) — gate encounter, Day 1 ──────────
// The Dispatcher is the player's agency handler. He appears at the
// dungeon entrance on Day 1 to enforce the key protocol before the
// player can enter. He's not unkind, but he's firm.
//
// These lines are ordered by situation. oneShot lines play once and
// retire — they're the story beats. Repeat lines are the "persistent
// gate guard" fallbacks when the player walks into the NPC multiple times.

BarkLibrary.register('npc.dispatcher.gate.intro', [
  {
    text:    'Hold it. You can\'t enter without your work keys. Guild protocol.',
    speaker: 'Dispatcher',
    style:   'dialog',
    weight:  1,
    oneShot: true
  },
  {
    text:    'Your access keys. Dungeon stays sealed until you badge in.',
    speaker: 'Dispatcher',
    style:   'dialog',
    weight:  1,
    oneShot: true
  }
], { cooldownMs: 0 });

BarkLibrary.register('npc.dispatcher.gate.direction', [
  {
    text:    'Keys are at your bunk. Home door — north side of the Promenade, follow the wall east. Can\'t miss it.',
    speaker: 'Dispatcher',
    style:   'dialog',
    weight:  1,
    oneShot: true
  }
], { cooldownMs: 0 });

BarkLibrary.register('npc.dispatcher.gate.nudge', [
  // Repeat lines after intro has fired — player keeps bumping the gate NPC
  { text: 'Keys first. Home, north wall, east side.',  speaker: 'Dispatcher', style: 'bubble', weight: 3 },
  { text: 'No keys, no entry. Guild protocol.',        speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'Still here? Go get your keys, Gleaner.',   speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'I\'ve got all day. Have you?',             speaker: 'Dispatcher', style: 'bubble', weight: 1 }
], { cooldownMs: 8000 });

BarkLibrary.register('npc.dispatcher.gate.unlocked', [
  {
    text:    'Good. You\'re badged in. Dungeon\'s open. Don\'t take all day.',
    speaker: 'Dispatcher',
    style:   'dialog',
    weight:  1,
    oneShot: true
  }
], { cooldownMs: 0 });

// ── Dispatcher — general ambient (after gate encounter resolved) ─────
BarkLibrary.register('npc.dispatcher.ambient', [
  { text: 'Readiness target: sixty percent before hero day.',  speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'Any traps you don\'t re-arm come out of your pay.', speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'Guild wants a full crate audit by end of cycle.',  speaker: 'Dispatcher', style: 'bubble', weight: 1 },
  { text: 'Hero party confirmed for day three. Move it.',     speaker: 'Dispatcher', style: 'bubble', weight: 1 }
], { cooldownMs: 60000 });

// ── Floor 1.6: Player's Home ─────────────────────────────────────────
// The room itself is silent — these barks play when the player
// interacts with specific objects (bed, mailbox, stash).

BarkLibrary.register('home.morning.wakeup', [
  { text: '☀️ Morning. Another reset contract waiting.',       weight: 3, style: 'toast' },
  { text: '☀️ Day\'s already started. Let\'s get moving.',    weight: 2, style: 'toast' },
  { text: '☀️ Mail\'s arrived. Check before you head out.',   weight: 2, style: 'toast' },
  { text: '☀️ Still dark out, but the dungeon won\'t wait.',  weight: 1, style: 'toast' }
], { cooldownMs: 86400000 }); // Once per real-time day

BarkLibrary.register('home.morning.curfew_wakeup', [
  // After curfew collapse — same dawn wake but with a sting
  {
    text:    '☀️ You pushed too hard. Your legs gave out on the Promenade steps.',
    weight:  1,
    style:   'toast',
    oneShot: false
  },
  {
    text:    '☀️ Next time, go home before the bells.',
    weight:  1,
    style:   'toast'
  }
], { cooldownMs: 0 });

BarkLibrary.register('home.keys.pickup', [
  {
    text:    '🗝️ Work keys. The Dispatcher will want to see these.',
    weight:  1,
    style:   'toast',
    oneShot: true
  },
  {
    text:    '🗝️ Found the keys. Now back to the dungeon entrance.',
    weight:  1,
    style:   'toast',
    oneShot: false
  }
], { cooldownMs: 10000 });

BarkLibrary.register('home.departure', [
  // Shelved IntroWalk sequence bark — fires during HOME_DEPARTURE walk
  { text: '🌅 Another day on the clock...',                    weight: 3, style: 'toast' },
  { text: '🌅 Keys, bag, out the door.',                       weight: 2, style: 'toast' },
  { text: '🌅 Dungeon won\'t reset itself.',                   weight: 2, style: 'toast' }
], { cooldownMs: 3600000 }); // Once per in-game hour

// ── System events ────────────────────────────────────────────────────

BarkLibrary.register('system.new_day', [
  { text: '📅 New day. Check the Guild board for work orders.',  weight: 2, style: 'toast' },
  { text: '📅 Reset window open. Heroes in three days.',         weight: 2, style: 'toast' },
  { text: '📅 Dawn. The dungeon clock is ticking.',              weight: 1, style: 'toast' }
], { cooldownMs: 0 });

BarkLibrary.register('system.heroday_dawn', [
  {
    text:    '⚔️ Hero Day. The Adventurer\'s Guild dispatches at dawn.',
    weight:  1,
    style:   'toast',
    oneShot: false
  }
], { cooldownMs: 0 });

BarkLibrary.register('system.curfew_warning', [
  { text: '🔔 Two bells. Guild curfew in thirty minutes.',       weight: 3, style: 'toast' },
  { text: '🔔 Getting late. Consider heading home.',             weight: 2, style: 'toast' },
  { text: '🔔 Night shift\'s no joke. Know your limits.',        weight: 1, style: 'toast' }
], { cooldownMs: 0 });

BarkLibrary.register('system.curfew_collapse', [
  {
    text:    '💤 You passed out from exhaustion. Woke up at home.',
    weight:  1,
    style:   'toast',
    oneShot: false
  }
], { cooldownMs: 0 });

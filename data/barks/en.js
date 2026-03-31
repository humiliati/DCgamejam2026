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
  // NPC-to-NPC world-building — the player is eavesdropping on town life
  { text: '🗣️ "Did you see the state of floor 2 this morning? Heroes tore through again."', weight: 3 },
  { text: '🗣️ "Three hero parties this season. Commerce is up, but so is the damage."', weight: 3 },
  { text: '🗣️ "Guild posted another reset contract. Bigger than the last one."', weight: 2 },
  { text: '🗣️ "The inn\u2019s got a new stew. Seaweed base. Can\u2019t decide if it\u2019s brave or sad."', weight: 2, style: 'bubble' },
  { text: '🗣️ "My cousin works the night shift. Says the lower caves make sounds."', weight: 2 },
  { text: '🗣️ "Scale fragments are up to 40 coin. Used to be 12. Something\u2019s changed down there."', weight: 1 },
  { text: '🗣️ "The old fisherman on Pier Nine swears he saw a light in the deep caves last night."', weight: 1 },
  { text: '🗣️ "Storm coming in from the east. Good night to stay inside."', weight: 0.5 }
], { cooldownMs: 30000 });

// ── Floor 1: The Promenade — morning (Day 1 pre-work nudge) ─────────
// These barks fire specifically during the morning arrival sequence on
// Day 1, before the player retrieves their work keys. Slightly more
// pointed — the town notices the player hasn't gone to work yet.

BarkLibrary.register('ambient.promenade.morning', [
  { text: '🗣️ "Saw the new Gleaner heading out. Think they\u2019ll last the season?"', weight: 3 },
  { text: '🗣️ "Adventurers are due in three days. The boardwalk\u2019s not ready."', weight: 3 },
  { text: '🗣️ "My nephew works the Coral Cellars. Says the last reset was botched."', weight: 2, style: 'bubble' },
  { text: '🗣️ "Dawn shift already started. Seen anyone from the Guild yet?"', weight: 2 },
  { text: '🗣️ "Smells like the deep caves again. Wind must be coming from below."', weight: 1 }
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

// ── Faction bark pools ──────────────────────────────────────────────
// NPC-to-NPC chatter between faction members. The player overhears
// these as ambient world-building — faction identity, politics,
// inter-faction tension, and conspiracy breadcrumbs.

BarkLibrary.register('faction.tide', [
  { text: '🗣️ "The Compact archives need re-cataloguing. Third time this year."', weight: 3 },
  { text: '🗣️ "Council meeting ran late. Something about the deep-floor readings."', weight: 3 },
  { text: '🗣️ "The Foundry\u2019s new kiln runs on the same fuel the deep caves produce naturally."', weight: 2 },
  { text: '🗣️ "Have you read the annotated Compact? The footnotes are... revealing."', weight: 2 },
  { text: '🗣️ "Scholar Meridian says the old records don\u2019t match the official history."', weight: 1 },
  { text: '🗣️ "The dragons used to sing, you know. Before the heroes came."', weight: 0.5, oneShot: true }
], { cooldownMs: 28000 });

BarkLibrary.register('faction.foundry', [
  { text: '🗣️ "New shipment of dragonsteel coming in. Quality\u2019s better than last batch."', weight: 3 },
  { text: '🗣️ "Foundry\u2019s hiring again. Third time this season. Wonder what happened to the last batch."', weight: 3 },
  { text: '🗣️ "The sponsorship numbers are up. Heroes love the new equipment line."', weight: 2 },
  { text: '🗣️ "Tide Council says the deep caves are \u2018protected.\u2019 Foundry says they\u2019re \u2018unexploited.\u2019 Same caves."', weight: 2 },
  { text: '🗣️ "Someone asked about the procurement reports. I said \u2018ask the field rep.\u2019"', weight: 1 },
  { text: '🗣️ "The yield numbers don\u2019t add up. More goes in than comes out."', weight: 0.5 }
], { cooldownMs: 28000 });

BarkLibrary.register('faction.admiralty', [
  { text: '🗣️ "Patrol report: nothing unusual on the upper floors. The lower floors... different story."', weight: 3 },
  { text: '🗣️ "The garrison commander wants a full sweep before hero day."', weight: 3 },
  { text: '🗣️ "New classification came through. More specimens added to the restricted list."', weight: 2 },
  { text: '🗣️ "The Oversight Board denied the reclassification proposal. Again."', weight: 2 },
  { text: '🗣️ "Dr. Yuen\u2019s research notes went missing from the archive last week."', weight: 1 },
  { text: '🗣️ "Someone\u2019s maintaining a live holding area below the standard floor map."', weight: 0.5, oneShot: true }
], { cooldownMs: 28000 });

// ── Dragon whisper barks ─────────────────────────────────────────────
// Rare conspiracy breadcrumbs. One-shot per floor visit. These are
// the atmospheric hints that something is wrong beneath the surface.

BarkLibrary.register('dragon.whisper', [
  { text: '🗣️ "My grandmother says the caves used to sing at night. Before the heroes came."', weight: 1, oneShot: true },
  { text: '🗣️ "The old compact... nobody reads it anymore. Maybe that\u2019s the point."', weight: 1, oneShot: true },
  { text: '🗣️ "Forty years of hero cycles. Forty years. And the deep caves keep getting quieter."', weight: 1, oneShot: true },
  { text: '🗣️ "The harbour master saw something on his night shift. Won\u2019t talk about it."', weight: 1, oneShot: true }
], { cooldownMs: 120000 });

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

// ── Building interiors ────────────────────────────────────────────
//
// Each building has a bark pool keyed to its floor. These fire from
// ambient NpcSystem patrons when the player is within barkRadius tiles.

BarkLibrary.register('interior.bazaar', [
  { text: '🗣️ "They say the Cellars below took three parties last month."', weight: 3 },
  { text: '🗣️ "Best haul this week. Prices are climbing on everything."', weight: 3 },
  { text: '🗣️ "The Tide vendor got a new shipment. Won\u2019t say where from."', weight: 2 },
  { text: '🗣️ "Something smells off near the stairs. Has anyone been down there lately?"', weight: 2 },
  { text: '🗣️ "Hero party this cycle is paying extra for intact crates. Commerce is good."', weight: 1 },
  { text: '🗣️ "The card dealer on Lantern Row says the decks are getting stranger. New suits."', weight: 1, style: 'bubble' },
  { text: '🗣️ "Someone bought every scale fragment in stock yesterday. Every single one."', weight: 0.5 }
], { cooldownMs: 40000 });

BarkLibrary.register('interior.guild', [
  { text: '🗣️ "Work order board\'s updated — Coral Cellars is priority."',           weight: 3 },
  { text: '🗣️ "Forty percent readiness? Heroes won\'t even bother."',                weight: 3 },
  { text: '🗣️ "The Taskmaster wants a full crate audit before hero day."',           weight: 2 },
  { text: '🗣️ "New recruit asked if heroes ever say thank you. We all laughed."',    weight: 2 },
  { text: '🗣️ "Log your hours in the terminal before you leave."',                   weight: 1 },
  { text: '🗣️ "Floor 1.6 contracts pay better than surface work. Just saying."',    weight: 1, style: 'bubble' },
  { text: '🗣️ "The Seeker cleared an entire floor in six minutes. Unreal."',         weight: 0.5 }
], { cooldownMs: 45000 });

BarkLibrary.register('interior.inn', [
  { text: '🗣️ "Room three is still taken. Heroes booked it a week out."',            weight: 3 },
  { text: '🗣️ "If you need a proper rest, the beds upstairs are half-price today."', weight: 2 },
  { text: '🗣️ "Heard someone crying in the dungeon last night. Wind, probably."',    weight: 2 },
  { text: '🗣️ "The Gleaner who took the deep contracts didn\'t come back."',         weight: 1 },
  { text: '🗣️ "Try the stew. It\'s got medicinal properties. Allegedly."',           weight: 1, style: 'bubble' }
], { cooldownMs: 50000 });

// ── Home object interactions ───────────────────────────────────────

BarkLibrary.register('home.mailbox', [
  { text: '📬 No new mail. Check back after the hero run.',       weight: 2, style: 'toast' },
  { text: '📬 A letter from the Guild. Inside are work orders.',  weight: 2, style: 'toast' },
  { text: '📬 Payout report from last cycle. Better than expected.', weight: 1, style: 'toast' },
  { text: '📬 Anonymous note: "The dragons remember who helped."',weight: 0.5, style: 'toast', oneShot: true }
], { cooldownMs: 5000 });

BarkLibrary.register('home.bed', [
  { text: '🛏️ Sleep until dawn? [OK] Rest  [Esc] Cancel',         weight: 1, style: 'dialog', oneShot: false },
], { cooldownMs: 0 });

// ── Cozy interior interactions ─────────────────────────────────────
// Fired when player reads a bookshelf or taps a bar counter inside
// depth-2 building interiors. These supplement the ambient NPC barks
// with object-specific flavour.

BarkLibrary.register('interior.bookshelf.guild', [
  { text: '📖 You pull a manual off the shelf. Might be useful.',           weight: 3, style: 'toast' },
  { text: '📖 Field manuals, mostly. Dog-eared pages on trap mechanics.',   weight: 2, style: 'toast' },
  { text: '📖 Someone underlined every mention of "readiness."',            weight: 1, style: 'toast' },
  { text: '📖 A sticky note reads: "ASK ABOUT THE COMPACT."',              weight: 0.5, style: 'toast', oneShot: true }
], { cooldownMs: 8000 });

BarkLibrary.register('interior.bookshelf.inn', [
  { text: '📜 Old journals and traveller\'s diaries. Smells like pipe tobacco.', weight: 3, style: 'toast' },
  { text: '📜 A history book — "The Dragon Compact, Vol. 7."',                  weight: 2, style: 'toast' },
  { text: '📜 Someone left a bookmark on a chapter about the Nesting Caves.',   weight: 1, style: 'toast' },
  { text: '📜 A torn page reads: "...the heroes do not know what sleeps below."', weight: 0.5, style: 'toast', oneShot: true }
], { cooldownMs: 8000 });

BarkLibrary.register('interior.bookshelf.bazaar', [
  { text: '📦 Vendor catalogs and price sheets. Mostly out of date.',       weight: 3, style: 'toast' },
  { text: '📋 A supply manifest. Someone circled "dragon-scale polish."',  weight: 2, style: 'toast' },
  { text: '📋 Import records from three cycles ago. Nothing unusual.',     weight: 1, style: 'toast' }
], { cooldownMs: 10000 });

BarkLibrary.register('interior.bookshelf.home', [
  { text: '📘 Your own copy of the Gleaner\'s Manual. Well-worn.',          weight: 3, style: 'toast' },
  { text: '✉️ Old letters from the agency. Mundane assignment details.',   weight: 2, style: 'toast' },
  { text: '📓 A personal journal. You don\'t remember writing this entry.', weight: 0.5, style: 'toast', oneShot: true }
], { cooldownMs: 5000 });

BarkLibrary.register('interior.bar.inn', [
  { text: '🍺 The ale is cold and tastes faintly of seaweed. Not bad.',     weight: 3, style: 'toast' },
  { text: '☕ Strong coffee. The innkeeper nods approvingly.',               weight: 2, style: 'toast' },
  { text: '🧃 Coral tonic — slightly fizzy, vaguely medicinal.',            weight: 2, style: 'toast' },
  { text: '🍺 "On the house," the barkeep says. "You look like you need it."', weight: 1, style: 'toast' }
], { cooldownMs: 5000 });

BarkLibrary.register('interior.bar.guild', [
  { text: '☕ Guild-issue black coffee. It tastes like obligation.',         weight: 3, style: 'toast' },
  { text: '🥤 The stim drink buzzes behind your teeth.',                    weight: 2, style: 'toast' },
  { text: '☕ "Careful with those," a guildmate warns. "Third one\'s a headache."', weight: 1, style: 'toast' }
], { cooldownMs: 5000 });

BarkLibrary.register('interior.bar.bazaar', [
  { text: '🍵 Spice tea. Warm and surprisingly calming.',                   weight: 3, style: 'toast' },
  { text: '🧃 Fresh-pressed coral juice. Tastes like the ocean.',           weight: 2, style: 'toast' },
  { text: '🫖 The vendor insists on a second cup. "For luck," she says.',  weight: 1, style: 'toast' }
], { cooldownMs: 5000 });


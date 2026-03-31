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

// ── Floor 2: Lantern Row — commercial district ambient ──────────────
// Busy commercial street. More shops, the Guild office, the Watchman's
// Post. Mixed faction presence, busier than the Promenade.

BarkLibrary.register('ambient.lanternrow', [
  { text: '🗣️ "Lantern Row prices are up again. Third time this cycle."',               weight: 3 },
  { text: '🗣️ "The Dispatcher\'s office is straight ahead. Don\'t keep him waiting."',   weight: 3 },
  { text: '🗣️ "More Gleaners than usual this season. Competition\'s getting fierce."',  weight: 2 },
  { text: '🗣️ "The Watchman looks rattled. Won\'t say what he saw on the lower floors."', weight: 2 },
  { text: '🗣️ "Armory\'s got a fresh shipment of trap kits. If you can afford them."',   weight: 2 },
  { text: '🗣️ "Two Gleaners went in together last cycle. Only one came out."',          weight: 1 },
  { text: '🗣️ "The Guild\'s been posting bigger contracts. Makes you wonder what they know."', weight: 1 },
  { text: '🗣️ "I heard the Hero this cycle is different. Quiet. Methodical."',          weight: 0.5, oneShot: true }
], { cooldownMs: 30000 });

// ── Floor 2.1: Dispatcher's Office — guild interior ─────────────────
// The nerve center. Gleaners check in, pick up contracts, file reports.
// Friendly guild NPCs mill about. The Dispatcher holds court.

BarkLibrary.register('interior.dispatch', [
  { text: '🗣️ "Check the board. New contracts went up at dawn."',                       weight: 3 },
  { text: '🗣️ "Readiness reports are due. Don\'t forget to file."',                    weight: 3 },
  { text: '🗣️ "The Soft Cellar job pays well, but watch the northeast corner."',       weight: 2 },
  { text: '🗣️ "Anyone know why the Hero\'s Wake contracts got pulled yesterday?"',      weight: 2 },
  { text: '🗣️ "The veteran Gleaners always check their bag before heading down."',      weight: 2 },
  { text: '🗣️ "Filing a double-shift. Could use backup if anyone\'s free."',            weight: 1 },
  { text: '🗣️ "Night shift bonus is 40%. Almost worth the risk."',                     weight: 1, style: 'bubble' },
  { text: '🗣️ "Interesting. The deep floor readings changed again overnight."',         weight: 0.5, oneShot: true }
], { cooldownMs: 35000 });

BarkLibrary.register('interior.dispatch.faction', [
  // Faction-flavoured chatter overheard in the office
  { text: '🗣️ "The Tide delegate wants to restrict access to sub-floor 3. Admiralty disagrees."', weight: 2 },
  { text: '🗣️ "Foundry reps were in here yesterday. Asking about procurement routes."', weight: 2 },
  { text: '🗣️ "The Admiralty posted a watch on the Hero\'s Wake stairwell. Unusual."', weight: 1 },
  { text: '🗣️ "Someone from the Tide Council left a sealed envelope on the Dispatcher\'s desk."', weight: 0.5, oneShot: true }
], { cooldownMs: 60000 });

// ── Floor 2.2: Watchman's Post — staging area for dungeon entry ─────
// Tense atmosphere. The Watchman is shaken. This is the last stop
// before the Hero's Wake dungeon levels.

BarkLibrary.register('interior.watchpost', [
  { text: '🗣️ "Quiet down here. Too quiet."',                                          weight: 3 },
  { text: '🗣️ "The Watchman hasn\'t slept since the last hero party came through."',    weight: 3 },
  { text: '🗣️ "If you\'re heading to the Wake, bring extra bandages."',                 weight: 2 },
  { text: '🗣️ "I count the footsteps going down. I count fewer coming back up."',      weight: 2 },
  { text: '🗣️ "Something scraped against the wall last night. From the other side."',   weight: 1, style: 'bubble' },
  { text: '🗣️ "The Hero left... things. On the walls. I\'m not cleaning that up."',     weight: 1 },
  { text: '🗣️ "The Watchman keeps a tally. He won\'t show anyone what it says."',       weight: 0.5 }
], { cooldownMs: 40000 });

// ── Dungeon floors: deep ambient barks ──────────────────────────────
// These fire on depth 3+ floors. Since bark radius is huge in dungeons,
// they serve as atmospheric echoes. No speaker — these are disembodied.

BarkLibrary.register('dungeon.ambient', [
  { text: '... dripping echoes from deeper below.',                                     weight: 3, style: 'bubble' },
  { text: '... the air smells like stone dust and something older.',                     weight: 3, style: 'bubble' },
  { text: '... a faint vibration in the floor. Rhythmic, like breathing.',               weight: 2, style: 'bubble' },
  { text: '... scorch marks on the walls. The Hero was here.',                           weight: 2, style: 'bubble' },
  { text: '... an overturned supply crate. Someone left in a hurry.',                    weight: 2, style: 'bubble' },
  { text: '... claw marks in the stone. Deep grooves. Old ones.',                        weight: 1, style: 'bubble' },
  { text: '... a warm current of air from below. It shouldn\'t be warm.',                weight: 1, style: 'bubble' },
  { text: '... you hear something. Then nothing. Then something again.',                 weight: 0.5 }
], { cooldownMs: 45000 });

BarkLibrary.register('dungeon.heroswake', [
  // Specific to Floor 2.2.1 / 2.2.2 — the Hero's wake
  { text: '... fresh blood on the floor. Still warm.',                                   weight: 3, style: 'bubble' },
  { text: '... the Hero\'s bootprints lead deeper. Confident. Relentless.',              weight: 3, style: 'bubble' },
  { text: '... a shattered shield. It belonged to something large.',                     weight: 2, style: 'bubble' },
  { text: '... the corpses here are arranged. Not random. Deliberate.',                  weight: 2, style: 'bubble' },
  { text: '... a scale fragment, still faintly luminescent. Beautiful.',                 weight: 1, style: 'bubble' },
  { text: '... the walls are warm to the touch. Like something lived inside them.',      weight: 1, style: 'bubble' },
  { text: '... a single claw, broken at the base. It\'s the size of your forearm.',     weight: 0.5, oneShot: true }
], { cooldownMs: 60000 });

// ── Friendly guild NPC barks for Dispatcher's Office ────────────────

BarkLibrary.register('npc.guild_veteran.ambient', [
  { text: 'The Soft Cellar is good practice. Don\'t rush the northeast traps.',          speaker: 'Ren (Veteran)', style: 'bubble', weight: 3 },
  { text: 'Always clean inward, arm outward. Saves you backtracking.',                   speaker: 'Ren (Veteran)', style: 'bubble', weight: 3 },
  { text: 'If readiness drops below fifty, the payout isn\'t worth the trip.',           speaker: 'Ren (Veteran)', style: 'bubble', weight: 2 },
  { text: 'The old Gleaners used to map the cobweb patterns. Said it was strategic.',    speaker: 'Ren (Veteran)', style: 'bubble', weight: 1 },
  { text: 'I\'ve been cleaning dungeons for twelve years. Still finding new things.',    speaker: 'Ren (Veteran)', style: 'bubble', weight: 0.5 }
], { cooldownMs: 25000 });

BarkLibrary.register('npc.guild_clerk.ambient', [
  { text: 'Contracts are sorted by priority. Red means overdue.',                         speaker: 'Sable (Clerk)', style: 'bubble', weight: 3 },
  { text: 'File your readiness report before leaving. Dispatcher gets grumpy otherwise.', speaker: 'Sable (Clerk)', style: 'bubble', weight: 3 },
  { text: 'The supply closet has rags and trap kits. Help yourself.',                    speaker: 'Sable (Clerk)', style: 'bubble', weight: 2 },
  { text: 'We got three new Gleaners this cycle. Only one has checked in so far.',       speaker: 'Sable (Clerk)', style: 'bubble', weight: 1 },
  { text: 'The Dispatcher\'s been in a mood since the last Hero briefing. Watch out.',   speaker: 'Sable (Clerk)', style: 'bubble', weight: 1 }
], { cooldownMs: 30000 });

// ── House resident barks (defensive / "get out" reactions) ──────────
// Interior NPCs in private homes and rooms. They don't want you there.
// Starts annoyed, escalates to angry on repeated interaction.

BarkLibrary.register('npc.resident.annoyed', [
  { text: 'Can I help you? This is a private residence.',                                speaker: 'Resident', style: 'bubble', weight: 3 },
  { text: 'You\'re in the wrong building, Gleaner. Door\'s behind you.',                 speaker: 'Resident', style: 'bubble', weight: 3 },
  { text: 'The dungeon\'s that way. This is my home.',                                   speaker: 'Resident', style: 'bubble', weight: 2 },
  { text: 'I didn\'t order any cleaning. Out.',                                          speaker: 'Resident', style: 'bubble', weight: 2 },
  { text: 'Do I look like a quest giver to you? Go away.',                               speaker: 'Resident', style: 'bubble', weight: 1 }
], { cooldownMs: 15000 });

BarkLibrary.register('npc.resident.angry', [
  { text: 'I said get out! What part of "private" confuses you?',                        speaker: 'Resident', style: 'bubble', weight: 3 },
  { text: 'Still here?! I\'ll call the Admiralty if you don\'t leave.',                  speaker: 'Resident', style: 'bubble', weight: 2 },
  { text: 'OUT. Now. Before I lose my patience entirely.',                                speaker: 'Resident', style: 'bubble', weight: 2 },
  { text: 'Heroes barge in, Gleaners barge in — does nobody knock anymore?!',            speaker: 'Resident', style: 'bubble', weight: 1 }
], { cooldownMs: 10000 });

BarkLibrary.register('npc.innkeeper.ambient', [
  { text: 'Room rates are posted by the door. No haggling.',                              speaker: 'Innkeeper', style: 'bubble', weight: 3 },
  { text: 'Kitchen closes at sundown. Order now or go hungry.',                           speaker: 'Innkeeper', style: 'bubble', weight: 2 },
  { text: 'The stew is medicinal. Allegedly.',                                            speaker: 'Innkeeper', style: 'bubble', weight: 2 },
  { text: 'Heroes get the upstairs rooms. Gleaners get the cot in the corner.',          speaker: 'Innkeeper', style: 'bubble', weight: 1 }
], { cooldownMs: 28000 });

BarkLibrary.register('npc.guild_rookie.ambient', [
  { text: 'Is it always this busy before hero day?',                                     speaker: 'Pip (Rookie)', style: 'bubble', weight: 3 },
  { text: 'I heard the deep floors have monsters. Real ones. Not just rats.',            speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 },
  { text: 'Do you think the Hero will remember us? The cleanup crew?',                   speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 },
  { text: 'My first week. The mop handle already has blisters on it.',                   speaker: 'Pip (Rookie)', style: 'bubble', weight: 1, style: 'bubble' },
  { text: 'The old-timers say the dungeons used to be... different. Before.',            speaker: 'Pip (Rookie)', style: 'bubble', weight: 0.5 }
], { cooldownMs: 28000 });

// ═══════════════════════════════════════════════════════════════════════
//  DAY/NIGHT CYCLE — NIGHT-TIME EXTERIOR BARKS
// ═══════════════════════════════════════════════════════════════════════
// Sparse — only a few NPCs roam at night on exterior floors.
// Atmosphere: quiet, eerie, the town sleeps but something stirs below.

BarkLibrary.register('ambient.promenade.night', [
  { text: '🗣️ "Nobody out at this hour but Gleaners and rats."',                        weight: 3 },
  { text: '🗣️ "The lanterns are dimmer tonight. Oil shortage, they say."',              weight: 3 },
  { text: '🗣️ "Heard something under the boardwalk. Probably nothing."',                weight: 2 },
  { text: '🗣️ "Night shift bonus isn\'t worth the nightmares."',                        weight: 2, style: 'bubble' },
  { text: '🗣️ "The caves hum at night. If you listen. Don\'t listen."',                 weight: 1 },
  { text: '🗣️ "Stars are bright tonight. Even the ocean\'s quiet."',                    weight: 0.5 }
], { cooldownMs: 45000 });

BarkLibrary.register('ambient.lanternrow.night', [
  { text: '🗣️ "Shops are shuttered. Nothing open but the Watch desk."',                 weight: 3 },
  { text: '🗣️ "Keep your voice down. The Admiralty patrols at midnight."',              weight: 2 },
  { text: '🗣️ "The Dispatcher left hours ago. You\'re on your own tonight."',           weight: 2 },
  { text: '🗣️ "Funny how the town feels bigger when it\'s empty."',                    weight: 1, style: 'bubble' }
], { cooldownMs: 50000 });

// ═══════════════════════════════════════════════════════════════════════
//  NIGHT-LOCKED BUILDINGS — MUFFLED BARKS FROM INSIDE
// ═══════════════════════════════════════════════════════════════════════
// When the player faces a night-locked door, the LockedDoorPeek fires
// and these muffled barks play through the StatusBar. Indistinct voices,
// scraping chairs, laughter. Conveys life behind closed doors.

BarkLibrary.register('muffled.house', [
  { text: '... muffled laughter from behind the door.',                                  weight: 3, style: 'bubble' },
  { text: '... a chair scrapes across wood floors inside.',                              weight: 3, style: 'bubble' },
  { text: '... the clink of dishes. Someone\'s eating late.',                            weight: 2, style: 'bubble' },
  { text: '... a voice, low and tired: "...not until morning."',                         weight: 2, style: 'bubble' },
  { text: '... soft snoring. Someone turned in early.',                                  weight: 1, style: 'bubble' },
  { text: '... a child\'s voice: "Is the Gleaner outside again?"',                      weight: 0.5 }
], { cooldownMs: 12000 });

BarkLibrary.register('muffled.inn', [
  { text: '... the clatter of mugs. Late drinkers at the bar.',                          weight: 3, style: 'bubble' },
  { text: '... a bard strumming something off-key.',                                     weight: 2, style: 'bubble' },
  { text: '... "Last call! Kitchen\'s closed!" The innkeeper, muffled.',                 weight: 2, style: 'bubble' },
  { text: '... someone telling a hero story. The crowd laughs.',                         weight: 2, style: 'bubble' },
  { text: '... a glass breaks. Brief silence. Then louder talking.',                     weight: 1, style: 'bubble' }
], { cooldownMs: 15000 });

BarkLibrary.register('muffled.guild', [
  { text: '... papers shuffling. The night clerk is still at it.',                       weight: 3, style: 'bubble' },
  { text: '... a typewriter clacking behind the door.',                                  weight: 2, style: 'bubble' },
  { text: '... "...readiness targets won\'t file themselves." Faintly.',                 weight: 2, style: 'bubble' },
  { text: '... the hum of a desk lamp. Someone working late.',                           weight: 1, style: 'bubble' }
], { cooldownMs: 18000 });

BarkLibrary.register('muffled.bazaar', [
  { text: '... the rattle of a locked shutter. Wind, probably.',                         weight: 3, style: 'bubble' },
  { text: '... counting coins. Someone doing inventory after hours.',                    weight: 2, style: 'bubble' },
  { text: '... a cat yowls inside. Then silence.',                                       weight: 1, style: 'bubble' }
], { cooldownMs: 20000 });

// ═══════════════════════════════════════════════════════════════════════
//  HERO DAY — VILLAGER ECONOMY BARKS (wink wink)
// ═══════════════════════════════════════════════════════════════════════
// The villagers depend on the hero tourism economy. They say the quiet
// part out loud — heroes are good for business, even if they trash the
// place. The player is the janitorial backbone of a tourist trap.
// NOT unironically obtuse. The NPCs KNOW the system is absurd.

BarkLibrary.register('ambient.promenade.heroday', [
  { text: '🗣️ "They\'re coming today. Saw the Guild banner go up at dawn."',              weight: 3 },
  { text: '🗣️ "Hope the Gleaner finished the reset in time..."',                          weight: 3 },
  { text: '🗣️ "Three heroes registered. Betting the Rogue doesn\'t make it back."',       weight: 2 },
  { text: '🗣️ "Shop\'s closing early. Don\'t want adventurers tracking blood in."',       weight: 2, style: 'bubble' },
  { text: '🗣️ "I heard one of them is a Dragon Slayer."',                                 weight: 1 },
  { text: '🗣️ "Imagine being a hero. All glory, no cleanup duty."',                       weight: 0.5 },
  { text: '🗣️ "Tourism board says hero visits are up 30%% this quarter. Progress!"',      weight: 3 },
  { text: '🗣️ "The souvenir stall made bank last Hero Day. Everyone wants a scale replica."', weight: 2 },
  { text: '🗣️ "Heroes smash, heroes loot, heroes leave. We fix, we restock, they come back. Circle of commerce."', weight: 2 },
  { text: '🗣️ "My landlord raised rent because \'hero-adjacent property values.\' Unbelievable."', weight: 1 },
  { text: '🗣️ "Cleaned the same corridor four times this cycle. Job security, I guess."', weight: 1, style: 'bubble' },
  { text: '🗣️ "Without heroes, who\'d need Gleaners? Without Gleaners, heroes\'d never come back. It\'s beautiful, really."', weight: 0.5 }
], { cooldownMs: 25000 });

BarkLibrary.register('ambient.lanternrow.heroday', [
  { text: '🗣️ "Hero Day! Lock up anything fragile."',                                     weight: 3 },
  { text: '🗣️ "The armoury\'s offering a Hero Day discount. Smart marketing."',            weight: 3 },
  { text: '🗣️ "Last Hero Day, the Crusader tipped the barkeep. First time in twelve years."', weight: 2 },
  { text: '🗣️ "The Dispatcher gets a bonus every Hero Day. Must be nice."',                weight: 2 },
  { text: '🗣️ "Somebody spray-painted \'HEROES WELCOME\' on the dungeon entrance. Very on-brand."', weight: 1, style: 'bubble' },
  { text: '🗣️ "You know what they don\'t tell you about Hero Day? The smell afterward."', weight: 1 },
  { text: '🗣️ "Every Hero Day is a stimulus package. For the cleanup industry."',          weight: 0.5 }
], { cooldownMs: 28000 });

// Hero Day guild barks — the professionals are excited/stressed
BarkLibrary.register('interior.dispatch.heroday', [
  { text: '🗣️ "All hands on deck. Hero arriving within the hour."',                       weight: 3 },
  { text: '🗣️ "Readiness report: filed. Contracts: posted. Coffee: essential."',          weight: 3 },
  { text: '🗣️ "The Hero doesn\'t care about our prep work, but the Guild does."',         weight: 2 },
  { text: '🗣️ "Double-time pay today. Make it count."',                                   weight: 2 },
  { text: '🗣️ "Best Hero Day tip: don\'t be in the dungeon when they arrive."',           weight: 1, style: 'bubble' }
], { cooldownMs: 30000 });

// Guild NPCs get heroday-specific lines too
BarkLibrary.register('npc.guild_veteran.heroday', [
  { text: 'Hero Day. Stay sharp down there.',                                             speaker: 'Ren (Veteran)', style: 'bubble', weight: 3 },
  { text: 'I\'ve survived thirty Hero Days. Trick is: be somewhere else.',                speaker: 'Ren (Veteran)', style: 'bubble', weight: 2 },
  { text: 'The Seeker doesn\'t knock. Remember that.',                                    speaker: 'Ren (Veteran)', style: 'bubble', weight: 2 },
  { text: 'After the hero passes, the real work starts.',                                 speaker: 'Ren (Veteran)', style: 'bubble', weight: 1 }
], { cooldownMs: 22000 });

BarkLibrary.register('npc.guild_clerk.heroday', [
  { text: 'Hero Day paperwork is triple the usual stack.',                                speaker: 'Sable (Clerk)', style: 'bubble', weight: 3 },
  { text: 'Filing damage estimates already. They haven\'t even arrived yet.',             speaker: 'Sable (Clerk)', style: 'bubble', weight: 2 },
  { text: 'The insurance claims after Hero Day keep me employed for a week.',             speaker: 'Sable (Clerk)', style: 'bubble', weight: 1 }
], { cooldownMs: 25000 });

BarkLibrary.register('npc.guild_rookie.heroday', [
  { text: 'Is it true the Hero can one-shot a Vault Warden?!',                           speaker: 'Pip (Rookie)', style: 'bubble', weight: 3 },
  { text: 'My first Hero Day! This is so exciting!',                                     speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 },
  { text: 'Do you think the Hero will sign my mop handle?',                              speaker: 'Pip (Rookie)', style: 'bubble', weight: 2, style: 'bubble' },
  { text: 'Everyone\'s so tense. Is Hero Day always like this?',                         speaker: 'Pip (Rookie)', style: 'bubble', weight: 1 }
], { cooldownMs: 22000 });

// ═══════════════════════════════════════════════════════════════════════
//  HERO DAY — POST-CARNAGE DUNGEON BARKS
// ═══════════════════════════════════════════════════════════════════════
// When the player enters a dungeon floor after the hero has passed
// through (carnage manifest applied), these atmospheric barks fire
// alongside the carnage narration Toasts.

BarkLibrary.register('dungeon.postcarnage', [
  { text: '... the air is thick with dust. Something tore through here recently.',       weight: 3, style: 'bubble' },
  { text: '... bootprints everywhere. Heavy, confident strides.',                        weight: 3, style: 'bubble' },
  { text: '... a crate, split clean in half. Hero strength.',                            weight: 2, style: 'bubble' },
  { text: '... an empty chest. Lid hanging open. Not even locked.',                      weight: 2, style: 'bubble' },
  { text: '... a scorch mark where a trap used to be. Triggered and walked through.',    weight: 2, style: 'bubble' },
  { text: '... the remains of something that used to guard this corridor.',              weight: 1, style: 'bubble' },
  { text: '... you can still smell the ozone. Whatever happened here, it was fast.',     weight: 1, style: 'bubble' },
  { text: '... this is your job. Clean up. Restock. Pretend it never happened.',         weight: 0.5 }
], { cooldownMs: 30000 });

// ═══════════════════════════════════════════════════════════════════════
//  DAWN / MORNING TIME BARKS
// ═══════════════════════════════════════════════════════════════════════
// Fresh day, NPCs are optimistic (or at least caffeinated).

BarkLibrary.register('ambient.approach.morning', [
  { text: '🗣️ "Morning dew on the cobblestones. Watch your step."',                     weight: 3 },
  { text: '🗣️ "First shift. Coffee hasn\'t kicked in yet."',                             weight: 2 },
  { text: '🗣️ "The Guild board just updated. New contracts."',                           weight: 2 }
], { cooldownMs: 25000 });

// ═══════════════════════════════════════════════════════════════════════
//  DUSK BARKS (augment existing system.curfew_warning)
// ═══════════════════════════════════════════════════════════════════════

BarkLibrary.register('ambient.approach.dusk', [
  { text: '🗣️ "Heading home. You should too."',                                         weight: 3 },
  { text: '🗣️ "Sun\'s almost down. Don\'t stay out past curfew."',                      weight: 2 }
], { cooldownMs: 60000 });

BarkLibrary.register('ambient.lanternrow.dusk', [
  { text: '🗣️ "Shutters going up. Lantern Row goes dark at sundown."',                  weight: 3 },
  { text: '🗣️ "The Watch doubles patrols at dusk. Stay visible."',                      weight: 2 },
  { text: '🗣️ "Last customer of the day and it\'s a Gleaner. Typical."',                weight: 1, style: 'bubble' }
], { cooldownMs: 50000 });

// ═══════════════════════════════════════════════════════════════════════
//  CLASS-FACING BARKS — BACKHANDED COMPLIMENTS
// ═══════════════════════════════════════════════════════════════════════
// NPCs know the player's callsign and class. They reference both.
// The tone is military backhanded — like calling an overly zealous
// soldier "hero." It's affectionate and dismissive simultaneously.
//
// {callsign} → Player's operative codename (ROOK, GHOST, etc.)
// {class}    → Player's operative class (Blade, Ranger, Shadow, etc.)

// General callsign/class barks — mixed into existing ambient pools
// These fire from any ambient NPC on exterior floors.

BarkLibrary.register('ambient.callsign', [
  // Callsign recognition — the town knows your name
  { text: '🗣️ "There goes {callsign}. Clock\'s ticking, hero."',                       weight: 3 },
  { text: '🗣️ "Morning, {callsign}. Try not to break anything the Hero hasn\'t."',     weight: 3 },
  { text: '🗣️ "{callsign}\'s on shift today. Feeling safer already."',                  weight: 2, style: 'bubble' },
  { text: '🗣️ "Hey, {callsign}! You left your mop on floor two. Real professional."',  weight: 2 },
  { text: '🗣️ "The other Gleaners call you {callsign}. Very dramatic for janitor work."', weight: 1 },
  { text: '🗣️ "{callsign} the {class}. Sounds like a character from one of those hero ballads."', weight: 0.5 }
], { cooldownMs: 60000 });

// Class-specific backhanded barks — the "hero" treatment
BarkLibrary.register('ambient.class.blade', [
  { text: '🗣️ "A {class} on cleaning duty. What, the arena wasn\'t hiring?"',           weight: 3 },
  { text: '🗣️ "Nice sword arm, {callsign}. Shame it\'s holding a mop."',                weight: 2 },
  { text: '🗣️ "The {class} acts like they\'re storming a fortress. It\'s a supply closet."', weight: 2, style: 'bubble' },
  { text: '🗣️ "{callsign} the {class}. Every dungeon needs its own tiny hero."',        weight: 1 }
], { cooldownMs: 90000 });

BarkLibrary.register('ambient.class.ranger', [
  { text: '🗣️ "A {class} doing reset work? Bit overqualified for scrubbing, no?"',     weight: 3 },
  { text: '🗣️ "{callsign} can hit a target at fifty paces. But can they restock a shelf? Jury\'s out."', weight: 2 },
  { text: '🗣️ "The {class} keeps looking at the exits. Relax, hero. It\'s just crates."', weight: 2, style: 'bubble' },
  { text: '🗣️ "Sharp eyes, {callsign}. Almost like a real adventurer."',                weight: 1 }
], { cooldownMs: 90000 });

BarkLibrary.register('ambient.class.shadow', [
  { text: '🗣️ "The {class} is here. Didn\'t even see you come in. Typical."',           weight: 3 },
  { text: '🗣️ "Sneaking around like a real professional, {callsign}? The broom gives you away."', weight: 2 },
  { text: '🗣️ "{callsign} the {class}. Stealthiest janitor in the business."',          weight: 2, style: 'bubble' },
  { text: '🗣️ "You know, heroes sneak INTO danger. {class}s sneak around it. Smart, honestly."', weight: 1 }
], { cooldownMs: 90000 });

BarkLibrary.register('ambient.class.sentinel', [
  { text: '🗣️ "The {class} can take a beating. Good — the dungeon gives them daily."', weight: 3 },
  { text: '🗣️ "Reliable as clockwork, {callsign}. The Guild\'s own little tank."',     weight: 2 },
  { text: '🗣️ "{callsign} the {class}. Endures everything. Even the paperwork."',      weight: 2, style: 'bubble' },
  { text: '🗣️ "If they gave out medals for stubbornness, {callsign}..."',               weight: 1 }
], { cooldownMs: 90000 });

BarkLibrary.register('ambient.class.seer', [
  { text: '🗣️ "The {class} sees things others miss. Like which crates need restocking."', weight: 3 },
  { text: '🗣️ "{callsign} the mystic janitor. Very dramatic energy."',                  weight: 2, style: 'bubble' },
  { text: '🗣️ "Any visions about tomorrow\'s work orders, {callsign}?"',                weight: 2 },
  { text: '🗣️ "A {class} on dungeon cleanup. The universe has a sense of humour."',    weight: 1 }
], { cooldownMs: 90000 });

BarkLibrary.register('ambient.class.wildcard', [
  { text: '🗣️ "A {class}. Nobody knows what you\'ll do next. Including you."',          weight: 3 },
  { text: '🗣️ "{callsign} the {class}. Either brilliant or a liability. Maybe both."', weight: 2 },
  { text: '🗣️ "The {class} approach: throw everything at the wall. See what sticks. Literally."', weight: 2, style: 'bubble' },
  { text: '🗣️ "Unpredictable, {callsign}. The Heroes should take notes."',             weight: 1 }
], { cooldownMs: 90000 });

// Guild NPCs use callsign directly — they're your coworkers
BarkLibrary.register('npc.guild.callsign', [
  { text: 'Looking good out there, {callsign}. Almost like a real hero.',                speaker: 'Ren (Veteran)', style: 'bubble', weight: 3 },
  { text: 'Keep it up, {callsign}. One day they\'ll write songs about the janitor.',     speaker: 'Ren (Veteran)', style: 'bubble', weight: 2 },
  { text: '{callsign} the {class}. Around here we just call you "the new one."',         speaker: 'Sable (Clerk)', style: 'bubble', weight: 2 },
  { text: 'Agent {callsign}, your readiness report is due. Very heroic paperwork.',      speaker: 'Sable (Clerk)', style: 'bubble', weight: 1 },
  { text: '{callsign}! Are you really a {class}? That\'s so cool! I mean — for a Gleaner.', speaker: 'Pip (Rookie)', style: 'bubble', weight: 3 },
  { text: 'Do you think if I train hard enough I could be a {class} too, {callsign}?',  speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 }
], { cooldownMs: 45000 });


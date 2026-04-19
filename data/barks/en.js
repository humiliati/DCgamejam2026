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
  { text: '🗣️ "Watch your step - cobblestones are slippery at dawn."',       weight: 2 },
  { text: '🗣️ "The Guild notice board is already up. Heroes coming."',        weight: 2 },
  { text: '🗣️ "Quiet morning. Almost peaceful."',                            weight: 3 },
  { text: '🗣️ "Another day, another coin. If we\'re lucky."',                weight: 2, style: 'bubble' },
  { text: '🗣️ "The courtyard fountain hasn\'t worked in months."',            weight: 2 },
  { text: '🗣️ "Heard the Cellar Owner ranting again. Something about the floors."', weight: 2 },
  { text: '🗣️ "The road from the gate was busy last night. New arrivals."',   weight: 2 },
  { text: '🗣️ "You the new Gleaner? Good luck in there."',                    weight: 1 },
  { text: '🗣️ "Smells like smoke from the lower cellars again..."',           weight: 1, style: 'bubble' },
  { text: '🗣️ "This courtyard used to have trees. Before they expanded the Guild hall."', weight: 1 }
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
  { text: '🗣️ "Filed a preservation order on the lower gallery. Admiralty ignored it, naturally."', weight: 3 },
  { text: '🗣️ "The specimen taxonomy is outdated. Half these classifications predate the Compact."', weight: 2 },
  { text: '🗣️ "The Foundry\u2019s new kiln runs on the same fuel the deep caves produce naturally."', weight: 2 },
  { text: '🗣️ "Have you read the annotated Compact? The footnotes are... revealing."', weight: 2 },
  { text: '🗣️ "Another access request denied. The Admiralty treats scholarship like espionage."', weight: 2 },
  { text: '🗣️ "The acoustic readings from the deep floors don\u2019t match any known geological pattern."', weight: 1 },
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
  { text: '🗣️ "Rotation change in two hours. Stay sharp until then."', weight: 3 },
  { text: '🗣️ "The checkpoint logs are getting longer. More traffic than usual."', weight: 3 },
  { text: '🗣️ "New classification came through. More specimens added to the restricted list."', weight: 2 },
  { text: '🗣️ "The Oversight Board denied the reclassification proposal. Again."', weight: 2 },
  { text: '🗣️ "Admiralty protocol says report everything. Everything."', weight: 2, style: 'bubble' },
  { text: '🗣️ "The Tide Council filed another access complaint. Seventh one this cycle."', weight: 2 },
  { text: '🗣️ "Training exercise on the lower landing tomorrow. Clear the area early."', weight: 2 },
  { text: '🗣️ "Dr. Yuen\u2019s research notes went missing from the archive last week."', weight: 1 },
  { text: '🗣️ "The sentries on the deep watch keep requesting transfers. All of them."', weight: 1 },
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
    text:    'Keys are at your bunk. Home door - north side of the Promenade, follow the wall east. Can\'t miss it.',
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

// ── Promenade Vendor — interact bark (dialoguePool for floor1_bazaar_vendor)
// Fires when the player talks to the Market Vendor outside Coral Bazaar.
// Friendly, commercial — she's there to sell, not to philosophise.
BarkLibrary.register('npc.promenade.vendor', [
  { text: '🛒 "Morning, Gleaner! Need supplies before heading down?"',            weight: 3 },
  { text: '🛒 "Fresh stock today. Cards, tonics, the usual."',                    weight: 3 },
  { text: '🛒 "Word is the Cellars are worse than last week. Stock up."',          weight: 2 },
  { text: '🛒 "The heroes never buy anything. You lot are my real customers."',    weight: 2 },
  { text: '🛒 "Got a crate of scale fragments in. Don\'t ask where from."',       weight: 1, oneShot: true },
  { text: '🛒 "I hear the Tide faction is buying up half my inventory. Weird."',  weight: 0.5 }
], { cooldownMs: 20000 });

BarkLibrary.register('interior.guild', [
  { text: '🗣️ "Work order board\'s updated - Coral Cellars is priority."',           weight: 3 },
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
  { text: '🛏️ Sleep until dawn? [OK] Rest  [Back] Cancel',         weight: 1, style: 'dialog', oneShot: false },
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
  { text: '📜 A history book - "The Dragon Compact, Vol. 7."',                  weight: 2, style: 'toast' },
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
  { text: '🧃 Coral tonic - slightly fizzy, vaguely medicinal.',            weight: 2, style: 'toast' },
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
  { text: 'Heroes barge in, Gleaners barge in - does nobody knock anymore?!',            speaker: 'Resident', style: 'bubble', weight: 1 }
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
  { text: '🗣️ "The {class} can take a beating. Good - the dungeon gives them daily."', weight: 3 },
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
  { text: '{callsign}! Are you really a {class}? That\'s so cool! I mean - for a Gleaner.', speaker: 'Pip (Rookie)', style: 'bubble', weight: 3 },
  { text: 'Do you think if I train hard enough I could be a {class} too, {callsign}?',  speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 }
], { cooldownMs: 45000 });

// ── Confrontation: Dispatcher fail escalation ────────────────────────
// Triggered when player has accumulated consecutive fails (deaths + curfews).
// Threshold 1: mild concern (2 consecutive). Threshold 2: warning (3+).

BarkLibrary.register('npc.dispatcher.warn.mild', [
  { text: 'Two incidents in a row. I\'m noticing.',                      speaker: 'Dispatcher', style: 'bubble', weight: 3 },
  { text: 'The Guild doesn\'t track your accidents, Gleaner. I do.',     speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'Getting sloppy. This isn\'t a vacation - it\'s a contract.', speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'I have to file paperwork every time you collapse. Don\'t make it a habit.', speaker: 'Dispatcher', style: 'bubble', weight: 1 }
], { cooldownMs: 0 });

BarkLibrary.register('npc.dispatcher.warn.severe', [
  { text: 'Three strikes. You understand what happens next?',             speaker: 'Dispatcher', style: 'bubble', weight: 3 },
  { text: 'Guild is reviewing your contract. I\'d clean up your act.',   speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'One more collapse and I pull you off the roster. Clear?',     speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'The Heroes are asking why the dungeon isn\'t ready. I have no good answer.', speaker: 'Dispatcher', style: 'bubble', weight: 1 }
], { cooldownMs: 0 });

BarkLibrary.register('npc.dispatcher.warn.fired', [
  {
    text:    'That\'s it. Contract terminated. Pack your things, Gleaner.',
    speaker: 'Dispatcher',
    style:   'bubble',
    weight:  1,
    oneShot: true
  }
], { cooldownMs: 0 });

// ── Confrontation: Mailbox report escalation ─────────────────────────
// Hero report text that escalates based on cumulative player failures.
// Used by mailbox-peek to flavor the morning report card.

BarkLibrary.register('mailbox.report.disappointed', [
  { text: 'The dungeon was barely prepped. We lost a scout to a trap you missed.', weight: 3 },
  { text: 'Readiness was unacceptable. We had to clear your mess AND the monsters.', weight: 2 },
  { text: 'Half the crates were empty. Did you even stock floor 3?',               weight: 2 },
  { text: 'We expected better. The Guild is watching your performance.',            weight: 1 }
], { cooldownMs: 0 });

BarkLibrary.register('mailbox.report.angry', [
  { text: 'Two of my team are in the infirmary because of your negligence.',        weight: 3 },
  { text: 'This is the worst-prepared dungeon I\'ve ever seen. We\'re filing a formal complaint.', weight: 2 },
  { text: 'I hope you\'re proud. The Gleaner before you lasted three seasons. You won\'t last one.', weight: 2 },
  { text: 'Next run, we hire our own Gleaner. You\'re done.',                       weight: 1 }
], { cooldownMs: 0 });

// ═══════════════════════════════════════════════════════════════════════
//  DAY-OF-CYCLE BARKS — POST-HERO CLEANUP (Day 1 after Hero Day)
// ═══════════════════════════════════════════════════════════════════════
// The day after heroes tore through. Townspeople gossip about the
// carnage. Tone: weary, impressed, slightly horrified.

BarkLibrary.register('ambient.promenade.day1', [
  { text: '\uD83D\uDDE3\uFE0F "Did you see what the Hero did to floor three? Unrecognisable."',     weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "Cleanup crews have been down there since dawn. Still not done."',    weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "They left scorch marks on the CEILING. How?"',                       weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Someone found a shattered shield near the entrance. Huge thing."',   weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "The Guild posted triple-rate contracts. Must be bad down there."',   weight: 1 },
  { text: '\uD83D\uDDE3\uFE0F "Smells like ozone and old copper. Hero aftermath."',                 weight: 1, style: 'bubble' }
], { cooldownMs: 35000 });

BarkLibrary.register('ambient.lanternrow.day1', [
  { text: '\uD83D\uDDE3\uFE0F "Foundry is buying scale fragments in bulk today. Post-hero premium."', weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "The Watchman locked himself in his office. Won\'t talk to anyone."',  weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Supply wagons clogging the row. Restock day."',                       weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Armory sold out of trap kits by noon. Every Gleaner needs them."',    weight: 1 }
], { cooldownMs: 40000 });

BarkLibrary.register('npc.guild_veteran.day1', [
  { text: 'Worst mess I\'ve seen in three seasons. Take extra rags.',                speaker: 'Ren (Veteran)', style: 'bubble', weight: 3 },
  { text: 'The Hero was efficient this time. Almost surgical. That worries me.',      speaker: 'Ren (Veteran)', style: 'bubble', weight: 2 },
  { text: 'Start from the bottom floor, work up. Trust me on this.',                 speaker: 'Ren (Veteran)', style: 'bubble', weight: 1 }
], { cooldownMs: 30000 });

BarkLibrary.register('npc.guild_clerk.day1', [
  { text: 'Damage reports flooding in. I need more coffee.',                          speaker: 'Sable (Clerk)', style: 'bubble', weight: 3 },
  { text: 'The invoices from yesterday\'s hero run don\'t add up. Again.',           speaker: 'Sable (Clerk)', style: 'bubble', weight: 2 },
  { text: 'Filing backlog is three days deep. We\'ll catch up. Probably.',           speaker: 'Sable (Clerk)', style: 'bubble', weight: 1 }
], { cooldownMs: 30000 });

BarkLibrary.register('npc.guild_rookie.day1', [
  { text: 'I saw the aftermath. I don\'t want to talk about it.',                    speaker: 'Pip (Rookie)', style: 'bubble', weight: 3 },
  { text: 'Is it always this bad? After the heroes, I mean?',                        speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 },
  { text: 'I thought cleaning was boring. Then I saw what heroes leave behind.',      speaker: 'Pip (Rookie)', style: 'bubble', weight: 1 }
], { cooldownMs: 30000 });

// ═══════════════════════════════════════════════════════════════════════
//  DAY-OF-CYCLE BARKS — ROUTINE DAY (Day 2, mid-cycle)
// ═══════════════════════════════════════════════════════════════════════
// Normal working day. Townspeople are calm. Prep work continues.
// Tone: routine, mundane, occasionally anticipatory.

BarkLibrary.register('ambient.promenade.day2', [
  { text: '\uD83D\uDDE3\uFE0F "Quiet day. The kind that makes you forget what\'s below."',         weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "Mid-cycle. Prices are stable, streets are clean. Normal."',          weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "The fishing boats came in early today. Good haul, they say."',      weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Two more days until heroes. Better enjoy the peace."',               weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "The Guild wants higher readiness this cycle. Ambitious."',          weight: 1 },
  { text: '\uD83D\uDDE3\uFE0F "Saw a poster: \'Volunteer for deep floor duty.\' No thanks."',     weight: 1, style: 'bubble' }
], { cooldownMs: 35000 });

BarkLibrary.register('ambient.lanternrow.day2', [
  { text: '\uD83D\uDDE3\uFE0F "Slow day on the Row. Perfect for restocking."',                     weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "The Dispatcher posted new training schedules. Check the board."',   weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "It\'s the calm before the storm. Enjoy it."',                       weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Foundry workers doing maintenance runs. Routine."',                 weight: 1 }
], { cooldownMs: 40000 });

BarkLibrary.register('npc.guild_veteran.day2', [
  { text: 'Use the downtime wisely. Practice trap work.',                             speaker: 'Ren (Veteran)', style: 'bubble', weight: 3 },
  { text: 'Mid-cycle lull. The smart ones prep now, panic later.',                    speaker: 'Ren (Veteran)', style: 'bubble', weight: 2 },
  { text: 'Twelve years, and the quiet days still feel like a warning.',              speaker: 'Ren (Veteran)', style: 'bubble', weight: 1 }
], { cooldownMs: 30000 });

BarkLibrary.register('npc.guild_clerk.day2', [
  { text: 'Inventory day. Please log your salvage before you head out.',              speaker: 'Sable (Clerk)', style: 'bubble', weight: 3 },
  { text: 'Mid-cycle reports are due. Don\'t make me chase you.',                    speaker: 'Sable (Clerk)', style: 'bubble', weight: 2 }
], { cooldownMs: 35000 });

BarkLibrary.register('npc.guild_rookie.day2', [
  { text: 'Is it always this quiet between hero days?',                              speaker: 'Pip (Rookie)', style: 'bubble', weight: 3 },
  { text: 'I cleaned the training room twice. Running out of things to do.',         speaker: 'Pip (Rookie)', style: 'bubble', weight: 2 },
  { text: 'Two days until the next hero. Do you think we\'ll be ready?',             speaker: 'Pip (Rookie)', style: 'bubble', weight: 1 }
], { cooldownMs: 30000 });

// ═══════════════════════════════════════════════════════════════════════
//  MISSING TIME-OF-DAY FILLS
// ═══════════════════════════════════════════════════════════════════════

// Approach — night (sparse, player shouldn't be here this late)
BarkLibrary.register('ambient.approach.night', [
  { text: '\uD83D\uDDE3\uFE0F "Nobody should be out here this late."',                              weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "The courtyard echoes at night. Unsettling."',                       weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Even the maintenance crews have gone home."',                       weight: 1 }
], { cooldownMs: 60000 });

// Lantern Row — morning
BarkLibrary.register('ambient.lanternrow.morning', [
  { text: '\uD83D\uDDE3\uFE0F "Shops opening up. Fresh inventory on the racks."',                  weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "Morning shift, Gleaner? The early bird gets the contract."',        weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Coffee cart is set up near the Foundry stall. Recommend it."',      weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "The Dispatcher was here before dawn. He never sleeps."',            weight: 1 }
], { cooldownMs: 35000 });

// Interior: inn at night (different vibe from daytime)
BarkLibrary.register('interior.inn.night', [
  { text: '\uD83D\uDDE3\uFE0F "Late drinker, huh? Pull up a stool."',                              weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "The night crowd is quieter. Everyone\'s tired."',                   weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Kitchen\'s closed, but there\'s bread and cheese on the counter."', weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "The bard passed out an hour ago. Blessed silence."',                weight: 1, style: 'bubble' }
], { cooldownMs: 50000 });

// Interior: guild at heroday
BarkLibrary.register('interior.guild.heroday', [
  { text: '\uD83D\uDDE3\uFE0F "All stations reporting in. Hero ETA: imminent."',                   weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "Final readiness check underway. Don\'t leave until it\'s filed."', weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "The Guild Master is watching the floor stats. No pressure."',       weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "Someone brought pastries. Morale boost before the carnage."',       weight: 1, style: 'bubble' }
], { cooldownMs: 35000 });

// Interior: bazaar at heroday
BarkLibrary.register('interior.bazaar.heroday', [
  { text: '\uD83D\uDDE3\uFE0F "Closing early today. Hero Day makes everyone nervous."',            weight: 3 },
  { text: '\uD83D\uDDE3\uFE0F "Last-minute supply run? Smart. Prices go up after the hero hits."', weight: 2 },
  { text: '\uD83D\uDDE3\uFE0F "The Tide vendor doubled her security. Must have good stock."',      weight: 1 }
], { cooldownMs: 40000 });

// Dispatcher ambient: time variants
BarkLibrary.register('npc.dispatcher.ambient.morning', [
  { text: 'Dawn briefing in five. Don\'t be late.',                                   speaker: 'Dispatcher', style: 'bubble', weight: 3 },
  { text: 'Fresh contracts on the board. Prioritise the deep floors.',                speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'Morning report says readiness is at forty. Not good enough.',              speaker: 'Dispatcher', style: 'bubble', weight: 1 }
], { cooldownMs: 60000 });

BarkLibrary.register('npc.dispatcher.ambient.dusk', [
  { text: 'Heading home soon? File your report first.',                               speaker: 'Dispatcher', style: 'bubble', weight: 3 },
  { text: 'The dungeon doesn\'t close at sundown, but you should.',                  speaker: 'Dispatcher', style: 'bubble', weight: 2 },
  { text: 'Night shift pays double. But the risks triple.',                           speaker: 'Dispatcher', style: 'bubble', weight: 1 }
], { cooldownMs: 60000 });

BarkLibrary.register('npc.dispatcher.ambient.night', [
  { text: 'Still here? You\'re either dedicated or lost.',                            speaker: 'Dispatcher', style: 'bubble', weight: 3 },
  { text: 'Curfew\'s approaching. Wrap it up, Gleaner.',                             speaker: 'Dispatcher', style: 'bubble', weight: 2 }
], { cooldownMs: 90000 });

// Innkeeper: time variants
BarkLibrary.register('npc.innkeeper.morning', [
  { text: 'Breakfast is on the table. Eat before you head down.',                     speaker: 'Innkeeper', style: 'bubble', weight: 3 },
  { text: 'Fresh bread this morning. The baker outdid herself.',                      speaker: 'Innkeeper', style: 'bubble', weight: 2 }
], { cooldownMs: 35000 });

BarkLibrary.register('npc.innkeeper.night', [
  { text: 'Last call was an hour ago. You need a room or a door.',                    speaker: 'Innkeeper', style: 'bubble', weight: 3 },
  { text: 'The late crowd\'s mostly gone. I\'m closing up.',                         speaker: 'Innkeeper', style: 'bubble', weight: 2 }
], { cooldownMs: 45000 });

// ═══════════════════════════════════════════════════════════════════════
//  ENEMY / CREATURE PROXIMITY BARKS (depth-3 dungeon floors)
// ═══════════════════════════════════════════════════════════════════════
// These fire from enemies on depth-3+ floors when the player is within
// bark radius. Atmospheric, non-verbal. The creatures make sounds
// regardless of awareness state — it's ambient dungeon life.

// Cellar biome — rats, spiders, mold shamblers
BarkLibrary.register('enemy.cellar', [
  { text: '... skittering claws on wet stone.',                                       weight: 3, style: 'bubble' },
  { text: '... a low squeak echoes down the corridor.',                               weight: 3, style: 'bubble' },
  { text: '... something scurries behind the crates.',                                weight: 2, style: 'bubble' },
  { text: '... the faint clicking of mandibles in the dark.',                         weight: 2, style: 'bubble' },
  { text: '... a wet, dragging sound. Mold? Something worse?',                        weight: 2, style: 'bubble' },
  { text: '... tiny eyes glint from a crack in the wall.',                            weight: 1, style: 'bubble' },
  { text: '... a rattling hiss. Whatever it is, it knows you\'re here.',             weight: 1, style: 'bubble' },
  { text: '... webs tremble in a draft that shouldn\'t exist.',                      weight: 0.5, style: 'bubble' }
], { cooldownMs: 25000 });

// Cellar: awareness-specific barks (enemy has noticed the player)
BarkLibrary.register('enemy.cellar.alert', [
  { text: '... the squeaking stops. Silence. Worse than noise.',                      weight: 3, style: 'bubble' },
  { text: '... something is watching you from the shadows.',                          weight: 3, style: 'bubble' },
  { text: '... claws scraping stone. Getting closer.',                                weight: 2, style: 'bubble' },
  { text: '... a guttural snarl from around the corner.',                             weight: 2, style: 'bubble' },
  { text: '... it hissed. That was directed at you.',                                weight: 1, style: 'bubble' }
], { cooldownMs: 15000 });

// Foundry biome — soot imps, iron golems, slag hounds
BarkLibrary.register('enemy.foundry', [
  { text: '... the clang of metal on stone. Rhythmic. Mechanical.',                   weight: 3, style: 'bubble' },
  { text: '... a dry cackling from the pipes overhead.',                              weight: 3, style: 'bubble' },
  { text: '... heavy footfalls. Something large, moving slowly.',                     weight: 2, style: 'bubble' },
  { text: '... sparks fly from a dark alcove. Something is alive in there.',          weight: 2, style: 'bubble' },
  { text: '... the hiss of steam. Or breath. Hard to tell.',                          weight: 2, style: 'bubble' },
  { text: '... a low growl reverberates through the ironwork.',                       weight: 1, style: 'bubble' },
  { text: '... molten drip. The air shimmers with heat.',                             weight: 1, style: 'bubble' },
  { text: '... something scrapes a claw against a pipe. Testing.',                    weight: 0.5, style: 'bubble' }
], { cooldownMs: 25000 });

BarkLibrary.register('enemy.foundry.alert', [
  { text: '... the clanging stopped. It\'s listening.',                               weight: 3, style: 'bubble' },
  { text: '... heavy breathing from the dark. Close.',                                weight: 2, style: 'bubble' },
  { text: '... sparks and a snarl. It saw you.',                                     weight: 2, style: 'bubble' },
  { text: '... grinding metal. Something is turning toward you.',                     weight: 1, style: 'bubble' }
], { cooldownMs: 15000 });

// Sealab biome — deep sea specimens, corrupted researchers
BarkLibrary.register('enemy.sealab', [
  { text: '... bubbling from somewhere below the grating.',                           weight: 3, style: 'bubble' },
  { text: '... a wet slap against glass. Something inside the tank moved.',           weight: 3, style: 'bubble' },
  { text: '... the hum of containment fields. One of them is flickering.',            weight: 2, style: 'bubble' },
  { text: '... dripping. Constant. The walls are damp with something.',               weight: 2, style: 'bubble' },
  { text: '... a garbled voice on a broken intercom. Words you can\'t quite catch.',  weight: 1, style: 'bubble' },
  { text: '... bioluminescent glow pulses in the dark. Once. Twice.',                 weight: 0.5, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('enemy.sealab.alert', [
  { text: '... the tank glass cracked. Something is pressing from inside.',           weight: 3, style: 'bubble' },
  { text: '... a shriek that doesn\'t sound human. Or animal.',                      weight: 2, style: 'bubble' },
  { text: '... the containment hum changed pitch. It knows.',                         weight: 1, style: 'bubble' }
], { cooldownMs: 18000 });

// Generic dungeon enemy bark — fallback for unrecognised biomes
BarkLibrary.register('enemy.generic', [
  { text: '... something moves in the darkness ahead.',                               weight: 3, style: 'bubble' },
  { text: '... a scraping sound. Stone on stone.',                                    weight: 3, style: 'bubble' },
  { text: '... breath that isn\'t yours.',                                            weight: 2, style: 'bubble' },
  { text: '... footsteps. Not your own.',                                             weight: 1, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('enemy.generic.alert', [
  { text: '... it stopped moving. It\'s waiting.',                                    weight: 3, style: 'bubble' },
  { text: '... you hear it clearly now. Close. Very close.',                          weight: 2, style: 'bubble' }
], { cooldownMs: 18000 });

// ── Floor 3 — Immigrant Inspector (Vivec arch gate) ─────────────────
// Stationary checkpoint NPC at (48,25). Ambient barks run while the
// player is nearby but hasn't engaged in dialogue. The reject/accept
// pools are reserved for post-dialogue outcomes (wiring deferred).

BarkLibrary.register('npc.inspector.ambient', [
  { text: '🛂 "Papers. Papers. No papers, no passage."',                              weight: 3 },
  { text: '🛂 "Next! ... still no one with papers today."',                           weight: 3 },
  { text: '🛂 "Rent receipt or proof of residence. Those are the rules."',           weight: 3 },
  { text: '🛂 "You\'d be surprised how many think a shopping list counts."',         weight: 2, style: 'bubble' },
  { text: '🛂 "Vivec waits. The arch does not."',                                    weight: 2 },
  { text: '🛂 "Crowd keeps getting bigger. Deadline keeps getting closer."',         weight: 1 }
], { cooldownMs: 22000 });

BarkLibrary.register('npc.inspector.reject', [
  { text: '🛂 "No receipt. Step aside."',                                            weight: 3 },
  { text: '🛂 "The ledger says no. Come back with a stamp."',                        weight: 2 }
], { cooldownMs: 15000 });

BarkLibrary.register('npc.inspector.accept', [
  { text: '🛂✅ "Stamped. Safe crossing, citizen."',                                  weight: 3 },
  { text: '🛂✅ "About time someone paid their week. Go on."',                        weight: 2 }
], { cooldownMs: 15000 });

// ── Floor 3 — Aloof Vivec arch crowd ────────────────────────────────
// Four ambient loiterers to the north and south shoulders of the arch
// approach. They have been waiting a while. The tone is resigned envy,
// weather-beaten gossip, and the occasional flash of hope — world-
// building for the rent/paperwork pressure without spelling it out.

BarkLibrary.register('ambient.vivec_crowd', [
  // Resigned / tired
  { text: '🗣️ "Fourth day in this line. Fourth day."',                                weight: 3 },
  { text: '🗣️ "The Inspector stamped someone yesterday. Heard it from a gull."',     weight: 3, style: 'bubble' },
  { text: '🗣️ "My receipt\u2019s dated wrong. Clerk wouldn\'t fix it. Back to the landlord."', weight: 3 },
  // Envy / resentment
  { text: '🗣️ "Rich folk just walk through. Stamped before they even arrive."',     weight: 2 },
  { text: '🗣️ "They say Vivec has running water. Can you imagine."',                 weight: 2, style: 'bubble' },
  // Gossip / rumor
  { text: '🗣️ "Heard the deadline\u2019s real. End of week two, arch shuts for good."', weight: 2 },
  { text: '🗣️ "Tide envoy got through last week. Paid his rent three months early."', weight: 2 },
  { text: '🗣️ "Old man said he saw the Inspector smile once. I don\'t believe him."', weight: 1 },
  // Hope / nudge
  { text: '🗣️ "If you\'ve got coin, pay your week. Don\'t wait like I did."',         weight: 2 },
  { text: '🗣️ "The safehouse landlord is strict but fair. Just bring the ledger."', weight: 2 },
  // Weather / ambience
  { text: '🗣️ "Wind\u2019s cold off the arch. Vivec side\u2019s warmer, they say."',  weight: 1, style: 'bubble' },
  { text: '🗣️ "..."',                                                                 weight: 0.5, style: 'bubble' }
], { cooldownMs: 28000, minIntervalMs: 8000 });

// ── Floor 3: Garrison Row — general ambient ──────────────────────────
// The frontier gate district. Military checkpoint, petitioner crowd,
// street commerce. 5 NPCs share this pool: beggar, washerwoman, drifter,
// hawker, urchin. Higher desperation than Floors 0–2.

BarkLibrary.register('ambient.garrison', [
  // Ground-level desperation
  { text: '🗣️ "Gate opens at dawn, closes at dusk. Miss it and you sleep outside."',  weight: 3 },
  { text: '🗣️ "Admiralty patrols are thicker today. Something happened below."',      weight: 3 },
  { text: '🗣️ "Spare a coin? No? Didn\'t think so."',                                weight: 3, style: 'bubble' },
  { text: '🗣️ "The garrison rations got halved again. Heroes eat well though."',      weight: 2 },
  // Commerce / hustle
  { text: '🗣️ "Dragonsteel scrap! Real dragonsteel! Only slightly cursed!"',          weight: 2, style: 'bubble' },
  { text: '🗣️ "Fresh bread from the Vivec side! Three coin! Two if you\'re Gleaner!"', weight: 2 },
  { text: '🗣️ "The caravan from the highway brought salt. First time in weeks."',     weight: 2 },
  // Observation / rumour
  { text: '🗣️ "Watched a hero walk through yesterday. Didn\'t look at any of us."',  weight: 2 },
  { text: '🗣️ "The deep floors have gone quiet. Too quiet, the watchmen say."',       weight: 1 },
  { text: '🗣️ "Three Admiralty soldiers came up from below last night. One was crying."', weight: 1 },
  // Conspiracy breadcrumb
  { text: '🗣️ "A kid told me the caves hum at night. Like something\'s breathing down there."', weight: 0.5, oneShot: true },
  { text: '🗣️ "The old garrison records mention \'protectors.\' Not \'monsters.\' Protectors."', weight: 0.5, oneShot: true }
], { cooldownMs: 30000 });

// ── Floor 3: Pier — old fisherman ambient ────────────────────────────
// Single NPC (floor3_fisherman). Weathered, talkative, pier-specific lore.
// Longer cooldown since it's a solo NPC.

BarkLibrary.register('ambient.pier', [
  { text: '🗣️ "Fish aren\'t biting today. Haven\'t been biting much at all, lately."', weight: 3 },
  { text: '🗣️ "The harbour used to be busier. Before they walled off the deep docks."', weight: 3, style: 'bubble' },
  { text: '🗣️ "See that shimmer out past the breakwater? Been there three nights running."', weight: 2 },
  { text: '🗣️ "Salt air\'s good for the lungs. Bad for everything else."',            weight: 2, style: 'bubble' },
  { text: '🗣️ "My father fished these waters. His father before him. The water was warmer then."', weight: 2 },
  { text: '🗣️ "Tide Council folk come down here sometimes. Ask about the deep water. I tell them what I see."', weight: 1 },
  { text: '🗣️ "Heard something under the pier last night. Low. Rhythmic. Like a heartbeat."', weight: 0.5, oneShot: true }
], { cooldownMs: 45000 });

// ── Floor 3: Highway — caravan trader ambient ────────────────────────
// Single NPC (floor3_trader_highway). Transient merchant, horse-and-cart
// energy. Passing through with goods, gossip from other settlements.

BarkLibrary.register('ambient.highway', [
  { text: '🗣️ "Long road from the eastern pass. Your garrison\'s the first stop in weeks."', weight: 3 },
  { text: '🗣️ "Salt, rope, lamp oil — got it all. Prices fair if you buy in bulk."',  weight: 3, style: 'bubble' },
  { text: '🗣️ "The road patrols are stretched thin. Saw Foundry marks on abandoned camps."', weight: 2 },
  { text: '🗣️ "Other settlements don\'t have this many heroes. Makes you wonder why."', weight: 2 },
  { text: '🗣️ "Last town I passed through? No dungeon. No heroes. No \'Gleaners.\' Just... quiet."', weight: 1 },
  { text: '🗣️ "The eastern settlements tell stories about this place. None of them good."', weight: 1, oneShot: true }
], { cooldownMs: 40000 });

// ═══════════════════════════════════════════════════════════════════
// §ENCOUNTER — Verb-field NPC-to-NPC encounter barks
// ═══════════════════════════════════════════════════════════════════
// These fire when two verb-field NPCs meet at the same spatial node.
// Pool key convention: encounter.<nodeType>.<encounterType>
// Fallback pools: encounter.<encounterType> (no node type prefix)
// See VERB_FIELD_NPC_ROADMAP.md §8.

// ── Camaraderie (same verb, same faction) ─────────────────────────

BarkLibrary.register('encounter.camaraderie', [
  { text: '🗣️ "Another late night at the post, eh?"  —  "Someone has to keep the standards up."', weight: 3 },
  { text: '🗣️ "You look tired."  —  "You look worse."  —  [both laugh quietly]', weight: 2 },
  { text: '🗣️ "Did the new shipment come through?"  —  "Tomorrow, supposedly. We\'ll see."', weight: 2 },
  { text: '🗣️ "Good to see a friendly face out here."  —  "Likewise. Stay sharp."', weight: 2 }
], { cooldownMs: 60000 });

BarkLibrary.register('encounter.bonfire.camaraderie', [
  { text: '🗣️ "Fire\'s dying down."  —  "I\'ll get another log. You rest."', weight: 3 },
  { text: '🗣️ "Remember when the heroes torched half the promenade?"  —  "How could I forget."', weight: 2 },
  { text: '🗣️ "This is the best part of the shift."  —  "Agreed. Just the fire and the quiet."', weight: 2 }
], { cooldownMs: 60000 });

// ── Uneasy coexistence (same verb, different factions) ────────────

BarkLibrary.register('encounter.uneasy', [
  { text: '🗣️ "Evening."  —  "...Evening."', weight: 3 },
  { text: '🗣️ "Funny how we both ended up here."  —  "Hilarious."', weight: 2 },
  { text: '🗣️ "Warm night."  —  "Is it."  —  [uncomfortable silence]', weight: 2 },
  { text: '🗣️ "Your people have been busy lately."  —  "Yours too. Funny, that."', weight: 2 }
], { cooldownMs: 60000 });

BarkLibrary.register('encounter.bonfire.uneasy', [
  { text: '🗣️ "Room for one more?"  —  "It\'s a public fire."  —  "Didn\'t say it wasn\'t."', weight: 3 },
  { text: '🗣️ "You warming up or cooling down?"  —  "Depends who\'s asking."', weight: 2 }
], { cooldownMs: 60000 });

// ── Tension (different verbs, different factions) ─────────────────

BarkLibrary.register('encounter.tension', [
  { text: '🗣️ "Tide Council says the deep caves are protected."  —  "Foundry says they\'re unexploited. Same caves."', weight: 3 },
  { text: '🗣️ "Your faction\'s been awfully quiet this week."  —  "When we\'re loud, you complain. When we\'re quiet, you worry. Pick one."', weight: 2 },
  { text: '🗣️ "Heard your people lost a shipment."  —  "Heard yours caused it."', weight: 2 },
  { text: '🗣️ "Stay on your side of the promenade."  —  "Last I checked, there are no sides."', weight: 2 }
], { cooldownMs: 60000 });

// ── Passing (different verbs, same faction) ───────────────────────

BarkLibrary.register('encounter.passing', [
  { text: '🗣️ "Heading to the bazaar? Pick me up some salt if they have it."  —  "I\'ll see what\'s left."', weight: 3 },
  { text: '🗣️ "Back to the post?"  —  "Someone has to be. You enjoy your errands."', weight: 2 },
  { text: '🗣️ "Anything good at the noticeboard?"  —  "Same old. New cleaning quotas."', weight: 2 },
  { text: '🗣️ "Don\'t stay out too long — shift change is soon."  —  "Already? Time flies."', weight: 2 }
], { cooldownMs: 60000 });

// ── Gossip (non-faction citizens) ─────────────────────────────────

BarkLibrary.register('encounter.gossip', [
  { text: '🗣️ "Did you see the state of floor 2 this morning? Heroes tore through again."', weight: 3 },
  { text: '🗣️ "Marina says the harbour master\'s been acting strange."  —  "Everyone\'s strange since the heroes set up camp."', weight: 2 },
  { text: '🗣️ "The inn\'s got a new stew. Seaweed base."  —  "Can\'t decide if that\'s brave or sad."', weight: 2 },
  { text: '🗣️ "Scale fragments are up to 40 coin. Used to be 12."  —  "Something\'s changed down there."', weight: 2 },
  { text: '🗣️ "My grandmother says the caves used to sing at night. Before the heroes came."', weight: 1, oneShot: true },
  { text: '🗣️ "Storm coming in from the east. Good night to stay inside."  —  "If only we could."', weight: 2 }
], { cooldownMs: 45000 });

BarkLibrary.register('encounter.well.gossip', [
  { text: '🗣️ "Water tastes different today."  —  "It always tastes different. Don\'t think about it."', weight: 3 },
  { text: '🗣️ "You hear about the cleaner? New one."  —  "Another one? They go through them fast."', weight: 2 },
  { text: '🗣️ "Nice day for it."  —  "For what?"  —  "Just... for it. Whatever \'it\' is."', weight: 2 }
], { cooldownMs: 45000 });

// ── Transition barks (solo NPC verb-switching) ────────────────────

BarkLibrary.register('bark.transition.duty_to_social', [
  { text: '🗣️ "Think I\'ll take a break."', weight: 3, style: 'bubble' },
  { text: '🗣️ "That\'s enough for now."', weight: 2, style: 'bubble' },
  { text: '🗣️ *stretches*', weight: 1, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('bark.transition.social_to_duty', [
  { text: '🗣️ "Back to it, I suppose."', weight: 3, style: 'bubble' },
  { text: '🗣️ "Duty calls."', weight: 2, style: 'bubble' },
  { text: '🗣️ *sighs and stands*', weight: 1, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('bark.transition.social_to_errands', [
  { text: '🗣️ "I should check if they\'ve got any rope in."', weight: 3, style: 'bubble' },
  { text: '🗣️ "Need to pick up a few things."', weight: 2, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('bark.transition.errands_to_social', [
  { text: '🗣️ "Nothing worth buying today."', weight: 3, style: 'bubble' },
  { text: '🗣️ "Prices are worse than yesterday."', weight: 2, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('bark.transition.errands_to_duty', [
  { text: '🗣️ "Right. Better get back."', weight: 3, style: 'bubble' },
  { text: '🗣️ "Can\'t hide in the shops forever."', weight: 2, style: 'bubble' }
], { cooldownMs: 30000 });

BarkLibrary.register('bark.transition.duty_to_errands', [
  { text: '🗣️ "Need supplies. Won\'t be long."', weight: 3, style: 'bubble' },
  { text: '🗣️ "Running low on ink. Back shortly."', weight: 2, style: 'bubble' }
], { cooldownMs: 30000 });


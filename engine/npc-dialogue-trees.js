/**
 * @file npc-dialogue-trees.js
 * @description NPC dialogue tree registration module.
 *
 * This module was extracted from game.js (lines 1422–2955) to reduce
 * the size of the main game initialization file. It contains all
 * NpcSystem.registerTree() calls that define dialogue nodes for NPCs
 * across all game floors.
 *
 * Dependencies (via typeof guards):
 * - NpcSystem (required to register trees)
 *
 * @version 1.0
 */

var NpcDialogueTrees = (function() {
  'use strict';

  /**
   * registerAll
   * Registers all dialogue trees with NpcSystem.
   * Wrapped in typeof guard to allow safe loading without NpcSystem.
   */
  function registerAll() {
    if (typeof NpcSystem === 'undefined') {
      console.warn('NpcDialogueTrees.registerAll(): NpcSystem not available, skipping dialogue tree registration');
      return;
    }


      // ════════════════════════════════════════════════════════════════
      // Floor 0 — The Approach (first encounters after deploy cutscene)
      // ════════════════════════════════════════════════════════════════

      // ── Campfire Drifter ──────────────────────────────────────────
      // First talkable NPC. Explains the settlement, the setting,
      // why people live here outside the arch. Tone: weary, helpful,
      // matter-of-fact. Not hostile, not cheerful — resigned.
      NpcSystem.registerTree('floor0_drifter', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'You just get dropped off? ...Yeah. Truck comes through once a week. One way trip.',
            choices: [
              { label: 'Where am I?', next: 'where' },
              { label: 'What is this place?', next: 'settlement' },
              { label: 'I need to get through that arch', next: 'arch' },
              { label: 'Never mind', next: null }
            ]
          },
          where: {
            text: 'The Approach. It\'s what they call the strip between the overpass and the town wall. Used to be a service road. Now it\'s... this.',
            choices: [
              { label: 'What happened?', next: 'history' },
              { label: 'The overpass behind me?', next: 'overpass' },
              { label: 'Thanks', next: null }
            ]
          },
          overpass: {
            text: 'Highway 9 overpass. They fenced the on-ramps years ago. Only way out is through. Through the arch, through the town, through... whatever\'s past that.',
            choices: [
              { label: 'What is this place?', next: 'settlement' },
              { label: 'I\'ll figure it out', next: null }
            ]
          },
          settlement: {
            text: 'People camp here because the town won\'t let everyone through the arch. Not enough housing. Not enough work. So you wait. Set up a tent. Find a bonfire. Try not to think too hard about it.',
            choices: [
              { label: 'How long have you been here?', next: 'how_long' },
              { label: 'Who runs things here?', next: 'who_runs' },
              { label: 'That\'s rough', next: null }
            ]
          },
          history: {
            text: 'Factories closed, one by one. You can see the old buildings through the facade wall — boarded up, rusted. People who worked there had nowhere to go. The overpass camps became the meadow camps became... permanent.',
            choices: [
              { label: 'Who runs things here?', next: 'who_runs' },
              { label: 'Factories? What kind?', next: 'factories' },
              { label: 'I see', next: null }
            ]
          },
          factories: {
            text: 'Processing plants, mostly. Dungeon salvage. The Heroes bring back materials and someone has to sort, clean, package it all. Used to employ half the district. Now the Foundry runs automated lines and three guys in a control booth.',
            choices: [
              { label: 'The Foundry?', next: 'foundry' },
              { label: 'Thanks for telling me', next: null }
            ]
          },
          foundry: {
            text: 'Big outfit. Runs the smelters, the warehouses, most of the money. They\'re the reason the town exists at all. Also the reason half of us are out here instead of in there. Funny how that works.',
            choices: [
              { label: 'Back', next: 'greeting' },
              { label: 'I appreciate you talking to me', next: null }
            ]
          },
          how_long: {
            text: 'Six months? Seven? You stop counting. Some folks here have been camped for years. The house down south — that family actually built something. Most of us just... sit.',
            choices: [
              { label: 'Is there anything to do here?', next: 'what_to_do' },
              { label: 'I should keep moving', next: null }
            ]
          },
          what_to_do: {
            text: 'Walk. Think. Tend the fire. Talk to the old man in the shack up north if you want stories. Don\'t mind if he sounds crazy — he\'s been here longer than anyone.',
            choices: [
              { label: 'Crazy how?', next: 'hermit_hint' },
              { label: 'I\'ll check it out', next: null }
            ]
          },
          hermit_hint: {
            text: 'Talks about pandas, dragons, the "elites." Conspiracy stuff. People keep their distance. But he\'s harmless. And... some of what he says, I dunno. After enough time out here, you start wondering too.',
            choices: [
              { label: '...', next: null }
            ]
          },
          who_runs: {
            text: 'Nobody, really. There\'s a Groundskeeper who sweeps the road — I think the town pays him a stipend so the Approach doesn\'t look too bad from the arch. But governance? Laws? That\'s on the other side of the wall.',
            choices: [
              { label: 'The arch leads to the town?', next: 'arch' },
              { label: 'Thanks', next: null }
            ]
          },
          arch: {
            text: 'The Promenade. Real town. Shops, homes, a guild office. If you can get work, you can get in. That\'s the deal. Go through, find the Dispatcher, sign up as a Gleaner. That\'s your ticket.',
            choices: [
              { label: 'What\'s a Gleaner?', next: 'gleaner' },
              { label: 'I\'ll head that way', next: null }
            ]
          },
          gleaner: {
            text: 'Dungeon janitor. The Heroes go in and fight monsters. The Gleaners go in after and clean up the mess. Restock traps, mop blood, reset the floors for the next cycle. It\'s not glamorous, but it pays.',
            choices: [
              { label: 'Sounds like my kind of work', next: 'work_affirm' },
              { label: 'That sounds terrible', next: 'work_deny' }
            ]
          },
          work_affirm: {
            text: 'Ha. Sure. Head through the arch. Talk to the Dispatcher in the guild office. They\'ll sort you out. ...Good luck in there.',
            choices: [
              { label: 'Thanks for everything', next: null }
            ]
          },
          work_deny: {
            text: 'It is. But it\'s the only work going. The alternative is...' + ' *gestures at the encampment* ' + '...this. Your call.',
            choices: [
              { label: 'I\'ll think about it', next: null }
            ]
          }
        }
      });

      // ── Laid-off Laborer ──────────────────────────────────────────
      // Second encounter (SC pod). Talks about the local economy,
      // the industries, the homelessness crisis directly. Angrier tone
      // than the Drifter — this person lost a specific job and blames
      // specific people.
      NpcSystem.registerTree('floor0_laborer', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'What. ...Oh. New arrival. Don\'t sit too close to the fire, the smoke gets in your lungs.',
            choices: [
              { label: 'What happened to you?', next: 'story' },
              { label: 'Why are there so many people camping out here?', next: 'homelessness' },
              { label: 'Sorry to bother you', next: null }
            ]
          },
          story: {
            text: 'Worked the salvage line at Foundry Plant 6 for eleven years. Sorting hero loot. One day the machines show up. Next week, layoff notices. Three hundred people. Just like that.',
            choices: [
              { label: 'Where did everyone go?', next: 'displacement' },
              { label: 'Can\'t you find other work?', next: 'other_work' },
              { label: 'That\'s awful', next: 'awful' }
            ]
          },
          displacement: {
            text: 'Here. The meadow. The overpass camps. Some went further out, past the highway. The ones with connections got guild work — Gleaner positions, courier routes. The rest of us just... stayed.',
            choices: [
              { label: 'Nobody helped?', next: 'nobody_helped' },
              { label: 'What about the houses?', next: 'housing' },
              { label: 'I see', next: null }
            ]
          },
          nobody_helped: {
            text: 'The Admiralty posted a notice about "workforce transition support." One meeting. One pamphlet. That was it. The Foundry sent severance for two months. Two months to replace eleven years. And the Tide temple offered prayers.',
            choices: [
              { label: 'The Admiralty? The Tide?', next: 'factions' },
              { label: 'That\'s not enough', next: 'not_enough' }
            ]
          },
          factions: {
            text: 'The powers that be. Admiralty runs the government — permits, taxes, the wall. The Tide runs the temples — blessings, morale, "spiritual guidance." And the Foundry runs everything else. Three legs of a stool that doesn\'t have a seat.',
            choices: [
              { label: 'Who\'s responsible for all this?', next: 'responsible' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          not_enough: {
            text: 'No. It\'s not. But what are you gonna do? Protest? They\'ll send a Hero. Strike? They\'ll hire scabs from two districts over. The system works exactly how it\'s supposed to. Just not for us.',
            choices: [
              { label: 'Send a Hero?', next: 'hero_threat' },
              { label: '...', next: null }
            ]
          },
          hero_threat: {
            text: 'Figure of speech. Mostly. The Heroes are supposed to fight dungeon monsters. But the Admiralty has... broad definitions of what constitutes a threat to public order. Makes people think twice about pushing back.',
            choices: [
              { label: 'That\'s messed up', next: 'messed_up' },
              { label: 'I need to go', next: null }
            ]
          },
          messed_up: {
            text: 'Yeah. It is. ...Look, I\'m not trying to scare you. Just keep your eyes open in there. The town looks nice from the outside. Pretty sunsets, cobblestone streets. But under it? Same rot. Just better lighting.',
            choices: [
              { label: 'Thanks for the warning', next: null }
            ]
          },
          other_work: {
            text: 'As what? The only jobs left are Gleaner contracts and the Foundry won\'t hire anyone they already fired. Says it\'s "policy." Really it\'s because we organized once. Seven years ago. They don\'t forget.',
            choices: [
              { label: 'You organized?', next: 'organized' },
              { label: 'Gleaner contracts?', next: 'gleaner_work' },
              { label: 'I understand', next: null }
            ]
          },
          organized: {
            text: 'We asked for safety gear. That\'s it. Dungeon salvage has corrosive residue, cursed fragments, biological hazards. We wanted gloves and respirators. They called it "insubordination" and blacklisted everyone who signed.',
            choices: [
              { label: 'Over safety gear?', next: 'safety' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          safety: {
            text: 'It was never about the gloves. It was about control. You let workers ask for one thing, next they want fair wages, shift limits, a say in operations. Can\'t have that. Not when the Hero cycle depends on cheap labor.',
            choices: [
              { label: 'The Hero cycle?', next: 'hero_cycle' },
              { label: 'I hear you', next: null }
            ]
          },
          hero_cycle: {
            text: 'Heroes go in, kill monsters, bring out loot. Gleaners go in, clean up, reset the floors so monsters come back. Repeat forever. The whole economy runs on it. And at the bottom of that stack? People like us. Expendable.',
            choices: [
              { label: '...', next: null }
            ]
          },
          gleaner_work: {
            text: 'Dungeon cleaning. You go in after the Hero and mop up. Dangerous, disgusting, and the pay is barely enough to keep a roof over your head. But at least you get a roof. More than I can say for the meadow.',
            choices: [
              { label: 'I might sign up for that', next: 'sign_up' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          sign_up: {
            text: 'Then go through the arch. Find the Dispatcher. Just... don\'t let them fool you into thinking the work is noble. It\'s survival. Same as out here, just with a mop.',
            choices: [
              { label: 'Noted', next: null }
            ]
          },
          awful: {
            text: 'Don\'t pity me. Pity the families. Kids growing up in tents. No school on this side. The Tide runs a charity kitchen on Sundays but it\'s gruel and sermons. Not exactly a safety net.',
            choices: [
              { label: 'Why are there so many people camping out here?', next: 'homelessness' },
              { label: 'I should go', next: null }
            ]
          },
          homelessness: {
            text: 'Because the town can\'t hold everyone and won\'t build for everyone. Simple as that. They built the wall, the arch, the checkpoints — all to control who gets in. The rest of us wait in the meadow.',
            choices: [
              { label: 'How many people live out here?', next: 'how_many' },
              { label: 'Who decided that?', next: 'responsible' },
              { label: 'That can\'t be legal', next: 'legal' }
            ]
          },
          how_many: {
            text: 'Hard to count. Sixty? Eighty? More come every season. Fewer leave. Some die quiet — cold, sickness, sometimes just... giving up. The bonfires are the only thing keeping people going. Literally and otherwise.',
            choices: [
              { label: 'Who decided that?', next: 'responsible' },
              { label: 'I\'m sorry', next: null }
            ]
          },
          responsible: {
            text: 'Foundry shut the plants. Admiralty drew the wall. Tide said it was "the natural order." Pick your villain. Or better yet, ask yourself why three factions that disagree on everything all agree that we should stay out here.',
            choices: [
              { label: 'They agree on that?', next: 'agree' },
              { label: 'Heavy stuff', next: null }
            ]
          },
          agree: {
            text: 'Only thing they agree on. Cheap labor has to come from somewhere. And desperate people don\'t negotiate. The meadow isn\'t an accident. It\'s a feature.',
            choices: [
              { label: '...', next: null }
            ]
          },
          legal: {
            text: 'Legal? Hah. Legal is whatever the Admiralty writes on a piece of paper. Out here, past the wall, we\'re technically "unincorporated territory." No bylaws, no protections, no obligations. Convenient, right?',
            choices: [
              { label: 'Who decided that?', next: 'responsible' },
              { label: 'Yeah. Convenient', next: null }
            ]
          },
          housing: {
            text: 'The house down south? That family\'s been here three years. Built it themselves from salvage. Technically illegal — the Admiralty calls it "unauthorized construction." But nobody enforces it. Not worth their time to demolish a shack.',
            choices: [
              { label: 'At least they have walls', next: 'walls' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          walls: {
            text: 'Walls and a mailbox. Like they\'re waiting for a letter that\'s never coming. I respect it though. Building something when nobody tells you that you can? That\'s the most defiant thing you can do out here.',
            choices: [
              { label: 'I like that', next: null }
            ]
          }
        }
      });

      // ── Raving Hermit ─────────────────────────────────────────────
      // NE pod shack. Incoherent muttering about pandas and dragon
      // elites. Existential crisis delivered as conspiracy word salad.
      // Funny on the surface, unsettling underneath. Every branch
      // spirals deeper. There is no "normal" exit — only trailing off.
      NpcSystem.registerTree('floor0_hermit', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'THEY\'RE USING THE PANDAS. You have to understand. The PANDAS. They\'re not animals. They\'re... they\'re SIGILS. Living sigils. Walking contracts written in black and white fur.',
            choices: [
              { label: 'Are you okay?', next: 'okay' },
              { label: 'Pandas?', next: 'pandas' },
              { label: 'I\'m going to leave now', next: 'leave' }
            ]
          },
          okay: {
            text: 'Okay? OKAY? I was okay before I saw the patterns. Before I counted the stripes. Thirteen bamboo stalks in every mural. Thirteen council seats. Thirteen floors in the deep dungeon. You think that\'s coincidence?',
            choices: [
              { label: 'What patterns?', next: 'patterns' },
              { label: 'Yes, that\'s coincidence', next: 'coincidence' },
              { label: '...I\'m going to go', next: 'leave' }
            ]
          },
          pandas: {
            text: 'Not REAL pandas. The idea of pandas. The CONCEPT. Black and white. Binary. Either you\'re inside the wall or outside. Either you\'re a Hero or you\'re nobody. The panda is the symbol of the false choice. Don\'t you SEE?',
            choices: [
              { label: 'I don\'t see, no', next: 'dont_see' },
              { label: 'Tell me about the dragons', next: 'dragons' },
              { label: 'This is a lot', next: 'a_lot' }
            ]
          },
          a_lot: {
            text: '*nods rapidly* IT IS. It\'s a LOT. Most people can\'t handle the lot-ness of it. They walk away. They go through the arch and eat soup and forget the pandas ever existed. But you\'re still here. Why are you still here?',
            choices: [
              { label: 'Morbid curiosity', next: 'dragons' },
              { label: 'I don\'t know', next: 'silence' },
              { label: 'I\'m leaving', next: null }
            ]
          },
          dont_see: {
            text: 'Of course you don\'t. That\'s the point. The panda sits in the bamboo grove and everyone says "how cute, how peaceful." Nobody asks WHY it sits there. Nobody asks who PLANTED the bamboo. Nobody asks who benefits from the sitting.',
            choices: [
              { label: 'Who planted the bamboo?', next: 'bamboo' },
              { label: 'I think you need rest', next: 'need_rest' }
            ]
          },
          bamboo: {
            text: 'THE DRAGON ELITES. Who else? They grow the bamboo. They breed the pandas. They engineer the ENTIRE ECOSYSTEM so that a black and white bear sits still and eats and produces nothing and EVERYONE THINKS THAT\'S FINE.',
            choices: [
              { label: 'Are we still talking about pandas?', next: 'still_pandas' },
              { label: 'Who are the Dragon Elites?', next: 'dragons' }
            ]
          },
          still_pandas: {
            text: '...Are we? I don\'t... *stares at hands* ...Sometimes I can\'t tell where the metaphor ends and the... the THING starts. Is the panda the system or am I the panda? Am I sitting in bamboo RIGHT NOW?',
            choices: [
              { label: 'You\'re sitting in a shack', next: 'shack' },
              { label: 'Maybe we\'re all pandas', next: 'all_pandas' }
            ]
          },
          shack: {
            text: 'A shack. A cage. A... designated enclosure for a specimen that has been... catalogued and... *trails off* ...I used to be an accountant. Did you know that? I used to have a desk.',
            choices: [
              { label: 'What happened?', next: 'what_happened' },
              { label: 'An accountant?', next: 'accountant' }
            ]
          },
          accountant: {
            text: 'Numbers. I was good at numbers. But then the numbers started showing me things. Patterns in the ledgers. The Foundry\'s quarterly reports. The dungeon loot manifests. It all... it all pointed at the same thing.',
            choices: [
              { label: 'What thing?', next: 'the_thing' },
              { label: 'I think the numbers were just numbers', next: 'just_numbers' }
            ]
          },
          the_thing: {
            text: 'That NONE OF THIS IS REAL. Not the dungeon, not the town, not the Heroes. It\'s a... a LOOP. A constructed cycle designed to keep resources flowing upward while we sit in the bamboo grove and eat and PRODUCE NOTHING.',
            choices: [
              { label: '...', next: 'silence' },
              { label: 'You sound like you need to talk to someone', next: 'need_rest' }
            ]
          },
          just_numbers: {
            text: '*long pause* ...Maybe. Maybe the numbers were just numbers and the pandas are just pandas and I\'m just a man in a shack who looked at a spreadsheet too long. ...But then why do I still see the patterns when I close my eyes?',
            choices: [
              { label: 'I don\'t know', next: 'silence' },
              { label: 'Take care of yourself', next: null }
            ]
          },
          what_happened: {
            text: 'I found a discrepancy. Dungeon reset costs versus Foundry intake volume. The numbers didn\'t match. Thirty percent of hero loot was... unaccounted for. I reported it. Next day, my desk was empty. Week later, I was out here.',
            choices: [
              { label: 'You were fired for finding fraud?', next: 'fired' },
              { label: 'That could just be a clerical error', next: 'clerical' }
            ]
          },
          fired: {
            text: 'Fired. Blacklisted. And then the dreams started. The pandas. Every night, a panda looking at me through bamboo bars. Watching. Chewing. Patient. Like it KNOWS what they did to me. Like it was THERE.',
            choices: [
              { label: 'The panda was in your dreams?', next: 'panda_dream' },
              { label: 'I\'m sorry that happened to you', next: 'sorry' }
            ]
          },
          panda_dream: {
            text: 'Every. Night. Sitting. Chewing. Black eyes. No expression. Just... existing at me. And behind the panda, a dragon. But not a monster-dragon. A SUIT-dragon. Briefcase. Cufflinks. The kind of dragon that signs your termination papers with a fountain pen.',
            choices: [
              { label: 'A dragon in a suit', next: 'suit_dragon' },
              { label: 'Have you talked to anyone about this?', next: 'need_rest' }
            ]
          },
          suit_dragon: {
            text: 'THE DRAGON ELITE. That\'s what they ARE. Not beasts. Executives. They wear the skin of monsters because it makes people think they\'re part of the dungeon. Natural. Inevitable. But they\'re just PEOPLE with SCALES and BAD INTENTIONS.',
            choices: [
              { label: 'I think this is metaphorical', next: 'metaphorical' },
              { label: 'I don\'t think I can help you', next: 'cant_help' }
            ]
          },
          metaphorical: {
            text: '*grabs your arm* Is a metaphor LESS TRUE than the thing it points at? When I say dragon, and you feel FEAR — is the fear metaphorical? When the Foundry takes your livelihood, is the fire that burns you FIGURATIVE?',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          cant_help: {
            text: 'Nobody can. That\'s... *sits back down slowly* ...that\'s the insight, isn\'t it. The pandas can\'t help each other. We just sit in our enclosures and chew. Individual bamboo stalks. Alone.',
            choices: [
              { label: 'You\'re not alone', next: 'not_alone' },
              { label: 'Goodbye', next: null }
            ]
          },
          not_alone: {
            text: '*looks up, eyes wet* ...You\'re kind. The drifter by the campfire said someone new would come through. Said they always do. Come through, pass through, keep going. Nobody stays. Not by choice.',
            choices: [
              { label: 'I have to keep going too', next: 'keep_going' },
              { label: 'Maybe things can change', next: 'change' }
            ]
          },
          keep_going: {
            text: 'I know. Everyone does. Through the arch, into the town, down into the dungeons. The cycle. *mutters* ...panda goes in, panda comes out. Dragon counts the bamboo. World keeps turning.',
            choices: [
              { label: '...take care', next: null }
            ]
          },
          change: {
            text: '*hollow laugh* Change. You know what the panda says about change? ...Nothing. The panda says nothing. Because the panda doesn\'t have a VOICE. That\'s the whole POINT.',
            choices: [
              { label: 'Then maybe we should be something other than pandas', next: 'other' },
              { label: 'I have to go', next: null }
            ]
          },
          other: {
            text: '...Huh. *long silence* Nobody ever said that before. They usually just leave. ...I don\'t know what else to be. I\'ve been a panda so long I forgot. ...What are you?',
            choices: [
              { label: 'A Gleaner, apparently', next: 'gleaner_answer' },
              { label: 'I don\'t know yet', next: 'dont_know' }
            ]
          },
          gleaner_answer: {
            text: 'A janitor for a system that doesn\'t care about you. ...But at least you chose it. The panda never chose the bamboo. ...Go on. Through the arch. Maybe you\'ll find something I couldn\'t.',
            choices: [
              { label: '...', next: null }
            ]
          },
          dont_know: {
            text: '*something shifts behind his eyes* ...Good. Don\'t know. Stay not-knowing as long as you can. The moment you accept a label, the bamboo grows around you. *waves vaguely* ...The dragons are counting.',
            choices: [
              { label: '...', next: null }
            ]
          },
          all_pandas: {
            text: '*STOPS.* *stares at you.* ...Yes. Yes. That\'s what I\'ve been trying to... we\'re ALL pandas. Every single one of us. Eating bamboo we didn\'t plant in a grove we didn\'t choose while the dragons write the reports.',
            choices: [
              { label: 'Who are the Dragon Elites?', next: 'dragons' },
              { label: 'I was joking', next: 'joking' }
            ]
          },
          joking: {
            text: 'Joking. HA. The dragon elites are ALSO joking. That\'s the meta-joke. The whole world is a joke told by a dragon to a panda. And the punchline is... *gestures at everything* ...THIS.',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          dragons: {
            text: 'The ones at the TOP. Not the dungeon dragons — those are puppets, spectacles. I mean the REAL dragons. The ones who designed the Hero cycle. Who decided that some people fight and some people clean. The ones writing the STORY.',
            choices: [
              { label: 'Writing the story?', next: 'story' },
              { label: 'I think you\'ve been alone too long', next: 'alone' }
            ]
          },
          story: {
            text: 'You ever feel like you\'re in a script? Like your choices were written before you made them? Like there\'s a... a THING above all of this, looking down, arranging the tiles? ...That\'s the dragon. That\'s what the dragon IS.',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          alone: {
            text: 'Ha... yeah. Maybe. But loneliness is just... clarity with nobody to dilute it. Out here, in the meadow, with the wind and the shrubs and the bonfires... I can see the edges of the world. And I\'m telling you — they\'re RENDERED.',
            choices: [
              { label: 'Rendered?', next: 'rendered' },
              { label: 'Okay, I\'m leaving', next: null }
            ]
          },
          rendered: {
            text: 'Look at the trees. LOOK at them. Same tree. Same tree. Same TREE. Copy-pasted across the border like someone filled a spreadsheet. The grass? Flat texture. The sky? A PRESET. Cedar, they call it. CEDAR. Why cedar? WHO CHOSE CEDAR?',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          patterns: {
            text: 'The shrubs are all the same height. Every. Single. One. Half a wall. Not natural. DESIGNED. And the bonfire light — it doesn\'t cast real shadows. It APPROXIMATES them. Because the engine can\'t— *catches himself* ...the WORLD can\'t render them properly.',
            choices: [
              { label: 'Are you talking about the world or...', next: 'meta' },
              { label: 'I think those are just shrubs', next: 'just_shrubs' }
            ]
          },
          meta: {
            text: '*whispers* Both. That\'s the secret. The world IS the engine. The dungeon IS the loop. The panda IS the player. We\'re all just... data. Running. In a cycle. Until someone pulls the plug.',
            choices: [
              { label: '...I have to go', next: null }
            ]
          },
          just_shrubs: {
            text: '*sad smile* ...Yeah. Maybe they\'re just shrubs. And maybe I\'m just a man who stared at numbers too long and broke. ...But the pandas, kid. The pandas are REAL. I\'ll die on that hill.',
            choices: [
              { label: 'I believe you', next: 'believe' },
              { label: 'Take care of yourself', next: null }
            ]
          },
          believe: {
            text: '*eyes go wide, then soften* ...Nobody\'s said that to me in... *long pause* ...Don\'t let them make you a panda. Whatever you do in that town. Don\'t. Sit. Down.',
            choices: [
              { label: 'I won\'t', next: null }
            ]
          },
          need_rest: {
            text: 'Rest. *laughs bitterly* Rest is what the bonfire offers. Rest is what the bamboo grove offers. Rest is the panda\'s FUNCTION. I don\'t want rest. I want to WAKE UP.',
            choices: [
              { label: '...', next: 'silence' }
            ]
          },
          sorry: {
            text: '...Don\'t be sorry. Be AWARE. That\'s all I ask. When you go through the arch and everything looks pretty — remember the people out here. Remember that someone counted the bamboo and the numbers didn\'t add up.',
            choices: [
              { label: 'I\'ll remember', next: null }
            ]
          },
          leave: {
            text: 'THAT\'S WHAT THE PANDA WANTS. Walk away. Don\'t engage. Stay in your lane. Eat your bamboo. *voice cracks* ...Everyone leaves. The arch swallows them and they forget. They forget the meadow. They forget ME.',
            choices: [
              { label: '...I\'ll stay a minute', next: 'stay' },
              { label: 'I\'m sorry', next: null }
            ]
          },
          stay: {
            text: '*visibly surprised* ...You will? *sits down, calmer* ...Nobody stays. The road goes east and everyone follows it. Like there\'s a... a pull. A direction built into the floor.',
            choices: [
              { label: 'Tell me about the pandas', next: 'pandas' },
              { label: 'Tell me about the dragons', next: 'dragons' }
            ]
          },
          coincidence: {
            text: 'THERE ARE NO COINCIDENCES. Only patterns too big for small eyes to see! The dragon elites DESIGNED the thirteen-fold structure! Why do you think there are thirteen flavors at the Coral Bazaar? THIRTEEN. TYPES. OF SOUP.',
            choices: [
              { label: 'Soup?', next: 'soup' },
              { label: 'Okay I really need to go', next: null }
            ]
          },
          soup: {
            text: 'Each soup represents a FLOOR of the dungeon! Mushroom broth = Floor 1, natural, earthy. Blood pudding = deep floors, viscera and death. And the thirteenth soup? SECRET MENU. Nobody orders it. Because it\'s not FOR us. It\'s for THE DRAGONS.',
            choices: [
              { label: 'I haven\'t even been to the Bazaar yet', next: 'bazaar' },
              { label: '...I\'m going to leave you to your soups', next: null }
            ]
          },
          bazaar: {
            text: 'Good. GOOD. When you get there, COUNT THE SOUPS. Then come back and tell me I\'m crazy. *leans forward* ...You won\'t come back though. They never come back. The arch is a one-way throat.',
            choices: [
              { label: 'If I find thirteen soups, I\'ll remember you', next: 'remember' },
              { label: 'Goodbye', next: null }
            ]
          },
          remember: {
            text: '*tears up* ...That\'s... *wipes face* ...The panda remembers who feeds it. Even in the grove. Even in the dark. *mutters* ...thirteen soups... thirteen floors... thirteen bamboo stalks...',
            choices: [
              { label: '...', next: null }
            ]
          },
          clerical: {
            text: 'THIRTY PERCENT. Thirty percent is not a clerical error. Thirty percent is a POLICY. Thirty percent is a dragon taking its cut while the pandas count bamboo and call it INDUSTRY.',
            choices: [
              { label: 'What happened after you reported it?', next: 'fired' },
              { label: 'Okay', next: null }
            ]
          },
          silence: {
            text: '*long silence* ...The bonfire is warm, at least. The bonfire doesn\'t lie. The bonfire doesn\'t have a BOARD OF DIRECTORS. *stares into the flames* ...Sometimes I think the fire is the only honest thing left.',
            choices: [
              { label: 'Hang in there', next: null },
              { label: '...', next: null }
            ]
          }
        }
      });

      // ════════════════════════════════════════════════════════════════
      // Floor 1 — The Promenade (Dispatcher + key NPCs)
      // ════════════════════════════════════════════════════════════════

      // ── Dispatcher — REMOVED from NpcSystem tree registry ─────────
      // The Dispatcher gate NPC is fully owned by game.js via
      // _spawnDispatcherGate() and inline dialogue in _openDispatcherDialogue().
      // The NpcSystem definition was also removed from npc-system.js.

      // ── Market Vendor — Coral Bazaar approach ─────────────────────
      NpcSystem.registerTree('floor1_bazaar_vendor', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Welcome to the Bazaar! Well — the front of it, anyway. The good stuff\'s inside. Fresh supplies, dungeon gear, the usual.',
            choices: [
              { label: 'What do you sell?', next: 'sell' },
              { label: 'Tell me about this place', next: 'about' },
              { label: 'Just browsing', next: null }
            ]
          },
          sell: {
            text: 'Trap kits, cleaning solution, light sticks, ration packs. Everything a Gleaner needs to survive a shift. Prices are fair — the Guild subsidizes the basics.',
            choices: [
              { label: 'Browse stock', next: null, effect: { openShop: true, factionId: 'tide' } },
              { label: 'Where\'s the entrance?', next: 'entrance' },
              { label: 'Thanks', next: null }
            ]
          },
          entrance: {
            text: 'Door\'s right behind me. You\'ll need to go inside to browse the full stock. I just handle the overflow out here when the weather\'s nice. Which... is always, actually. Strange, that.',
            choices: [
              { label: 'Always nice weather?', next: 'weather' },
              { label: 'I\'ll check inside', next: null }
            ]
          },
          weather: {
            text: '*looks up at the sky* Same sunset. Every day. You\'d think someone would comment on it more, but people just... don\'t. Anyway! Trap kits! Buy some!',
            choices: [
              { label: '...', next: null }
            ]
          },
          about: {
            text: 'The Promenade\'s been here as long as anyone can remember. Boarding houses, a tavern, the Bazaar. Not a big town, but it\'s ours. Well — theirs. I\'m just a vendor. But it feels like home after a while.',
            choices: [
              { label: 'Who lives here?', next: 'who_lives' },
              { label: 'Thanks', next: null }
            ]
          },
          who_lives: {
            text: 'Gleaners, mostly. Some retired ones, some active. A few Tide clergy, an Admiralty officer or two keeping things orderly. And the Foundry has a rep who checks in. Everyone\'s polite enough. It\'s the kind of quiet you learn not to question.',
            choices: [
              { label: 'Back', next: 'greeting' },
              { label: 'Take care', next: null }
            ]
          }
        }
      });

      // ════════════════════════════════════════════════════════════════
      // Floor 2+ — Deeper NPCs
      // ════════════════════════════════════════════════════════════════

      // Ren — veteran Gleaner at Dispatcher's Office (Floor 2.1)
      NpcSystem.registerTree('dispatch_veteran', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Another new face. You look green. What do you need?',
            choices: [
              { label: 'Tips for the dungeon', next: 'tips' },
              { label: 'What\'s your story?', next: 'backstory' },
              { label: 'Just passing through', next: null }
            ]
          },
          tips: {
            text: 'Clean inward from the entrance. Arm traps and webs on your way out. That way you never walk through your own work. Sounds obvious, but you\'d be surprised how many rookies forget.',
            choices: [
              { label: 'What about the Hero?', next: 'hero_warn' },
              { label: 'Thanks', next: null }
            ]
          },
          hero_warn: {
            text: 'Don\'t get in the Hero\'s way. They move fast, hit hard, and they don\'t distinguish between monsters and bystanders. Your job is the mess they leave behind. Nothing more.',
            choices: [
              { label: 'That doesn\'t seem right', next: 'doubt' },
              { label: 'Understood', next: null }
            ]
          },
          doubt: {
            text: 'Right and wrong don\'t pay the bills, kid. But... yeah. Keep your eyes open down there. Some of us have noticed things that don\'t add up.',
            choices: [
              { label: 'Like what?', next: 'conspiracy_hint' },
              { label: 'I\'ll be careful', next: null }
            ]
          },
          conspiracy_hint: {
            text: 'The corpses on the deep floors. The way the Hero targets specific chambers. The scale fragments that Foundry buys at premium... Ask yourself who benefits from forty years of hero cycles.',
            choices: [
              { label: '...', next: null }
            ]
          },
          backstory: {
            text: 'Twelve years cleaning dungeons. Started same as you - green, underpaid, and convinced the Hero was on our side. Experience teaches you to look closer.',
            choices: [
              { label: 'Tips for the dungeon', next: 'tips' },
              { label: 'Take care', next: null }
            ]
          }
        }
      });

      // Sable — guild clerk at Dispatcher's Office
      NpcSystem.registerTree('dispatch_clerk', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Welcome to the Guild office. Need something?',
            choices: [
              { label: 'Check contracts', next: 'contracts' },
              { label: 'Where\'s the supply closet?', next: 'supplies' },
              { label: 'Who runs this place?', next: 'dispatcher_info' },
              { label: 'Bye', next: null }
            ]
          },
          contracts: {
            text: 'Board\'s on the wall. Red pins are overdue, blue are standard, gold are bonus objectives. Readiness targets are listed per floor. Hit the target before hero day or the payout drops.',
            choices: [
              { label: 'What\'s the best-paying contract?', next: 'best_contract' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          best_contract: {
            text: 'Hero\'s Wake cleanup. But nobody wants it. The deep floors are rough and the Hero leaves behind... well. You\'ll see for yourself.',
            choices: [
              { label: 'I\'ll take it', next: 'brave' },
              { label: 'Maybe later', next: null }
            ]
          },
          brave: {
            text: 'Bold. Check in with the Watchman at Floor 2.2 before heading down. And file your readiness report when you come back up. If you come back up.',
            choices: [
              { label: '...cheerful', next: null }
            ]
          },
          supplies: {
            text: 'Northwest corner. Rags are free, trap kits cost 5g each. Mops and brushes are on the shelf; take what you need. Just sign the ledger.',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          },
          dispatcher_info: {
            text: 'The Dispatcher handles all Gleaner assignments for this district. Former field operative who did twenty years in the deep floors before moving to admin. Don\'t let the desk fool you.',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          }
        }
      });

      // Pip — rookie Gleaner
      NpcSystem.registerTree('dispatch_rookie', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Oh! Hi! You\'re the other new Gleaner, right? I\'m Pip. First week.',
            choices: [
              { label: 'How\'s it going?', next: 'howsitgoing' },
              { label: 'Any advice?', next: 'advice' },
              { label: 'Good luck', next: null }
            ]
          },
          howsitgoing: {
            text: 'Honestly? The mop handle has blisters. The food is bad. And the veteran keeps telling me stories about things in the deep floors. But the pay is okay and... I don\'t know, there\'s something satisfying about it.',
            choices: [
              { label: 'Something satisfying?', next: 'satisfying' },
              { label: 'Hang in there', next: null }
            ]
          },
          satisfying: {
            text: 'Fixing things. Making order out of chaos. The heroes charge through and break everything, and we put it back together. Maybe that\'s more important than anyone gives us credit for.',
            choices: [
              { label: 'Maybe it is', next: null }
            ]
          },
          advice: {
            text: 'I\'ve only been here a week, so take this with a grain of salt... but the old-timers say: don\'t skip the cobweb spots. Even if they seem pointless. The readiness bonus adds up.',
            choices: [
              { label: 'Thanks Pip', next: null }
            ]
          }
        }
      });

      // The Watchman — Floor 2.2 (competent tutorial NPC at dungeon staging)
      // Dynamic root: pre-hose greeting directs player to the truck;
      // post-hose greeting pivots to functionality tips.
      // Cleaning tutorial branches (crates, scrub, books) shared by both paths.
      // Lore threads (Resonance, missing numbers) preserved as secondary branch.
      NpcSystem.registerTree('watchpost_watchman', {
        root: function () {
          return (typeof Player !== 'undefined' && Player.getFlag && Player.getFlag('hoseDiscovered'))
            ? 'greeting_hose'
            : 'greeting';
        },
        nodes: {
          // ── Pre-discovery greeting (default) ──────────────────────
          greeting: {
            text: 'Ah — you must be the new Gleaner. Welcome to the Post. Before you head down: the department cleanup rig is parked outside on Lantern Row. Big flatbed, Guild markings. Grab the hose off the side — you\'ll need it for the heavy stuff.',
            choices: [
              { label: 'Where exactly is the rig?', next: 'hose_location' },
              { label: 'What happened here?', next: 'whathappened' },
              { label: 'Dispatcher sent me to clean up', next: 'dispatched' },
              { label: 'Just passing through', next: 'passing' }
            ]
          },
          hose_location: {
            text: 'Head back out the door behind you, down to street level. The truck should be right there on the road — two-tile flatbed with a hose reel mounted on the side. Face it and grab the hose. It\'ll trail behind you when you come back in.',
            choices: [
              { label: 'What does it do?', next: 'hose_preview' },
              { label: 'Got it. I\'ll grab it.', next: 'sendoff' },
              { label: 'What else should I know?', next: 'assignment' }
            ]
          },
          hose_preview: {
            text: 'The hose is for deep cleaning — grime baked into the stone, scorch marks, the kind of filth a rag won\'t touch. It runs on your energy though, and the longer the line trails behind you the heavier it drags. Grab it, haul it in, do the heavy work first, then roll it up when you\'re done.',
            choices: [
              { label: 'Anything else down there?', next: 'assignment' },
              { label: 'Heading out to grab it now', next: 'sendoff' }
            ]
          },

          // ── Post-discovery greeting (player has the hose) ─────────
          greeting_hose: {
            text: 'Good — you\'ve got the rig\'s hose. Smart. Most rookies skip it and regret it two floors down. Let me tell you how to get the most out of it before you head in.',
            choices: [
              { label: 'How does the hose work?', next: 'hose_basics' },
              { label: 'I know how it works', next: 'assignment' },
              { label: 'What happened here?', next: 'whathappened' }
            ]
          },
          hose_basics: {
            text: 'It trails behind you as you walk — every tile you cross lays more line. The longer the line, the more energy it costs to drag. Face a grimy wall or floor and spray to clean it in one pass. Much faster than a rag, but it\'ll tire you out quicker too.',
            choices: [
              { label: 'What are kinks?', next: 'hose_kinks' },
              { label: 'How do I roll it up?', next: 'hose_reel' },
              { label: 'Good enough. What else?', next: 'assignment' }
            ]
          },
          hose_kinks: {
            text: 'If your path crosses itself — doubling back through a tile you already walked — the line kinks. Each kink drops your water pressure and costs extra energy per step. Plan your route through the dungeon so you\'re not retracing. Think of it like mopping: work in one direction.',
            choices: [
              { label: 'How do I roll it up?', next: 'hose_reel' },
              { label: 'Back to the assignment', next: 'assignment' }
            ]
          },
          hose_reel: {
            text: 'When you\'re done spraying — or when your energy runs low — the hose reels itself back in and you retrace your path to the truck automatically. Free exit. If your energy hits zero before you reel up, it forces the reel. Either way you end up back at the truck.',
            choices: [
              { label: 'What about kinks?', next: 'hose_kinks' },
              { label: 'Got it. What else?', next: 'assignment' }
            ]
          },

          // ── Shared nodes (both greeting paths converge here) ──────
          whathappened: {
            text: 'What always happens. A party of adventurers kicked the door in last night — didn\'t even try the handle, of course — charged downstairs, and left a trail of carnage behind them. Standard Tuesday.',
            choices: [
              { label: 'They broke the door?', next: 'door' },
              { label: 'Carnage?', next: 'carnage' },
              { label: 'What do I do now?', next: 'assignment' }
            ]
          },
          dispatched: {
            text: 'Good. Ren from Dispatch already came through and handled the... sensitive material. Bodies, contraband, anything the Guild doesn\'t want a rookie tripping over. What\'s left is the grunt work — and that\'s you.',
            choices: [
              { label: 'What kind of grunt work?', next: 'assignment' },
              { label: 'Sensitive material?', next: 'sensitive' },
              { label: 'Got it. Heading down.', next: 'sendoff' }
            ]
          },
          passing: {
            text: 'Nobody passes through here. This is a dead end — literally. Stairs go down, adventurers go down, and Gleaners go down after them to clean up the mess. If Dispatch sent you, you\'re in the right place.',
            choices: [
              { label: 'Fine. What\'s the job?', next: 'assignment' },
              { label: '...fair enough', next: 'assignment' }
            ]
          },
          door: {
            text: 'Smashed clean off the hinges. The Dispatcher told you it was locked, right? It wasn\'t. Hasn\'t been locked since the last party came through and decided a door was an insult to their heroic destiny. I stopped replacing it.',
            choices: [
              { label: 'So the fetch quest was pointless', next: 'fetchquest' },
              { label: 'What do I do now?', next: 'assignment' }
            ]
          },
          fetchquest: {
            text: 'Welcome to bureaucracy. Dispatch sends you for keys to a door that isn\'t locked, then sends you here to clean a dungeon that\'s already been triaged. The system works. Mostly. Anyway — you\'re here now, and the floors below need attention.',
            choices: [
              { label: 'What needs doing?', next: 'assignment' },
              { label: 'Who triaged it?', next: 'sensitive' }
            ]
          },
          carnage: {
            text: 'Adventurers don\'t tidy up after themselves. Smashed crates, scattered inventory, scorch marks on the walls, half-eaten rations everywhere. Some floors look like a tavern brawl hit a warehouse. That\'s what you\'re here for.',
            choices: [
              { label: 'How do I clean all that?', next: 'assignment' },
              { label: 'Were there casualties?', next: 'casualties' }
            ]
          },
          casualties: {
            text: 'On the adventurer side? Not this time — they were high-level. On the other side... let\'s just say Ren from Dispatch already handled that part. What\'s left for you is property damage, not body recovery.',
            choices: [
              { label: 'Ren handled it?', next: 'sensitive' },
              { label: 'Right. What\'s the job?', next: 'assignment' }
            ]
          },
          sensitive: {
            text: 'Ren\'s a veteran Gleaner — been with the Guild twenty years. Anything the Guild classifies as above your clearance, she bags and tags before you arrive. Corpses, artifacts, anything that hums. Don\'t worry about what she took. Worry about what she left.',
            choices: [
              { label: 'Anything that hums?', next: 'hum_hint' },
              { label: 'What did she leave?', next: 'assignment' }
            ]
          },
          hum_hint: {
            text: 'Mmm. Probably nothing. The deep floors have a background vibration — something in the stone. Old-timers call it the Resonance. Used to be steady. Lately it... isn\'t. But that\'s above both our pay grades.',
            choices: [
              { label: 'The Resonance?', next: 'resonance' },
              { label: 'Back to the job', next: 'assignment' }
            ]
          },
          resonance: {
            text: 'Like something breathing far below. Or singing very quietly. I\'ve been posted here eighteen years, and it\'s always been there. But after the last party went through... it stuttered. First time ever. I put it in my report. Nobody replied.',
            choices: [
              { label: '...', next: 'assignment' },
              { label: 'I\'ll keep my ears open', next: 'assignment' }
            ]
          },
          assignment: {
            text: 'Three things you can do down there: restock the supply crates before the next wave of adventurers ransacks them, scrub walls and floors — the basics — or study up on advanced techniques. Your choice where to start.',
            choices: [
              { label: 'How do I restock crates?', next: 'crates' },
              // Pre-discovery: point player to the hose they haven't grabbed
              { label: 'Where\'s the hose?', next: 'hose_location', showIf: { flag: 'hoseDiscovered', value: false } },
              // Post-discovery: offer tips on the hose they already have
              { label: 'Hose tips?', next: 'hose_basics', showIf: { flag: 'hoseDiscovered' } },
              { label: 'How do I scrub?', next: 'scrub' },
              { label: 'Study up?', next: 'books' },
              { label: 'All three. Got it.', next: 'sendoff' }
            ]
          },
          crates: {
            text: 'Find a smashed crate, interact with it. If you\'ve got the right restocking materials in your bag, the crate refills automatically. Materials come from shops on the Promenade or from salvage you pick up along the way. Each restocked crate earns you pay and bumps the floor\'s readiness score.',
            choices: [
              { label: 'What about scrubbing?', next: 'scrub' },
              { label: 'And the books?', next: 'books' },
              { label: 'Good enough. Heading down.', next: 'sendoff' }
            ]
          },
          scrub: {
            text: 'Cobwebs, grime, scorch marks — interact with a dirty tile to clean it. For the heavier stuff, the pressure hose on the cleanup rig handles it in one pass. Much faster than elbow grease.',
            choices: [
              { label: 'Where\'s the cleanup rig?', next: 'hose_location', showIf: { flag: 'hoseDiscovered', value: false } },
              { label: 'Hose tips?', next: 'hose_basics', showIf: { flag: 'hoseDiscovered' } },
              { label: 'What about restocking?', next: 'crates' },
              { label: 'And the books?', next: 'books' },
              { label: 'Got it. Heading down.', next: 'sendoff' }
            ]
          },
          books: {
            text: 'There\'s a shelf down the hall with field manuals. Dungeon Hygiene Standards, Crate Inventory Protocol, that kind of thing. Dry reading, but the techniques in there will make your job faster. Some of the advanced methods — fire suppression, trap re-arming — you can only learn from the books.',
            choices: [
              { label: 'How do I restock crates?', next: 'crates' },
              { label: 'What about scrubbing?', next: 'scrub' },
              { label: 'I\'ll read up. Thanks.', next: 'sendoff' }
            ]
          },
          sendoff: {
            text: 'Stairs are at the back of the post. Watch your step going down — the adventurers cracked a few of those too. And Gleaner? Don\'t be a hero. Clean the floors, collect your pay, come back alive. That\'s the job.',
            choices: [
              { label: 'Copy that', next: null },
              { label: 'Any last advice?', next: 'advice' }
            ]
          },
          advice: {
            text: 'Don\'t skip the corners — readiness inspectors check everything. Restock before you scrub; it\'s easier to clean around full crates than empty ones. And if you hear something moving in the dark? Walk the other way. The things the Hero left alive are the things the Hero couldn\'t be bothered to kill. Think about what that means.',
            choices: [
              { label: 'Understood', next: null }
            ]
          }
        }
      });

      // ── Interior resident dialogue trees ─────────────────────────
      // "Get out of my house" pattern — annoyed → angry escalation.
      // Repeated visits push to angrier nodes.

      // Innkeeper Marlo — Driftwood Inn (1.2)
      NpcSystem.registerTree('inn_keeper', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Welcome to the Driftwood. Room or a meal?',
            choices: [
              { label: 'What is this place?', next: 'building' },
              { label: 'What\'s on the menu?', next: 'menu' },
              { label: 'A room for the night', next: 'room' },
              { label: 'Heard any rumors?', next: 'rumors' },
              { label: 'About the cellar rats\u2026', next: 'rat_report' },
              { label: 'Just browsing', next: null }
            ]
          },
          building: {
            text: 'The Driftwood Inn. Oldest standing building on the Promenade. Built from shipwreck timber before the Compact was even signed. I\'m Marlo. Third generation innkeeper. My grandmother opened the bar. I inherited the debt.',
            choices: [
              { label: 'Shipwreck timber?', next: 'timber' },
              { label: 'What\u2019s on the shelves?', next: 'bookshelf' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          timber: {
            text: 'The founding fleet. Three ships made it into the cove. None of them left. The Driftwood is literally built from their hulls. You can see the old rivet lines if you look at the ceiling beams.',
            choices: [
              { label: 'Why didn\u2019t they leave?', next: 'didnt_leave' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          didnt_leave: {
            text: 'That\u2019s the question, isn\u2019t it? Official story is the cove entrance collapsed. Natural rockfall. Convenient rockfall, if you ask the conspiracy crowd. Either way, the settlers adapted. Built a town in a cave system. Here we are.',
            choices: [
              { label: 'Conspiracy crowd?', next: 'conspiracy' },
              { label: 'Huh', next: null }
            ]
          },
          conspiracy: {
            text: 'Every settlement has them. Ours say the cave-in wasn\u2019t natural; it was part of the Compact. The dragons sealed us in so we\u2019d have to maintain the caves. The Archivist at the Bazaar feeds this stuff. Check the bookshelves there if you want to go down that rabbit hole.',
            choices: [
              { label: 'Interesting...', next: null }
            ]
          },
          bookshelf: {
            text: 'Guest journals, mostly. Travelers write their stories. Some are funny, some are sad, some are suspiciously detailed about the cave layout. There\u2019s also a few volumes of local history. The Dragon Compact chapter is dog-eared. Popular reading.',
            choices: [
              { label: 'I\u2019ll check them out', next: null },
              { label: 'Back', next: 'greeting' }
            ]
          },
          menu: {
            text: 'Seaweed stew, bread, and whatever the Cellar coughed up this morning. The stew is medicinal. The bread is not.',
            choices: [
              { label: 'I\'ll have the stew', next: 'buy_stew' },
              { label: 'No thanks', next: 'greeting' }
            ]
          },
          buy_stew: {
            text: 'Five gold. Heals what ails you. Mostly.',
            choices: [
              { label: 'Buy stew (-5g)', next: 'stew_bought', effect: { currency: -5, heal: 3 } },
              { label: 'Too rich for me', next: 'greeting' }
            ]
          },
          stew_bought: {
            text: 'Good choice. Take a seat anywhere... except table three. That\'s reserved for the Hero. Don\'t ask.',
            choices: [
              { label: 'Thanks', next: null }
            ]
          },
          room: {
            text: 'Rooms are upstairs but they\'re booked solid through hero day. Heroes get priority. Gleaners get the cot in the corner if you\'re desperate.',
            choices: [
              { label: 'The cot is fine', next: 'cot' },
              { label: 'Never mind', next: null }
            ]
          },
          cot: {
            text: 'It\'s three gold for the cot. Blanket\'s extra.',
            choices: [
              { label: 'Rest (-3g)', next: 'rested', effect: { currency: -3, heal: 5 } },
              { label: 'Pass', next: null }
            ]
          },
          rested: {
            text: 'Sleep well. I\'ll wake you at dawn. Or whenever the Hero starts breaking things, whichever comes first.',
            choices: [
              { label: 'Thanks', next: null }
            ]
          },
          rumors: {
            text: 'Rumors? This is an inn, not a spy network. But since you\'re buying...',
            choices: [
              { label: 'I\'m buying', next: 'rumor_detail' },
              { label: 'Forget it', next: null }
            ]
          },
          rumor_detail: {
            text: 'The Watchman at 2.2 hasn\'t slept in three days. The Hero this cycle isn\'t normal; goes straight to the deep floors, skips everything above. And someone from the Tide Council was asking about old maps.',
            choices: [
              { label: 'Old maps?', next: 'maps' },
              { label: 'Interesting. Thanks.', next: null }
            ]
          },
          maps: {
            text: 'Cave system maps from before the Compact. Pre-hero era. I\'m not supposed to know that, and you\'re definitely not supposed to know that. Enjoy your meal.',
            choices: [
              { label: '...', next: null }
            ]
          },
          // ── DOC-107 Phase 5b: rat_report branch ──────────────────────
          // Landing node for innkeeper_bottles step.4 predicate
          // {kind:'npc', npcId:'inn_keeper', branch:'rat_report'}.
          // status-bar.js fires onNpcTalk(inn_keeper, 'rat_report') on
          // render; QuestChain advances step.4 only when currentStep
          // matches (i.e., after 3 ENM-003 kills in 1.3.1 cleared step.3).
          // Safe to visit prematurely — predicate won't match wrong step.
          rat_report: {
            text: 'Marlo leans an elbow on the bar. So \u2014 the cellar. You actually went down? What\'s the rat count?',
            choices: [
              { label: 'Three confirmed. Cellar\'s lighter.', next: 'rat_report_paid' },
              { label: 'Still down there. Working on it.', next: 'rat_report_pending' },
              { label: 'Later.', next: 'greeting' }
            ]
          },
          rat_report_paid: {
            text: 'Three. Good. That tracks with the bite marks on the vintage. Marlo slides a small stack across the bar. Don\'t tell the Watchman where the coin came from \u2014 he thinks the cellar\'s dry.',
            choices: [
              { label: 'Pleasure doing business.', next: null },
              { label: 'Any more work?', next: 'rumors' }
            ]
          },
          rat_report_pending: {
            text: 'Then we\'re not done. Three at a minimum \u2014 I want bottles on the shelves, not teeth on the barrels. Get back down there before I\'m out of pinot.',
            choices: [
              { label: 'On it.', next: null },
              { label: 'Back', next: 'greeting' }
            ]
          }
        }
      });

      // Grumpy Patron — "get out" escalation tree
      NpcSystem.registerTree('inn_patron_grumpy', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'What? I\'m eating. Go clean something.',
            choices: [
              { label: 'Sorry to bother you', next: 'apologize' },
              { label: 'Nice to meet you too', next: 'sarcasm' },
              { label: 'Leave', next: null }
            ]
          },
          apologize: {
            text: 'Hmph. You Gleaners are always poking around where you don\'t belong. There\'s nothing here for you. The dungeon is that way.',
            choices: [
              { label: 'You seem upset', next: 'upset' },
              { label: 'Right. Sorry.', next: null }
            ]
          },
          sarcasm: {
            text: 'Oh, a comedian. Great. Just what this town needs... another wise-guy with a mop. Get lost before I call the Admiralty.',
            choices: [
              { label: 'Easy. I\'m going.', next: null },
              { label: 'What\'s your problem?', next: 'problem' }
            ]
          },
          upset: {
            text: 'Upset? My cellar is full of hero damage, my walls smell like smoke, and now a stranger is standing over my lunch asking about my feelings. Yes. I\'m upset.',
            choices: [
              { label: 'I can help with the cellar', next: 'offer_help' },
              { label: 'Fair enough', next: null }
            ]
          },
          problem: {
            text: 'My PROBLEM is that every cycle, heroes smash through this town like it\'s made of cardboard, and the rest of us are supposed to smile and say thank you. Now get out of my face.',
            choices: [
              { label: 'You\'re not wrong', next: 'notwrong' },
              { label: 'Leaving now', next: null }
            ]
          },
          offer_help: {
            text: '...you can fix cellar damage? Huh. Most Gleaners only work Guild contracts. Maybe you\'re different.',
            choices: [
              { label: 'Maybe I am', next: null }
            ]
          },
          notwrong: {
            text: '...no. I\'m not. But saying it out loud doesn\'t fix anything either. Go on. Do your job. At least someone\'s cleaning up.',
            choices: [
              { label: 'Take care', next: null }
            ]
          }
        }
      });

      // ── Coral Bazaar NPCs (Floor 1.1) ────────────────────────────

      // Coral Merchant — market vendor, building explainer, scale trade
      NpcSystem.registerTree('bazaar_merchant', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Fresh coral, scale fragments, hero salvage. Best prices on the Promenade. What brings you to the Bazaar?',
            choices: [
              { label: 'What is this place?', next: 'building' },
              { label: 'What do you sell?', next: 'wares' },
              { label: 'Heard anything interesting?', next: 'lore' },
              { label: 'Just looking', next: null }
            ]
          },
          building: {
            text: 'The Coral Bazaar. Only licensed market in the settlement. We deal in everything the heroes drag up and the Gleaners haul out. Tide Council regulates prices. Admiralty taxes the rest.',
            choices: [
              { label: 'Who runs it?', next: 'who_runs' },
              { label: 'What are the bookshelves for?', next: 'bookshelf' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          who_runs: {
            text: 'Officially? The Tide Council holds the charter. Practically? Whoever has scale fragments to trade sets the market. Before the Compact the merchants ran themselves. Now everything goes through the Council first.',
            choices: [
              { label: 'The Compact again...', next: 'compact' },
              { label: 'Thanks', next: null }
            ]
          },
          bookshelf: {
            text: 'Import records, price histories, vendor catalogs. Dry reading unless you care about where the money goes. Check the shelves if you want to understand the economy here. Tells you more than anyone will say out loud.',
            choices: [
              { label: 'I\'ll take a look', next: null },
              { label: 'Back', next: 'greeting' }
            ]
          },
          wares: {
            text: 'Scale fragments for crafting, dried coral for alchemy, hero salvage for the ambitious. I also buy dungeon scrap if your pockets are heavy. Everything is priced by the piece.',
            choices: [
              { label: 'Scale fragments?', next: 'scales' },
              { label: 'Hero salvage?', next: 'salvage' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          scales: {
            text: 'Dragon scales. Fragment-sized, mostly. The deeper floors shed them. Nobody knows why. The Tide Council claims mineral deposits; the Foundry says it\u2019s something alive down there. Either way, they\u2019re valuable.',
            choices: [
              { label: 'Something alive?', next: 'alive' },
              { label: 'Interesting', next: null }
            ]
          },
          alive: {
            text: 'I don\u2019t get paid to speculate. But the scales are warm when they come up fresh. Make of that what you will.',
            choices: [
              { label: '...noted', next: null }
            ]
          },
          salvage: {
            text: 'Broken weapons, torn armor, singed pouches. Heroes leave a trail. The Guild labels it "hazardous waste" and the Gleaners are supposed to dispose of it, but between you and me... some of it\u2019s perfectly usable.',
            choices: [
              { label: 'I\u2019ll keep that in mind', next: null }
            ]
          },
          lore: {
            text: 'Interesting? In this town? Ha. Well... the Foundry\u2019s been buying triple their usual scale order. And someone at the Admiralty is asking about the old cave surveys. The ones from before the Compact.',
            choices: [
              { label: 'Before the Compact?', next: 'compact' },
              { label: 'The Foundry is stockpiling?', next: 'foundry' },
              { label: 'Hmm', next: null }
            ]
          },
          compact: {
            text: 'The Dragon Compact. Treaty that established the hero cycle, the Guild, the whole system. Couple hundred years old. Nobody reads it anymore but it\u2019s the legal foundation for everything. The Archivist over there knows more.',
            choices: [
              { label: 'I\u2019ll ask them', next: null },
              { label: 'Thanks', next: null }
            ]
          },
          foundry: {
            text: 'Three times the usual quantity of scale fragments. Whatever they\u2019re building, it isn\u2019t small. The Admiralty\u2019s nervous. When the Admiralty gets nervous, prices go up. Bad for business.',
            choices: [
              { label: 'Sounds political', next: null }
            ]
          }
        }
      });

      // Bazaar Archivist — lore keeper, bookshelf champion, Compact expert
      NpcSystem.registerTree('bazaar_archivist', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Hmm? Oh. Hello. I was cataloguing the import manifests. Do you need something, or are you here to browse the records?',
            choices: [
              { label: 'What do you do here?', next: 'role' },
              { label: 'Tell me about the bookshelves', next: 'bookshelves' },
              { label: 'What is the Dragon Compact?', next: 'compact_intro' },
              { label: 'Sorry to interrupt', next: null }
            ]
          },
          role: {
            text: 'I maintain the Bazaar\u2019s records. Trade volumes, price histories, council minutes. Everything that passes through this market gets documented. The Tide Council requires it. I happen to find it fascinating.',
            choices: [
              { label: 'The Tide Council?', next: 'tide' },
              { label: 'You enjoy record-keeping?', next: 'enjoy' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          enjoy: {
            text: 'Records don\u2019t lie. People do, heroes do, the Council certainly does. But the numbers tell you what actually happened. Trends reveal intent. If you want to understand this settlement, read the ledgers.',
            choices: [
              { label: 'Where can I read them?', next: 'bookshelves' },
              { label: 'Fair point', next: null }
            ]
          },
          bookshelves: {
            text: 'The shelves along the walls hold everything. Import records sorted by season, price indexes by commodity, vendor licenses. The older volumes near the back door date to the early Compact period. Those are the interesting ones.',
            choices: [
              { label: 'Early Compact? How so?', next: 'early_compact' },
              { label: 'I\u2019ll browse them', next: null }
            ]
          },
          early_compact: {
            text: 'The first century of trade records shows a settlement that was genuinely afraid. Prices for fortification materials were astronomical. Scale fragment trade didn\u2019t exist yet. The dragons were still... present. Not just an echo in the deep floors.',
            choices: [
              { label: 'Dragons were here?', next: 'dragons' },
              { label: 'When did scale trade begin?', next: 'scale_trade' },
              { label: 'Fascinating', next: null }
            ]
          },
          dragons: {
            text: 'The Compact exists for a reason. It was a treaty of coexistence. The settlement founders negotiated access to the cave system in exchange for... something. The terms are sealed in the Council vault. I\u2019ve only seen summaries.',
            choices: [
              { label: 'In exchange for what?', next: 'exchange' },
              { label: 'Where is the original?', next: 'vault' },
              { label: 'Heavy stuff', next: null }
            ]
          },
          exchange: {
            text: 'That\u2019s the question, isn\u2019t it? The summaries say "custodial obligations." The hero cycle, the cleaning, the readiness system\u2014it might all be part of the bargain. We maintain the caves and in return...',
            choices: [
              { label: 'In return?', next: 'in_return' }
            ]
          },
          in_return: {
            text: 'In return, we\u2019re allowed to live here. That\u2019s one reading. The Admiralty\u2019s reading is different. They say the Compact grants dominion, not tenancy. The distinction matters rather a lot.',
            choices: [
              { label: '...', next: null }
            ]
          },
          vault: {
            text: 'The Tide Council building. Supposedly in a fire-proof vault below the council chamber. I\u2019ve applied for research access six times. Denied each time. The Archivist before me? Also denied. Make of that what you will.',
            choices: [
              { label: 'Suspicious', next: null }
            ]
          },
          scale_trade: {
            text: 'About eighty years after the Compact. The first Gleaners started finding fragments during routine cleaning. The Foundry figured out they had useful properties. Within a decade, scales were the settlement\u2019s primary export. The economy shifted overnight.',
            choices: [
              { label: 'Useful properties?', next: 'properties' },
              { label: 'Thanks', next: null }
            ]
          },
          properties: {
            text: 'Heat resistance, structural integrity, some say mild luminescence under pressure. The Foundry guards the specifics. What I know is that demand outstrips supply by a factor of three and the deep floors are the only source.',
            choices: [
              { label: 'The deep floors...', next: null }
            ]
          },
          compact_intro: {
            text: 'The founding treaty of this settlement. Signed approximately two hundred years ago between the original settlers and... well, the other party is variously described as "the cave custodians," "the fire council," or simply "them." Euphemisms.',
            choices: [
              { label: 'Dragons', next: 'dragons' },
              { label: 'What does the Compact say?', next: 'compact_terms' },
              { label: 'Who has the original?', next: 'vault' }
            ]
          },
          compact_terms: {
            text: 'Three pillars, as summarised in the council minutes. First: the settlement may occupy the surface and upper cave levels. Second: the hero cycle operates on a fixed schedule as an "inspection protocol." Third: custodial maintenance is the settlement\u2019s obligation.',
            choices: [
              { label: 'Custodial maintenance... that\u2019s us', next: 'thats_us' },
              { label: 'Inspection protocol?', next: 'inspection' }
            ]
          },
          thats_us: {
            text: 'Precisely. Gleaners. We clean, restock, repair. The heroes "inspect." Whether they\u2019re inspecting on behalf of the settlement or on behalf of the other party depends on which faction you ask.',
            choices: [
              { label: 'Heavy', next: null }
            ]
          },
          inspection: {
            text: 'The hero cycle. Every few days, designated combatants enter the caves and... test the defenses. Readiness. If the dungeon passes inspection, the cycle continues peacefully. If it doesn\u2019t...',
            choices: [
              { label: 'If it doesn\u2019t?', next: 'if_not' }
            ]
          },
          if_not: {
            text: 'Nobody alive has seen a failed Compact cycle. The records from the early period suggest the consequences were... significant. Structural. The older ledgers mention "subsidence events." I suspect that\u2019s a polite word for cave-ins.',
            choices: [
              { label: '...I should get back to work', next: null }
            ]
          },
          tide: {
            text: 'One of the three factions. They control trade, the market charter, and the vault where the original Compact is kept. Merchant-political class. The Foundry builds, the Admiralty governs, and the Tide... manages the money.',
            choices: [
              { label: 'Three factions', next: 'factions' },
              { label: 'Got it', next: null }
            ]
          },
          factions: {
            text: 'Tide Council, Foundry Guild, and the Admiralty. They share power. Barely. The hero cycle keeps the balance because all three need the caves maintained. Without Gleaners, the system collapses. That\u2019s your leverage, by the way.',
            choices: [
              { label: 'Good to know', next: null }
            ]
          }
        }
      });

      // Cellar Owner — Floor 1.3 (nervous, defensive, building explainer)
      NpcSystem.registerTree('cellar_resident', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: 'Oh! You startled me. Are you from the Guild? Please tell me you\'re from the Guild.',
            choices: [
              { label: 'I\'m a Gleaner, yes', next: 'relief' },
              { label: 'What is this building?', next: 'building' },
              { label: 'What\'s wrong?', next: 'whats_wrong' },
              { label: 'Just passing through', next: 'passing' }
            ]
          },
          building: {
            text: 'It\u2019s the storm shelter. Civic infrastructure. When the hero cycle goes bad and the tremors start, everyone comes down here. The cellar beneath connects to the cave system. Used to be a storage depot before the Guild repurposed it.',
            choices: [
              { label: 'The tremors?', next: 'tremors' },
              { label: 'What\u2019s on those shelves?', next: 'bookshelf' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          tremors: {
            text: 'When readiness drops too low, the deep floors respond. Subtle at first\u2014loose stones, dust from the ceiling. The old-timers say a full failure would collapse the upper levels entirely. That\u2019s why the Guild exists. That\u2019s why YOU exist.',
            choices: [
              { label: 'No pressure', next: 'no_pressure' },
              { label: 'Has it ever happened?', next: 'ever_happened' }
            ]
          },
          no_pressure: {
            text: 'Ha. Right. No pressure. Just the structural integrity of the entire settlement riding on whether you mopped the floors properly. Welcome to public service.',
            choices: [
              { label: '...', next: null }
            ]
          },
          ever_happened: {
            text: 'Not in living memory. But the records mention "subsidence events" in the early Compact period. Whole sections of cave system sealed off. The Archivist at the Bazaar can tell you more. I just want my walls to stop cracking.',
            choices: [
              { label: 'I\u2019ll look into it', next: null }
            ]
          },
          bookshelf: {
            text: 'Guild manuals. Maintenance protocols, trap disarmament guides, cleaning solvent recipes. Dry but useful. There\u2019s also a copy of the emergency procedures charter. Read it. Seriously. If the tremors start, you need to know the evacuation routes.',
            choices: [
              { label: 'I\u2019ll read them', next: null },
              { label: 'Back', next: 'greeting' }
            ]
          },
          relief: {
            text: 'Thank goodness. The cellar below... something happened. After the last hero party came through. I sealed the door but there are sounds. Please, if you\'re going down, be careful.',
            choices: [
              { label: 'What kind of sounds?', next: 'sounds' },
              { label: 'I\'ll handle it', next: null }
            ]
          },
          whats_wrong: {
            text: 'The cellar! My cellar! The hero party tore through it like a storm. Traps triggered, walls scorched, crates smashed. And now there are... noises. From below.',
            choices: [
              { label: 'I\'ll clean it up', next: 'relief' },
              { label: 'Noises?', next: 'sounds' }
            ]
          },
          sounds: {
            text: 'Scraping. Like stone on stone. And sometimes... a low hum. The old folks say the cellars connect to something deeper. Something the Compact was supposed to protect.',
            choices: [
              { label: 'The Compact', next: 'compact' },
              { label: 'I\'ll check it out', next: null }
            ]
          },
          compact: {
            text: 'The Dragon Compact. Old treaty between the town founders and... well, nobody reads it anymore. The Tide Council has the original. Ask them if you\'re curious. I just want my cellar back.',
            choices: [
              { label: 'I\'ll do what I can', next: null }
            ]
          },
          passing: {
            text: 'Just... please don\'t touch anything. And close the cellar door behind you if you go down. I don\'t want whatever\'s down there coming up here.',
            choices: [
              { label: 'Understood', next: null }
            ]
          }
        }
      });

      // ── Floor 3 — Immigrant Inspector (Vivec arch gate) ─────────────
      // Stationary checkpoint NPC at (48,25) blocking the Grand Arch to
      // Floor 4. Checks the player's journal for a `rent_receipt_book`
      // entry (proof of residence) before stamping papers. Actual unlock
      // wiring is handled elsewhere — see NpcSystem.getGateCheck().
      NpcSystem.registerTree('floor3_inspector', {
        root: 'greeting',
        nodes: {
          greeting: {
            text: '\uD83D\uDEC2 "Halt. This is the Grand Arch crossing. No one passes to Vivec without proof of residence. Utility bill, rent receipt, lease — something stamped, something recent. Show me your papers."',
            choices: [
              { label: 'Show rent receipt', next: 'check_papers' },
              { label: 'What counts as proof?', next: 'requirements' },
              { label: 'Why is the gate locked?', next: 'why_locked' },
              { label: 'What\u2019s on the other side?', next: 'whats_beyond' },
              { label: 'I\u2019ll be back', next: null }
            ]
          },
          requirements: {
            text: '"Anything that puts your name on a roof in this district. A stamped rent receipt from the safehouse landlord is the fastest. The pay-rent ledger issues a receipt book — bring that, open to the current week, and I can stamp you through. No receipt, no crossing."',
            choices: [
              { label: 'Where do I pay rent?', next: 'where_pay' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          where_pay: {
            text: '"Safehouse on Lantern Row. The landlord keeps the ledger. Pay the week, get the stamp, bring it back here. I don\u2019t care how you earn it — Guild contract, scavenge, shopkeep charity. Just don\u2019t miss the deadline. The archway closes for late payers at end of week two."',
            choices: [
              { label: 'Understood', next: null }
            ]
          },
          why_locked: {
            text: '"Vivec doesn\u2019t take drifters. Every soul that crosses has to be accounted for — taxed, logged, housed. If we let unpapered travelers through, the city\u2019s census collapses and the Admiralty stops funding the arch. So the arch stays locked. The paperwork is the gate."',
            choices: [
              { label: 'Seems bureaucratic', next: 'bureaucratic' },
              { label: 'Back', next: 'greeting' }
            ]
          },
          bureaucratic: {
            text: '"Bureaucracy is what separates a city from a camp. The crowd behind you — they\u2019d tell you the same if they weren\u2019t so tired of telling it."',
            choices: [
              { label: '...', next: null }
            ]
          },
          whats_beyond: {
            text: '"Vivec. Proper city. Canals, towers, light that doesn\u2019t come from a bonfire. If you make it across before the deadline you\u2019ll see it with your own eyes. If you don\u2019t — well. That\u2019s not my problem to carry."',
            choices: [
              { label: 'Back', next: 'greeting' }
            ]
          },
          check_papers: {
            // TODO: Wire to Journal.hasBook(\'rent_receipt_book\') — on success
            // set flags \'locked_door_3:51,25\' and \'locked_door_3:51,26\' and
            // route to `accepted`. On failure route to `rejected`. Until
            // wired, always routes to `rejected` as a stub (see gateCheck
            // tag on NpcSystem floor3_inspector def).
            text: '"Let me see... hm. I don\u2019t see a rent receipt in your journal. No stamp, no crossing. Come back when you\u2019ve paid your week."',
            choices: [
              { label: 'I\u2019ll pay and return', next: null }
            ]
          },
          rejected: {
            text: '"No receipt. Move aside — there are people behind you."',
            choices: [
              { label: '...', next: null }
            ]
          },
          accepted: {
            text: '\uD83D\uDEC2\u2705 "Stamped. The arch is open to you. Don\u2019t lose the receipt — you\u2019ll need it on the Vivec side too. Safe crossing, citizen."',
            choices: [
              { label: 'Thank you', next: null }
            ]
          }
        }
      });
  }

  // ──────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────

  return {
    registerAll: registerAll
  };

})();

/**
 * English string table — all user-facing UI text.
 *
 * Layer 5 (data, loaded after all engine modules). Registers strings
 * with i18n for the 'en' locale. Every string key used in the engine
 * should have an entry here.
 *
 * Placeholder game/studio names are marked with PLACEHOLDER — replace
 * during jam with theme-appropriate names.
 */
i18n.register('en', {
  // ── Splash ──────────────────────────────────────────────────────
  'splash.studio':      'DC JAM 2026',
  'splash.title':       'DUNGEON GLEANER',
  'splash.jam':         'DC JAM 2026',
  'splash.skip':        'PRESS ANY KEY',

  // ── Title Screen ────────────────────────────────────────────────
  'title.game_name':    'DUNGEON GLEANER',
  'title.subtitle':     'A Gleaning Dungeon Crawler',
  'title.new_game':     'New Game',
  'title.continue':     'Continue',
  'title.credits':      'Credits',
  'title.settings':     'Settings',
  'title.jam_credit':   'DC Jam 2026',

  // ── Character Creation ──────────────────────────────────────────
  'create.callsign_header': 'CHOOSE YOUR CALLSIGN',
  'create.callsign_hint':   '[← →] Browse   [Enter] Confirm   [Back]',
  'create.avatar_header':   'CHOOSE YOUR CLASS',
  'create.avatar_hint':     '[↑ ↓] Browse   [Enter] Deploy   [Back]',
  'create.deploying':       'DEPLOYING...',

  // ── HUD ─────────────────────────────────────────────────────────
  'hud.hp':             'HP',
  'hud.energy':         'EN',
  'hud.floor':          'Floor',

  // ── Combat ──────────────────────────────────────────────────────
  'combat.ambush':      'AMBUSH',
  'combat.alert':       'ALERT',
  'combat.neutral':     'ENGAGED',
  'combat.round':       'Round',
  'combat.victory':     'defeated!',
  'combat.defeat':      'You have been defeated.',
  'combat.fled':        'Escaped!',
  'combat.pick_card':   'Pick a card (1-5)  [F] Flee',
  'combat.flee_no_energy': 'Not enough energy to flee!',
  'combat.trainer_defeat': 'You need more practice...',
  'combat.trainer_return': 'Returned to entry point.',

  // Combat countdown beats (3-beat narration)
  'combat.beat_ambush':     'You caught them off guard',
  'combat.beat_alert':      'They saw you coming',
  'combat.beat_engaged':    'Face to face',
  'combat.beat_critical':   'Critical HP - fight carefully',
  'combat.beat_low_energy': 'Low energy',
  'combat.beat_ready':      'Ready',
  'combat.advantage_ambush':  'Ambush - bonus damage!',
  'combat.advantage_alert':   'Alert - enemy has advantage',
  'combat.advantage_neutral': 'Engaged - even ground',

  // ── Hazards & Bonfire ───────────────────────────────────────────
  'hazard.trap':              'TRAP',
  'hazard.fire':              'FIRE',
  'hazard.spikes':            'SPIKES',
  'hazard.poison':            'POISON',
  'hazard.bonfire_rest':      '🐉 Rested at dragonfire; HP & energy restored',
  'hazard.death_trap':        'Caught in a trap',
  'hazard.death_fire':        'Burned alive',
  'hazard.death_spikes':      'Impaled on spikes',
  'hazard.death_poison':      'Succumbed to poison',
  'hazard.currency_lost':     'gold lost',
  'hazard.respawn_bonfire':   'Respawned at dragonfire.',
  'hazard.respawn_entrance':  'Returned to entrance.',
  'hazard.permadeath_trap':   'Crushed by a trap in the deep dungeon',
  'hazard.permadeath_fire':   'Consumed by flame in the deep dungeon',
  'hazard.permadeath_spikes': 'Impaled in the deep dungeon',
  'hazard.permadeath_poison': 'Poisoned in the deep dungeon',

  // ── Game Over ───────────────────────────────────────────────────
  'gameover.header':    'YOU HAVE FALLEN',
  'gameover.floors':    'Floors explored',
  'gameover.enemies':   'Enemies defeated',
  'gameover.cards':     'Cards played',
  'gameover.damage_dealt': 'Damage dealt',
  'gameover.damage_taken': 'Damage taken',
  'gameover.retry':     'Retry',
  'gameover.to_title':  'Return to Title',

  // ── Victory ─────────────────────────────────────────────────────
  'victory.header':     'VICTORY',
  'victory.narrative':  '[Narrative payoff - jam content]',
  'victory.floors':     'Floors explored',
  'victory.enemies':    'Enemies defeated',
  'victory.cards':      'Cards played',
  'victory.damage_dealt': 'Damage dealt',
  'victory.time':       'Time',
  'victory.continue':   'Press Enter to continue',

  // ── Transitions ─────────────────────────────────────────────────
  'transition.descending': 'Descending...',
  'transition.ascending':  'Ascending...',
  'transition.entering':   'Entering...',

  // ── Menu Faces (placeholders for MenuBox) ───────────────────────
  'menu.face0':         'Map',
  'menu.face1':         'Journal',
  'menu.face2':         'Inventory',
  'menu.face3':         'System',
  'menu.resume':        'Return to Game',
  'menu.quit_title':    'Quit to Title',
  'menu.minimap_placeholder': 'Minimap',
  'menu.journal_placeholder': 'No entries yet.',

  // ── Dragonfire MenuBox ─────────────────────────────────────────
  'shop.bonfire_title':    'DRAGONFIRE',
  'shop.bonfire_restored': 'HP & Energy restored',
  'shop.bonfire_hint':     '[BACK] Close   [Q/E] Browse',
  'shop.stash_title':      'STASH',
  'shop.stash_desc':       'Items stored here survive death',
  'shop.stash_capacity':   'slots',
  'shop.bag_title':        'BAG',
  'shop.bag_desc':         'Carried items (lost on death)',
  'shop.bag_capacity':     'slots',
  'shop.bag_hint':         'Select item → Move to stash',

  // ── Shop MenuBox ───────────────────────────────────────────────
  'shop.title':            'SHOP',
  'shop.vendor_name':      'MERCHANT',
  'shop.vendor_desc':      'A weary traveler with wares to trade',
  'shop.currency':         'gold',
  'shop.browse_hint':      '[Q/E] Browse panes   [BACK] Leave',
  'shop.buy_title':        'BUY',
  'shop.buy_hint':         '[1-5] Buy   [BACK] Close',
  'shop.sell_title':       'SELL',
  'shop.sell_desc':        'Select items to sell',
  'shop.sell_hint':        '[1-5] Sell card   [BACK] Close',
  'shop.close':            'Close',

  // ── Harvest MenuBox ────────────────────────────────────────────
  'harvest.title':         'REMAINS',
  'harvest.empty':         'Nothing remains.',
  'harvest.take_hint':     'to take',
  'harvest.nav_hint':      '[Q/E] View bag   [BACK] Leave',

  // ── Faction Shops ─────────────────────────────────────────────
  'shop.tide_name':        'TIDE COUNCIL',
  'shop.tide_desc':        'Old fishing families; dragon relics wanted',
  'shop.foundry_name':     'THE FOUNDRY',
  'shop.foundry_desc':     'Industrial consortium; monster parts wanted',
  'shop.admiralty_name':    'THE ADMIRALTY',
  'shop.admiralty_desc':    'Naval research; specimens & data wanted',

  // Faction short labels (used by menu-faces.js rep panel)
  'faction.tide':          'Tide',
  'faction.foundry':       'Foundry',
  'faction.admiralty':     'Admiralty',

  // ── DOC-107 Phase 3 — Reputation strip (debrief feed) ──────────
  // Names + tagline + suit strings consumed by DebriefFeed faction
  // rows and (later phases) the menu-faces journal. Keep ids in sync
  // with QuestTypes.FACTIONS values. The internal ids (bprd / mss /
  // pinkerton / jesuit) are STREET CHRONICLES codenames retained for
  // narrative ambiguity; the .name + .suit + .tagline strings are
  // the canonical in-world identities per Biome Plan §19.1.
  //
  //   internal id   →  in-world name        →  suit alignment
  //   ────────────────────────────────────────────────────────
  //   bprd          →  The Necromancer      →  ♥  (outside triangle, employer)
  //   mss           →  Tide Council         →  ♠  Coral Cellars
  //   pinkerton     →  Foundry Collective   →  ♦  Ironhold Depths
  //   jesuit        →  The Admiralty        →  ♣  Lamplit Catacombs
  'faction.bprd.name':         'The Necromancer',
  'faction.bprd.suit':         '\u2665',                      // ♥
  'faction.bprd.tagline':      'Your employer — pays for dungeon resets',
  'faction.mss.name':          'Tide Council',
  'faction.mss.suit':          '\u2660',                      // ♠
  'faction.mss.tagline':       'Coastal trade — Coral Cellars',
  'faction.pinkerton.name':    'Foundry Collective',
  'faction.pinkerton.suit':    '\u2666',                      // ♦
  'faction.pinkerton.tagline': 'Arms & armor — Ironhold Depths',
  'faction.jesuit.name':       'The Admiralty',
  'faction.jesuit.suit':       '\u2663',                      // ♣
  'faction.jesuit.tagline':    'Apothecary & research — Lamplit Catacombs',

  // Reputation tier labels — match QuestTypes.REP_TIERS ids one-to-one.
  'rep.tier.hated':          'Hated',
  'rep.tier.unfriendly':     'Unfriendly',
  'rep.tier.neutral':        'Neutral',
  'rep.tier.friendly':       'Friendly',
  'rep.tier.allied':         'Allied',
  'rep.tier.exalted':        'Exalted',

  // Reputation tier names (0-3)
  'shop.rep0':             'Stranger',
  'shop.rep1':             'Associate',
  'shop.rep2':             'Ally',
  'shop.rep3':             'Trusted',

  // Shop buy/sell result toasts
  'shop.bought':           'Bought',
  'shop.need_gold':        'Need',
  'shop.more':             'more gold',
  'shop.sold_out':         'Sold out',
  'shop.sold':             'Sold',
  'shop.sell_fail':        'Cannot sell',

  // Updated buy/sell pane titles & hints
  'shop.buy_title':        'BUY CARDS',
  'shop.sell_title':       'SELL CARDS',
  'shop.buy_hint':         '[1-5] Buy   [Q/E] Switch pane   [BACK] Leave',
  'shop.sell_hint':        '[1-5] Sell   [Q/E] Switch pane   [BACK] Leave',

  // ── Dialog Box ──────────────────────────────────────────────────
  'dialog.continue':    '[ Enter / Click to continue ]',
  'dialog.farewell':    'Farewell.',
  'dialog.goodbye':     'Goodbye',

  // ── Toast Notifications ────────────────────────────────────────
  'toast.item_pickup':    'Picked up:',
  'toast.item_use':       'Used:',
  'toast.quest_update':   'Quest Updated',
  'toast.gold_gain':      'Gold:',
  'toast.gold_loss':      'Gold lost:',
  'toast.hp_restore':     'HP restored',
  'toast.energy_restore': 'Energy restored',
  'toast.level_up':       'Level Up!',
  'toast.key_found':      'Key found',
  'toast.stash_deposit':  'Stashed:',
  'toast.stash_withdraw': 'Retrieved:',
  'toast.equip':          'Equipped:',
  'toast.unequip':        'Unequipped:',
  'toast.bag_full':       'Bag is full!',
  'toast.stash_full':     'Stash is full!',
  'toast.harvest':        'Harvested:',
  'toast.harvest_empty':  'Nothing left to harvest.',
  'toast.smashed':        'smashed!',
  'toast.food_hot':       'Eating...',
  'toast.food_instant':   'Ate something.',
  'toast.faction_up':     'Reputation up:',
  'toast.sold':           'Sold:',

  // ── Interact Prompt ────────────────────────────────────────────
  'interact.key':         '[OK]',
  'interact.open':        'Open',
  'interact.talk':        'Talk',
  'interact.rest':        'Rest',
  'interact.browse':      'Browse',
  'interact.descend':     'Descend',
  'interact.ascend':      'Ascend',
  'interact.enter':       'Enter',
  'interact.exit':        'Exit',
  'interact.use':         'Use',
  'interact.examine':     'Examine',
  'interact.inspect':     'Inspect',
  'interact.harvest':     'Harvest',
  'interact.smash':       'Smash',
  'interact.reset':       'Reset Puzzle',
  'interact.read':        'Read',
  'interact.refuel':      'Refuel Torch',
  'interact.extinguish':  'Extinguish',
  'interact.restock':     'Restock',
  'interact.drink':       'Drink',
  'interact.clean':       'Scrub',

  // ── Interact hints (second line, shown on hover) ───────────────
  'hint.clean':           'Remove blood to raise readiness.',
  'hint.restock':         'Fill slots with matching items to seal.',
  'hint.restock_sealed':  'Sealed; contributes to readiness.',
  'hint.rearm':           'Restore trap for heroes to trigger.',
  'hint.cobweb':          'Stretched across the corridor; slows enemies.',
  'hint.harvest':         'Drag items from corpse stock.',
  'hint.harvest_sealed':  'Sealed; ready to reanimate.',
  'hint.smash':           'Break it open for loot.',
  'hint.refuel':          'Add fuel to keep the torch lit.',
  'hint.extinguish':      'Douse the flame (reduces readiness).',
  'hint.read':            'Browse the shelves.',
  'hint.rest':            'Heal, save, and advance time.',
  'hint.camp':            'Brief rest; restores HP and energy.',
  'hint.drink':           'Temporary stat boost.',
  'hint.inspect':         'Look closer.',
  'hint.enter':           'Go inside.',
  'hint.exit':            'Return outside.',
  'hint.browse':          'Buy and sell goods.',
  'hint.talk':            'See what they have to say.',

  // ── Dragonfire / Hearth ────────────────────────────────────────
  'bonfire.warp_home':       'Warp Home',
  'bonfire.warp_entrance':   'Warp to Entrance',
  'bonfire.warping':         'Warping...',

  // §11 Dragonfire depth-branched strings
  'interact.dragonfire_camp':    'Camp',
  'interact.dragonfire_rest':    'Rest',
  'dragonfire.no_stash_title':   'TOO DEEP',
  'dragonfire.no_stash_line1':   'Stash unavailable this deep.',
  'dragonfire.no_stash_line2':   'Camp outside to access your stash.',
  'dragonfire.warp_locked':      'Floor not ready',
  'dragonfire.warp_confirm_dungeon': 'Leave this dungeon? Progress will be saved.',
  'dragonfire.warp_confirm_home':    'Warp home? You can return here later.',
  'bonfire.waypoint_set':            'Respawn point set',
  'ui.confirm':                      'Yes',
  'shop.stash_empty_hint':           'Drag items here; they survive death.',
  'hazard.dragonfire_brief':     'Brief rest; HP & energy restored. Stay alert.',
  'hazard.dragonfire_rest_dawn': 'Rested until dawn; HP & energy restored. You feel well rested.',
  'hazard.dragonfire_rest_late': 'Rested until dawn; HP & energy restored. Late night, though...',
  'inv.nothing_burn':        'Nothing to burn',
  'inv.bag':                 'Bag',

  // ── Table quips ────────────────────────────────────────────────
  'table.quip1':  'A mug of cold tea. Still half full.',
  'table.quip2':  'Scattered notes... dungeon cleaning checklists.',
  'table.quip3':  'A pressed flower between two invoice sheets.',
  'table.quip4':  "Crumbs from this morning's flatbread.",
  'table.quip5':  'A dull knife and a half-whittled figurine.',

  // ── Cobweb system ───────────────────────────────────────────────
  'cobweb.deploy':      'Deploy Spider',
  'cobweb.installed':   'Cobweb installed',
  'cobweb.destroyed':   'Cobweb torn!',
  'cobweb.torn':        'You tore your own cobweb!',

  // ── Trap re-arm ───────────────────────────────────────────────
  'interact.rearm':     'Re-arm trap',
  'interact.check_mail': 'Check Mailbox',
  'hint.check_mail':     'Read hero run reports.',

  // ── Pressure-washing hose (PW-2) ──────────────────────────────
  'interact.grab_hose':  'Grab Hose',
  'hint.grab_hose':      'Drag the pressure-wash hose into the dungeon.',
  'hose.grabbed':        'Hose attached — head for the dungeon',
  'hose.already_carrying': 'Already carrying the hose',
  'hose.no_deployment':  'No deployment today — truck\u2019s resting',
  'toast.trap_rearmed': 'Trap re-armed!',
  'readiness.exit_enabled': 'Dragonfire exit enabled!',
  'toast.tile_clean':   'Tile cleaned!',
  'toast.reanimate':    'The fallen rises...',
  'toast.scrub_prog':   'Scrubbing...',

  // ── Work orders ───────────────────────────────────────────────
  'work.order_posted':   'Work order posted',
  'work.order_complete': 'Order complete!',
  'work.order_failed':   'Order incomplete',

  // ── Quest system (Phase 0b stubs) ───────────────────────────────
  // Namespace plan (docs/QUEST_SYSTEM_ROADMAP.md §4):
  //   quest.main.<slug>.title   / .summary        — Act-1 spine quests
  //   quest.faction.<fac>.<tier>.title            — rep-advancement chains
  //   quest.sidequest.<slug>.title / .hook / .summary / .step.<n>.label
  //   quest.tutorial.<slug>.title / .summary      — one-shot walkthroughs
  // Concrete strings land quest-by-quest in Phase 1+. These are the
  // headline UI chrome strings the HUD/journal panel needs from day 1.
  'quest.panel.title':            'Quest Journal',
  'quest.panel.empty':            'No active quests.',
  'quest.panel.available':        'Available',
  'quest.panel.active':           'Active',
  'quest.panel.completed':        'Completed',
  'quest.panel.failed':           'Failed',
  // Phase 2.1b additions — active-row detail dialog + capstone teaser
  'quest.detail.steps_header':    'Steps',
  'quest.detail.giver_prefix':    'Giver',
  'quest.detail.rewards_prefix':  'Rewards',
  'quest.detail.fail_reason':     'Reason',
  'quest.capstone.teaser_title':  'The Hero Falls',
  'quest.capstone.teaser_hint':   'Awaiting the hero\u2019s fall below',
  'quest.kind.main':              'MAIN',
  'quest.kind.side':              'SIDE',
  'quest.kind.contract':          'CONTRACT',
  'quest.marker.toggle_on':       'Quest markers: ON',
  'quest.marker.toggle_off':      'Quest markers: OFF',
  'quest.toast.accepted':         'Quest accepted',
  'quest.toast.waypoint':         'Objective updated',
  'quest.toast.completed':        'Quest complete',
  'quest.toast.failed':           'Quest failed',
  // Sidequest template strings — these echo data/quests.json `_templates.sidequest`
  // so a freshly-stamped sidequest renders non-empty placeholders until
  // real strings replace them.
  'quest.sidequest._template.title':   '(untitled sidequest)',
  'quest.sidequest._template.hook':    'An odd job needs doing.',
  'quest.sidequest._template.summary': 'Details pending.',
  'quest.sidequest._template.step.1.label': 'Reach the marked location',

  // DOC-107 follow-up — Act 1 capstone. Flag-setter quest that produces
  // `act2_unlocked: true` when `hero_defeated` becomes true. Consumed by
  // the Floor 3 → Floor 4 composite gate per docs/GATE_TAXONOMY.md §6.2.
  // Single-step main quest; activation wired in DOC-107 Phase 7.
  'quest.main.capstone.title':        'The Hero\u2019s Last Mess',
  'quest.main.capstone.summary':      'The hero\u2019s trail ends somewhere below the boardwalk. When the dust settles, the dungeons beyond the Vivec Arch won\u2019t need a scavenger — they\u2019ll need a witness. Finish the cleanup. See what\u2019s left.',
  'quest.main.capstone.step.1.label': 'Confirm the hero is down',

  // DOC-107 Phase 5 demo sidequest — Soft Cellar pentagram wash.
  // Exercises the full minigame-exit adapter chain: SpraySystem
  // (cleanliness >= 1.0) → PickupActions.onMinigameExit → QuestChain
  // with a count:3 predicate. Three partial-waypoint events, then
  // completion on the third tile.
  'quest.sidequest.pentagram_wash.title':   'A Lingering Stain',
  'quest.sidequest.pentagram_wash.hook':    'Something the hero spilled won\u2019t come up with a dry mop.',
  'quest.sidequest.pentagram_wash.summary': 'Pressure-wash three fouled floor tiles in the Soft Cellar. The pentagram is drawn in something older than blood \u2014 scrub until each tile reads clean.',
  'quest.sidequest.pentagram_wash.step.1.label': 'Wash 3 pentagram tiles (Soft Cellar)',

  // DOC-107 Phase 5b sidequest content batch — ship three sidequests that
  // stretch the non-minigame predicate surface (npc / item / combat / floor /
  // readiness / flag). Grounded in real NPC ids (npc-system.js), real enemy
  // ids (data/enemies.json), and real item ids (data/items.json) so the
  // predicates match live events the moment the pending fan-outs (onNpcTalk,
  // onCombatKill, generic onItemAcquired) land. Verified in isolation by
  // tools/_phase5b-cache/verify.js driving QuestChain directly.

  // 1. Innkeeper bottles — Driftwood Inn → Soft Cellar rat-clean → report back.
  //    Exercises: npc → floor → combat(count:3, ENM-003) → npc(branch:rat_report).
  'quest.sidequest.innkeeper_bottles.title':   'Bottles and Bitemarks',
  'quest.sidequest.innkeeper_bottles.hook':    'Marlo says rats got into the good vintage again.',
  'quest.sidequest.innkeeper_bottles.summary': 'Driftwood Inn\u2019s cellar stock keeps vanishing down the Soft Cellar stairs. Talk to Marlo, head down, thin the rat pack (three should do it), then tell him the count so he can sleep.',
  'quest.sidequest.innkeeper_bottles.step.1.label': 'Speak with Innkeeper Marlo',
  'quest.sidequest.innkeeper_bottles.step.2.label': 'Descend to the Soft Cellar',
  'quest.sidequest.innkeeper_bottles.step.3.label': 'Cull 3 Dungeon Rats',
  'quest.sidequest.innkeeper_bottles.step.4.label': 'Report the kill count to Marlo',

  // 2. Cellar owner mop — cellar entrance → pick up mop head → bring floor
  //    to 50% readiness. Exercises: npc → item (ITM-089) → readiness.
  'quest.sidequest.cellar_owner_mop.title':   'A Proper Mop-Up',
  'quest.sidequest.cellar_owner_mop.hook':    'The cellar owner hasn\u2019t been downstairs in weeks. He\u2019s not going to start now.',
  'quest.sidequest.cellar_owner_mop.summary': 'Find a replacement mop head in the Soft Cellar and get the floor halfway presentable. The owner will know the difference \u2014 he\u2019s the one who has to walk across it.',
  'quest.sidequest.cellar_owner_mop.step.1.label': 'Speak with the Cellar Owner',
  'quest.sidequest.cellar_owner_mop.step.2.label': 'Pick up a Mop Head in the Soft Cellar',
  'quest.sidequest.cellar_owner_mop.step.3.label': 'Clean the Soft Cellar to 50% readiness',

  // 3. Watchman roll call — scout the two Hero\u2019s Wake dungeon floors
  //    then report once hero-wake arrival flag flips. Exercises: npc → floor
  //    → floor → flag (heroWakeArrival). Prereq gateUnlocked=true.
  'quest.sidequest.watchman_roll_call.title':   'Roll Call',
  'quest.sidequest.watchman_roll_call.hook':    'The watchman wants eyes on what the hero left behind.',
  'quest.sidequest.watchman_roll_call.summary': 'Walk both levels of the Hero\u2019s Wake, then wait for the hero\u2019s arrival signal. The watchman won\u2019t pay until he knows the floor count and the timeline.',
  'quest.sidequest.watchman_roll_call.step.1.label': 'Speak with the Watchman',
  'quest.sidequest.watchman_roll_call.step.2.label': 'Descend to Hero\u2019s Wake B1',
  'quest.sidequest.watchman_roll_call.step.3.label': 'Descend deeper to Hero\u2019s Wake B2',
  'quest.sidequest.watchman_roll_call.step.4.label': 'Wait for the hero\u2019s arrival signal',

  // DOC-113 Phase B sprint sidequests — timed fetch runs with hero pursuit.
  // Exercises the 'fetch' waypoint kind (kind:"fetch" predicate in QuestChain).
  // Timer/hero data on the fetch step is consumed by QuestChain + HeroSystem
  // at runtime (DOC-113 Phases C-D); the quest data is data-complete now.

  // 4. Cellar fetch — sprint run in the Soft Cellar. Retrieve a dispatch
  //    ledger before The Seeker returns. Gated behind cellar_owner_mop.
  'quest.sidequest.cellar_fetch.title':          'Quick Hands',
  'quest.sidequest.cellar_fetch.hook':           'There\u2019s a ledger down there the owner needs back. Problem is, the hero\u2019s due any minute.',
  'quest.sidequest.cellar_fetch.summary':        'The cellar owner needs a dispatch ledger retrieved from the Soft Cellar before the hero returns. You have 75 seconds. If the timer runs out, The Seeker blocks the exit \u2014 find the secondary passage or fight through.',
  'quest.sidequest.cellar_fetch.step.1.label':   'Get the briefing from the Cellar Owner',
  'quest.sidequest.cellar_fetch.step.2.label':   'Retrieve the Dispatch Ledger (75s)',
  'quest.sidequest.cellar_fetch.step.3.label':   'Return the ledger to the Cellar Owner',

  // 5. Wake dispatch — sprint run in Hero\u2019s Wake B1. Retrieve a BPRD
  //    containment report before The Crusader returns. Harder/longer.
  //    Gated behind watchman_roll_call.
  'quest.sidequest.wake_dispatch.title':         'Dead Drop',
  'quest.sidequest.wake_dispatch.hook':          'The watchman says BPRD left something in the Wake. Get it before the Crusader does.',
  'quest.sidequest.wake_dispatch.summary':       'A BPRD containment report is buried somewhere in Hero\u2019s Wake B1. The Crusader is sweeping floors below \u2014 you have 90 seconds before they resurface. The report is evidence of what the hero really does to dragons.',
  'quest.sidequest.wake_dispatch.step.1.label':  'Get the briefing from the Watchman',
  'quest.sidequest.wake_dispatch.step.2.label':  'Retrieve the BPRD Report (90s)',
  'quest.sidequest.wake_dispatch.step.3.label':  'Deliver the report to the Watchman',

  // Sprint dungeon timer UI strings (DOC-113 Phase C — consumed by HUD timer element)
  'quest.sprint.timer_label':     'TIME',
  'quest.sprint.timer_expired':   'TIME\u2019S UP',
  'quest.sprint.hero_sentinel':   'blocks the exit',
  'quest.sprint.hero_pursuit':    'is hunting you',
  'quest.sprint.escaped':         'Escaped!',
  'quest.sprint.objective_found': 'Got it \u2014 head for the exit!',
  // Act-flavored hero appearance toasts (DOC-113 §8.2)
  'quest.sprint.hero_spawn_act1': 'Heavy footsteps echo from below. Someone \u2014 something \u2014 is coming up the stairs.',
  'quest.sprint.hero_spawn_act2': '{hero} appears at the exit.',
  'quest.sprint.hero_spawn_act3': '{hero} appears at the exit. But this time, you\u2019re ready.',

  // Navigation-hint fallback (Phase 2). Used when QuestChain has no active
  // quests and `getJournalEntries()` synthesizes a hint from the legacy
  // floor/gate state machine. Preserves jam-build parity while the real
  // main-quest spine is still being authored.
  'quest.nav_hint.title':             'Gleaner Dispatch',
  'quest.nav_hint.find_keys_home':    'Find work keys in the chest',
  'quest.nav_hint.enter_promenade':   'Enter The Promenade',
  'quest.nav_hint.head_home_keys':    'Head home for your keys \u2014 east side of town',
  'quest.nav_hint.enter_coral_bazaar':'Enter the Coral Bazaar \u2014 find the cellar',
  'quest.nav_hint.descend_soft_cellar':'Descend to the Soft Cellar',
  'quest.nav_hint.clear_dungeon':     'Clear the dungeon floor',
  'quest.nav_hint.report_to_entrance':'Report to the dungeon entrance',

  // ── Reputation (Phase 0b stubs) ─────────────────────────────────
  // Concrete per-faction strings land in Phase 2 when ReputationBar
  // wires into the HUD/journal. Tier labels are canonical.
  'reputation.faction_mss':       'MSS Dispatch',
  'reputation.faction_pinkerton': 'Pinkerton Agency',
  'reputation.faction_jesuit':    'Jesuit Order',
  'reputation.faction_bprd':      'Dragon Network',
  'reputation.tier.hated':        'Hated',
  'reputation.tier.unfriendly':   'Unfriendly',
  'reputation.tier.neutral':      'Neutral',
  'reputation.tier.friendly':     'Friendly',
  'reputation.tier.allied':       'Allied',
  'reputation.tier.exalted':      'Exalted',
  'reputation.tier_cross':        'Reputation changed',

  // ── Settings ────────────────────────────────────────────────────
  'settings.language':  'Language',
  'settings.lang_en':   'English',
  'settings.lang_es':   'Español',
  'settings.lang_hi':   'हिन्दी',
  'settings.lang_ps':   'پښتو',
  'settings.sfx':       'SFX Volume',
  'settings.bgm':       'BGM Volume',
  'settings.master':    'Master Volume',
  'settings.quest_markers':      'Quest markers',
  'settings.quest_markers_hint': 'Show objective pips on the minimap.',

  // ── Quest settings subsection (DOC-107 Phase 4) ─────────────────
  // Owned by menu-faces.js Face 3 → Quest block. Persisted to
  // localStorage['gleaner_settings_v1'].quest via QuestChain.setUIPrefs.
  'settings.quest.section_title':       'Quest',
  // Row 1 — on/off toggle
  'settings.quest.markers':             'Quest markers',
  'settings.quest.markers_hint':        'Show the objective diamond on the minimap.',
  // Row 2 — verbosity cycle
  'settings.quest.hint_verbosity':      'Hint verbosity',
  'settings.quest.hint_verbosity_hint': 'Off: no active-quest pips. Subtle: only when stuck 90s. Explicit: always.',
  'settings.quest.verbosity.off':       'Off',
  'settings.quest.verbosity.subtle':    'Subtle',
  'settings.quest.verbosity.explicit':  'Explicit',
  // Row 3 — waypoint flair cycle
  'settings.quest.waypoint_flair':      'Waypoint flair',
  'settings.quest.waypoint_flair_hint': 'Cosmetic style for the minimap objective marker.',
  'settings.quest.flair.simple':        'Simple',
  'settings.quest.flair.pulsing':       'Pulsing',
  'settings.quest.flair.trail':         'Flash trail',
  // Row 4 — sidequest opt-in cycle
  'settings.quest.sidequest_optin':     'Sidequest opt-in',
  'settings.quest.sidequest_hint':      'All: accept every sidequest. Main only: hide side branches. Ask: confirm each.',
  'settings.quest.optin.all':           'All',
  'settings.quest.optin.main-only':     'Main only',
  'settings.quest.optin.ask':           'Ask per quest'
});

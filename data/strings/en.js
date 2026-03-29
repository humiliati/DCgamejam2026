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
  'title.settings':     'Settings',
  'title.jam_credit':   'DC Jam 2026',

  // ── Character Creation ──────────────────────────────────────────
  'create.callsign_header': 'CHOOSE YOUR CALLSIGN',
  'create.callsign_hint':   '[← →] Browse   [Enter] Confirm   [Esc] Back',
  'create.avatar_header':   'CHOOSE YOUR CLASS',
  'create.avatar_hint':     '[↑ ↓] Browse   [Enter] Deploy   [Esc] Back',
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
  'combat.beat_critical':   'Critical HP — fight carefully',
  'combat.beat_low_energy': 'Low energy',
  'combat.beat_ready':      'Ready',
  'combat.advantage_ambush':  'Ambush — bonus damage!',
  'combat.advantage_alert':   'Alert — enemy has advantage',
  'combat.advantage_neutral': 'Engaged — even ground',

  // ── Hazards & Bonfire ───────────────────────────────────────────
  'hazard.trap':              'TRAP',
  'hazard.fire':              'FIRE',
  'hazard.spikes':            'SPIKES',
  'hazard.poison':            'POISON',
  'hazard.bonfire_rest':      '🔥 Rested at bonfire — HP & energy restored',
  'hazard.death_trap':        'Caught in a trap',
  'hazard.death_fire':        'Burned alive',
  'hazard.death_spikes':      'Impaled on spikes',
  'hazard.death_poison':      'Succumbed to poison',
  'hazard.currency_lost':     'gold lost',
  'hazard.respawn_bonfire':   'Respawned at bonfire.',
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
  'victory.narrative':  '[Narrative payoff — jam content]',
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

  // ── Bonfire MenuBox ────────────────────────────────────────────
  'shop.bonfire_title':    'BONFIRE',
  'shop.bonfire_restored': 'HP & Energy restored',
  'shop.bonfire_hint':     '[ESC] Close   [Q/E] Browse',
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
  'shop.browse_hint':      '[Q/E] Browse panes   [ESC] Leave',
  'shop.buy_title':        'BUY',
  'shop.buy_hint':         '[1-5] Buy   [ESC] Close',
  'shop.sell_title':       'SELL',
  'shop.sell_desc':        'Select items to sell',
  'shop.sell_hint':        '[1-5] Sell card   [ESC] Close',
  'shop.close':            'Close',

  // ── Harvest MenuBox ────────────────────────────────────────────
  'harvest.title':         'REMAINS',
  'harvest.empty':         'Nothing remains.',
  'harvest.take_hint':     'to take',
  'harvest.nav_hint':      '[Q/E] View bag   [ESC] Leave',

  // ── Faction Shops ─────────────────────────────────────────────
  'shop.tide_name':        'TIDE COUNCIL',
  'shop.tide_desc':        'Old fishing families — dragon relics wanted',
  'shop.foundry_name':     'THE FOUNDRY',
  'shop.foundry_desc':     'Industrial consortium — monster parts wanted',
  'shop.admiralty_name':    'THE ADMIRALTY',
  'shop.admiralty_desc':    'Naval research — specimens & data wanted',

  // Faction short labels (used by menu-faces.js rep panel)
  'faction.tide':          'Tide',
  'faction.foundry':       'Foundry',
  'faction.admiralty':     'Admiralty',

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
  'shop.buy_hint':         '[1-5] Buy   [Q/E] Switch pane   [ESC] Leave',
  'shop.sell_hint':        '[1-5] Sell   [Q/E] Switch pane   [ESC] Leave',

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
  'interact.harvest':     'Harvest',
  'interact.smash':       'Smash',
  'interact.reset':       'Reset Puzzle',

  // ── Settings ────────────────────────────────────────────────────
  'settings.language':  'Language',
  'settings.sfx':       'SFX Volume',
  'settings.bgm':       'BGM Volume',
  'settings.master':    'Master Volume'
});

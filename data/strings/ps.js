/**
 * Pashto (پښتو) string table.
 * Layer 5 data — loaded after engine modules.
 * Note: Pashto is RTL but the game uses monospace canvas rendering
 * which does not support RTL layout. Strings are provided LTR-ordered
 * for canvas fillText — proper RTL requires a future text shaping pass.
 */
i18n.register('ps', {
  // ── Splash ──
  'splash.skip':        'هره کیلي فشار کړئ',

  // ── Title Screen ──
  'title.subtitle':     'د تهکو پاکوونکی',
  'title.new_game':     'نوی لوبه',
  'title.continue':     'دوام',
  'title.settings':     'ترتیبات',

  // ── Character Creation ──
  'create.callsign_header': 'خپل کوډنوم غوره کړئ',
  'create.deploying':       'ځای پرځای کول...',

  // ── HUD ──
  'hud.hp':             'HP',
  'hud.energy':         'توان',
  'hud.floor':          'پوړ',

  // ── Combat ──
  'combat.ambush':      'برید',
  'combat.alert':       'خبرتیا',
  'combat.neutral':     'جنګ',
  'combat.round':       'پړاو',
  'combat.victory':     'ماتې ته ورسېد!',
  'combat.defeat':      'تاسو ماتې خوړلئ.',
  'combat.fled':        'وتښتېدئ!',
  'combat.pick_card':   'کارت غوره کړئ (1-5)  [F] وتښتئ',
  'combat.beat_ready':  'چمتو',

  // ── Hazards ──
  'hazard.trap':              'دام',
  'hazard.fire':              'اور',
  'hazard.spikes':            'میخونه',
  'hazard.poison':            'زهر',
  'hazard.bonfire_rest':      '🐉 د اژدها اور; HP او توان بیرته راغی',

  // ── Game Over ──
  'gameover.header':    'تاسو ولوېدئ',
  'gameover.retry':     'بیا هڅه',
  'gameover.to_title':  'سرلیک ته ورشئ',

  // ── Victory ──
  'victory.header':     'بریالیتوب',
  'victory.continue':   'د دوام لپاره Enter فشار کړئ',

  // ── Transitions ──
  'transition.descending': 'ښکته کېږي...',
  'transition.ascending':  'پورته کېږي...',
  'transition.entering':   'ننوتل...',

  // ── Menu Faces ──
  'menu.face0':         'نقشه',
  'menu.face1':         'ژورنال',
  'menu.face2':         'سامان',
  'menu.face3':         'سیسټم',
  'menu.resume':        'لوبې ته ورشئ',
  'menu.quit_title':    'سرلیک ته ورشئ',

  // ── Interact ──
  'interact.open':        'خلاص کړئ',
  'interact.talk':        'خبرې وکړئ',
  'interact.rest':        'آرام وکړئ',
  'interact.enter':       'ننوزئ',
  'interact.exit':        'ووزئ',
  'interact.examine':     'وګورئ',
  'interact.harvest':     'راټول کړئ',
  'interact.smash':       'مات کړئ',
  'interact.read':        'ولولئ',
  'interact.clean':       'پاک کړئ',
  'interact.drink':       'وڅکئ',

  // ── Toast ──
  'toast.item_pickup':    'اخیستل شو:',
  'toast.bag_full':       'بکسه ډکه ده!',

  // ── Settings ──
  'settings.language':  'ژبه',
  'settings.sfx':       'SFX غږ',
  'settings.bgm':       'موسیقي غږ',
  'settings.master':    'اصلي غږ',
  'settings.lang_en':   'English',
  'settings.lang_es':   'Español',
  'settings.lang_hi':   'हिन्दी',
  'settings.lang_ps':   'پښتو',

  // ── Dialog ──
  'dialog.continue':    '[ Enter / د دوام لپاره کلیک وکړئ ]',

  // ── Inventory ──
  'inv.bag':            'بکسه',
  'inv.hand_full':      'لاس ډک! (5/5)',
  'inv.no_space':       'ځای نشته! لاس او بکسه ډکه ده.',

  'shop.close':         'بند کړئ',
  'ui.confirm':         'هو'
});

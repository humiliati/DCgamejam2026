/**
 * Spanish (Español) string table.
 * Layer 5 data — loaded after engine modules.
 */
i18n.register('es', {
  // ── Splash ──
  'splash.studio':      'DC JAM 2026',
  'splash.title':       'DUNGEON GLEANER',
  'splash.jam':         'DC JAM 2026',
  'splash.skip':        'PULSA CUALQUIER TECLA',

  // ── Title Screen ──
  'title.game_name':    'DUNGEON GLEANER',
  'title.subtitle':     'Un Rastreador de Mazmorras',
  'title.new_game':     'Nueva Partida',
  'title.continue':     'Continuar',
  'title.credits':      'Créditos',
  'title.settings':     'Ajustes',
  'title.jam_credit':   'DC Jam 2026',

  // ── Character Creation ──
  'create.callsign_header': 'ELIGE TU INDICATIVO',
  'create.callsign_hint':   '[← →] Navegar   [Enter] Confirmar   [Esc] Atrás',
  'create.avatar_header':   'ELIGE TU CLASE',
  'create.avatar_hint':     '[↑ ↓] Navegar   [Enter] Desplegar   [Esc] Atrás',
  'create.deploying':       'DESPLEGANDO...',

  // ── HUD ──
  'hud.hp':             'PV',
  'hud.energy':         'EN',
  'hud.floor':          'Piso',

  // ── Combat ──
  'combat.ambush':      'EMBOSCADA',
  'combat.alert':       'ALERTA',
  'combat.neutral':     'COMBATE',
  'combat.round':       'Ronda',
  'combat.victory':     '¡derrotado!',
  'combat.defeat':      'Has sido derrotado.',
  'combat.fled':        '¡Escapaste!',
  'combat.pick_card':   'Elige una carta (1-5)  [F] Huir',
  'combat.flee_no_energy': '¡No tienes suficiente energía para huir!',
  'combat.trainer_defeat': 'Necesitas más práctica...',
  'combat.trainer_return': 'Regresaste al punto de entrada.',

  'combat.beat_ambush':     'Los tomaste por sorpresa',
  'combat.beat_alert':      'Te vieron venir',
  'combat.beat_engaged':    'Cara a cara',
  'combat.beat_critical':   'PV críticos - lucha con cuidado',
  'combat.beat_low_energy': 'Energía baja',
  'combat.beat_ready':      'Listo',
  'combat.advantage_ambush':  'Emboscada - ¡daño extra!',
  'combat.advantage_alert':   'Alerta - el enemigo tiene ventaja',
  'combat.advantage_neutral': 'Combate - terreno parejo',

  // ── Hazards & Bonfire ──
  'hazard.trap':              'TRAMPA',
  'hazard.fire':              'FUEGO',
  'hazard.spikes':            'PINCHOS',
  'hazard.poison':            'VENENO',
  'hazard.bonfire_rest':      '🐉 Descansaste en el fuego de dragón; PV y energía restaurados',
  'hazard.death_trap':        'Atrapado en una trampa',
  'hazard.death_fire':        'Quemado vivo',
  'hazard.death_spikes':      'Empalado en pinchos',
  'hazard.death_poison':      'Sucumbiste al veneno',
  'hazard.currency_lost':     'oro perdido',
  'hazard.respawn_bonfire':   'Reapareciste en el fuego de dragón.',
  'hazard.respawn_entrance':  'Regresaste a la entrada.',

  // ── Game Over ──
  'gameover.header':    'HAS CAÍDO',
  'gameover.floors':    'Pisos explorados',
  'gameover.enemies':   'Enemigos derrotados',
  'gameover.cards':     'Cartas jugadas',
  'gameover.damage_dealt': 'Daño infligido',
  'gameover.damage_taken': 'Daño recibido',
  'gameover.retry':     'Reintentar',
  'gameover.to_title':  'Volver al Título',

  // ── Victory ──
  'victory.header':     'VICTORIA',
  'victory.floors':     'Pisos explorados',
  'victory.enemies':    'Enemigos derrotados',
  'victory.cards':      'Cartas jugadas',
  'victory.damage_dealt': 'Daño infligido',
  'victory.time':       'Tiempo',
  'victory.continue':   'Pulsa Enter para continuar',

  // ── Transitions ──
  'transition.descending': 'Descendiendo...',
  'transition.ascending':  'Ascendiendo...',
  'transition.entering':   'Entrando...',

  // ── Menu Faces ──
  'menu.face0':         'Mapa',
  'menu.face1':         'Diario',
  'menu.face2':         'Inventario',
  'menu.face3':         'Sistema',
  'menu.resume':        'Volver al Juego',
  'menu.quit_title':    'Salir al Título',

  // ── Interact ──
  'interact.key':         '[OK]',
  'interact.open':        'Abrir',
  'interact.talk':        'Hablar',
  'interact.rest':        'Descansar',
  'interact.browse':      'Explorar',
  'interact.descend':     'Descender',
  'interact.ascend':      'Ascender',
  'interact.enter':       'Entrar',
  'interact.exit':        'Salir',
  'interact.use':         'Usar',
  'interact.examine':     'Examinar',
  'interact.inspect':     'Inspeccionar',
  'interact.harvest':     'Cosechar',
  'interact.smash':       'Romper',
  'interact.read':        'Leer',
  'interact.refuel':      'Reabastecer Antorcha',
  'interact.extinguish':  'Apagar',
  'interact.restock':     'Reabastecer',
  'interact.drink':       'Beber',
  'interact.clean':       'Limpiar',
  'interact.rearm':       'Rearmar trampa',

  // ── Toast ──
  'toast.item_pickup':    'Recogido:',
  'toast.item_use':       'Usado:',
  'toast.quest_update':   'Misión Actualizada',
  'toast.gold_gain':      'Oro:',
  'toast.bag_full':       '¡Bolsa llena!',
  'toast.stash_full':     '¡Alijo lleno!',
  'toast.equip':          'Equipado:',
  'toast.unequip':        'Desequipado:',

  // ── Settings ──
  'settings.language':  'Idioma',
  'settings.sfx':       'Volumen SFX',
  'settings.bgm':       'Volumen Música',
  'settings.master':    'Volumen General',
  'settings.lang_en':   'English',
  'settings.lang_es':   'Español',
  'settings.lang_hi':   'हिन्दी',
  'settings.lang_ps':   'پښتو',

  // ── Dialog ──
  'dialog.continue':    '[ Enter / Clic para continuar ]',
  'dialog.farewell':    'Adiós.',

  // ── Bonfire / Dragonfire ──
  'shop.bonfire_title':    'FUEGO DE DRAGÓN',
  'shop.stash_title':      'ALIJO',
  'shop.buy_title':        'COMPRAR CARTAS',
  'shop.sell_title':       'VENDER CARTAS',
  'shop.close':            'Cerrar',
  'shop.currency':         'oro',

  // ── Inventory ──
  'inv.bag':                 'Bolsa',
  'inv.hand_full':           '¡Mano llena! (5/5)',
  'inv.no_space':            '¡Sin espacio! Mano y bolsa llenas.',
  'inv.nothing_burn':        'Nada que quemar',

  'ui.confirm':              'Sí'
});

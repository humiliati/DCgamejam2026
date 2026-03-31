/**
 * EnemySprites — sprite stage system for enemy visual states.
 *
 * Manages 16 status states and 3 primary sprite poses (attack, idle, corpse).
 * Each state has visual modifiers (overlays, tint, particles) applied via
 * the canvas render path in raycaster.js.
 *
 * Corpse rendering is handled separately — enemies that die either fold
 * (origami death → lootable corpse tile) or poof (vanish with particles).
 *
 * Layer 1 (depends on: nothing — pure data + helpers)
 */
var EnemySprites = (function () {
  'use strict';

  // ── 16 status states ─────────────────────────────────────────────
  var STATE = {
    IDLE:           'idle',
    ATTACKING:      'attacking',
    SLEEPING:       'sleeping',
    DEAD:           'dead',
    BOUND:          'bound',
    BURNING:        'burning',
    PARALYZED:      'paralyzed',
    FROZEN:         'frozen',
    POISONED:       'poisoned',
    ENRAGED:        'enraged',
    ATK_BUFFED:     'atk_buffed',
    DEF_BUFFED:     'def_buffed',
    DEF_DRAINED:    'def_drained',
    ATK_DRAINED:    'atk_drained',
    PACIFIED:       'pacified',
    CRIPPLED:       'crippled'
  };

  // ── 3 primary sprite poses ───────────────────────────────────────
  var POSE = {
    IDLE:    'idle',     // Upright, neutral
    ATTACK:  'attack',   // Raised arm / weapon gesture
    CORPSE:  'corpse'    // Fallen / flat
  };

  // ── State → visual modifier map ──────────────────────────────────
  // Each entry defines how the state affects the sprite's render.
  //   tint:      RGBA overlay color
  //   glow:      Outer glow color + radius
  //   particle:  Emoji particle to emit (rendered by particle system)
  //   pulse:     Pulsating scale/alpha effect
  //   overlay:   Text overlay drawn above sprite
  //   pose:      Forces a specific pose override
  //   bob:       Vertical bob amplitude (px at 1.0 scale)

  // ── Stack FX properties (added alongside existing tint/glow/particle) ──
  //
  //   spring:     number  Travel sway amplitude (0 = none)
  //   lunge:      number  Attack forward-lean amount (0 = none)
  //   flashWhite: boolean Whether damage flash is active
  //   statusHue:  number|null  Hue overlay for DoT (null = none)
  //   statusAlpha:number  Opacity of status hue overlay (0-0.4)
  //   dotFlash:   boolean White flash on DoT tick
  //   ghostAlpha: number  Base alpha multiplier (1 = opaque, 0.3 = ghostly)
  //   sleeping:   boolean Use pile pose instead of standing stack
  //
  // Color palette constraint: avoid resource colors
  //   HP pink #FF6B9D, Energy blue #00D4FF, Battery green-cyan #00FFA6,
  //   Ammo magenta #DA70D6, Currency gold #FFFF00,
  //   Incinerator amber #FFA500 / red-orange #FF4500 / dark red #8B0000
  //
  // Status hue spectrum (safe range):
  //   Poison:   hue 110 (earthy green, avoids battery cyan-green)
  //   Burning:  hue 15  (deep orange, distinct from incinerator amber)
  //   Frozen:   hue 210 (ice blue, distinct from energy electric blue)
  //   Paralyzed: hue 55 (pale yellow-lime)
  //   Enraged:  hue 0   (pure red)
  //   Bound:    hue 40  (dusty tan)
  //   Pacified: hue 240 (lavender)
  //   Crippled: hue 25  (muddy brown)

  var STATE_FX = {};

  STATE_FX[STATE.IDLE] = {
    tint: null, glow: null, particle: null, pose: POSE.IDLE,
    spring: 0, lunge: 0, statusHue: null, statusAlpha: 0, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.ATTACKING] = {
    tint: 'rgba(255,80,60,0.15)',
    glow: { color: '#ff4030', radius: 6 },
    particle: '💥',
    pose: POSE.ATTACK,
    bob: 2,
    spring: 0, lunge: 0.6, statusHue: null, statusAlpha: 0, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.SLEEPING] = {
    tint: 'rgba(80,80,160,0.2)',
    glow: null,
    particle: '💤',
    pose: POSE.IDLE,
    overlay: 'Zzz',
    bob: 1,
    spring: 0, lunge: 0, statusHue: 240, statusAlpha: 0.08, ghostAlpha: 0.65, sleeping: true
  };

  STATE_FX[STATE.DEAD] = {
    tint: 'rgba(0,0,0,0.4)',
    glow: null,
    particle: null,
    pose: POSE.CORPSE,
    spring: 0, lunge: 0, statusHue: null, statusAlpha: 0, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.BOUND] = {
    tint: 'rgba(180,160,100,0.2)',
    glow: { color: '#a89060', radius: 3 },
    particle: '⛓️',
    pose: POSE.IDLE,
    overlay: 'BOUND',
    spring: 0, lunge: 0, statusHue: 40, statusAlpha: 0.18, ghostAlpha: 0.8, sleeping: false
  };

  STATE_FX[STATE.BURNING] = {
    tint: 'rgba(255,120,20,0.25)',
    glow: { color: '#ff6010', radius: 8 },
    particle: '🔥',
    pose: POSE.IDLE,
    pulse: { scale: 0.03, speed: 6 },
    spring: 0.3, lunge: 0, statusHue: 15, statusAlpha: 0.22, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.PARALYZED] = {
    tint: 'rgba(255,255,80,0.2)',
    glow: { color: '#ffff40', radius: 5 },
    particle: '⚡',
    pose: POSE.IDLE,
    overlay: 'PARA',
    spring: 0, lunge: 0, statusHue: 55, statusAlpha: 0.2, ghostAlpha: 0.7, sleeping: false
  };

  STATE_FX[STATE.FROZEN] = {
    tint: 'rgba(100,180,255,0.3)',
    glow: { color: '#60b0ff', radius: 6 },
    particle: '❄️',
    pose: POSE.IDLE,
    overlay: 'FREEZE',
    spring: 0, lunge: 0, statusHue: 210, statusAlpha: 0.25, ghostAlpha: 0.6, sleeping: false
  };

  STATE_FX[STATE.POISONED] = {
    tint: 'rgba(80,200,60,0.2)',
    glow: { color: '#40c830', radius: 4 },
    particle: '☠️',
    pose: POSE.IDLE,
    pulse: { scale: 0.02, speed: 3 },
    spring: 0.15, lunge: 0, statusHue: 110, statusAlpha: 0.2, ghostAlpha: 0.85, sleeping: false
  };

  STATE_FX[STATE.ENRAGED] = {
    tint: 'rgba(255,40,40,0.2)',
    glow: { color: '#ff2020', radius: 8 },
    particle: '😤',
    pose: POSE.ATTACK,
    pulse: { scale: 0.04, speed: 8 },
    bob: 3,
    spring: 0.5, lunge: 0.3, statusHue: 0, statusAlpha: 0.15, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.ATK_BUFFED] = {
    tint: 'rgba(255,160,60,0.15)',
    glow: { color: '#ffa030', radius: 4 },
    particle: '⚔️',
    pose: POSE.IDLE,
    overlay: 'ATK+',
    spring: 0.2, lunge: 0, statusHue: 30, statusAlpha: 0.12, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.DEF_BUFFED] = {
    tint: 'rgba(60,120,255,0.15)',
    glow: { color: '#3080ff', radius: 4 },
    particle: '🛡️',
    pose: POSE.IDLE,
    overlay: 'DEF+',
    spring: 0, lunge: 0, statusHue: 220, statusAlpha: 0.12, ghostAlpha: 1, sleeping: false
  };

  STATE_FX[STATE.DEF_DRAINED] = {
    tint: 'rgba(160,60,200,0.2)',
    glow: { color: '#a040c0', radius: 3 },
    particle: null,
    pose: POSE.IDLE,
    overlay: 'DEF-',
    spring: 0, lunge: 0, statusHue: 280, statusAlpha: 0.15, ghostAlpha: 0.75, sleeping: false
  };

  STATE_FX[STATE.ATK_DRAINED] = {
    tint: 'rgba(160,100,60,0.2)',
    glow: { color: '#a06030', radius: 3 },
    particle: null,
    pose: POSE.IDLE,
    overlay: 'ATK-',
    spring: 0, lunge: 0, statusHue: 25, statusAlpha: 0.15, ghostAlpha: 0.75, sleeping: false
  };

  STATE_FX[STATE.PACIFIED] = {
    tint: 'rgba(200,200,255,0.2)',
    glow: { color: '#c0c0ff', radius: 4 },
    particle: '🕊️',
    pose: POSE.IDLE,
    overlay: 'PEACE',
    spring: 0, lunge: 0, statusHue: 240, statusAlpha: 0.1, ghostAlpha: 0.85, sleeping: false
  };

  STATE_FX[STATE.CRIPPLED] = {
    tint: 'rgba(120,80,60,0.2)',
    glow: { color: '#806040', radius: 3 },
    particle: null,
    pose: POSE.IDLE,
    overlay: 'CRIP',
    bob: 1,
    spring: 0.1, lunge: 0, statusHue: 25, statusAlpha: 0.12, ghostAlpha: 0.8, sleeping: false
  };

  // ── Emoji pose system (legacy) ────────────────────────────────────
  // Each enemy type can register 3 emoji variants.
  // Falls back to the base emoji for missing poses.
  var _poseRegistry = {};

  /**
   * Register pose emojis for an enemy type (legacy single-emoji API).
   * Prefer registerStack() for new registrations.
   * @param {string} enemyType - e.g. 'goblin', 'skeleton'
   * @param {Object} poses - { idle: '👹', attack: '👺', corpse: '💀' }
   */
  function registerPoses(enemyType, poses) {
    _poseRegistry[enemyType] = {
      idle:   poses.idle   || poses.base || '👹',
      attack: poses.attack || poses.idle || poses.base || '👹',
      corpse: poses.corpse || '💀'
    };
  }

  // ── Triple emoji stack system ──────────────────────────────────────
  // Each enemy/NPC composes from 3 vertical slots (head, torso, legs)
  // with optional sub-layers (hat, weapons, modifiers).
  var _stackRegistry = {};

  /**
   * Register a triple emoji stack for an enemy/NPC type.
   *
   * @param {string} enemyType - e.g. 'goblin', 'hero_seeker'
   * @param {Object} def - Stack definition:
   *   head:    string   Slot 0 emoji ('' to skip)
   *   torso:   string   Slot 1 emoji ('' to skip)
   *   legs:    string   Slot 2 emoji ('' to skip)
   *   hat:     string|null   Sub-layer over/behind head
   *   hatScale:  number  Relative scale (default 0.5)
   *   hatBehind: boolean Render before head if true (hoods)
   *   backWeapon:  string|null  Behind torso (sheathed, backpack)
   *   backWeaponScale: number
   *   backWeaponOffsetX: number  Fraction of spriteW
   *   frontWeapon: string|null  In front of torso (wielded)
   *   frontWeaponScale: number
   *   frontWeaponOffsetX: number
   *   headMods:  Array|null  [{emoji, scale, offsetX, offsetY}]
   *   torsoMods: Array|null  [{emoji, scale, offsetX, offsetY}]
   *   corpse:  string   Collapsed single emoji on death
   *   tintHue: number|null  Hue shift degrees (0-360)
   */
  function registerStack(enemyType, def) {
    _stackRegistry[enemyType] = {
      head:    def.head    || '',
      torso:   def.torso   || '',
      legs:    def.legs    || '',
      hat:     def.hat     || null,
      hatScale:  def.hatScale  || 0.5,
      hatBehind: !!def.hatBehind,
      backWeapon:      def.backWeapon      || null,
      backWeaponScale: def.backWeaponScale || 0.4,
      backWeaponOffsetX: def.backWeaponOffsetX || 0.3,
      frontWeapon:      def.frontWeapon      || null,
      frontWeaponScale: def.frontWeaponScale || 0.65,
      frontWeaponOffsetX: def.frontWeaponOffsetX || -0.25,
      headMods:  def.headMods  || null,
      torsoMods: def.torsoMods || null,
      corpse: def.corpse || '💀',
      tintHue: (def.tintHue !== undefined && def.tintHue !== null) ? def.tintHue : null
    };
    // Also register legacy poses for backward compat (getEmoji fallback)
    _poseRegistry[enemyType] = {
      idle:   def.head || def.torso || '👹',
      attack: def.head || def.torso || '👹',
      corpse: def.corpse || '💀'
    };
  }

  /**
   * Get the stack definition for an enemy type, or null if not registered.
   * @param {string} enemyType
   * @returns {Object|null}
   */
  function getStack(enemyType) {
    return _stackRegistry[enemyType] || null;
  }

  /**
   * Get the emoji for a given enemy type and pose.
   * @param {string} enemyType
   * @param {string} pose - POSE constant
   * @param {string} fallbackEmoji - Default emoji if type not registered
   * @returns {string}
   */
  function getEmoji(enemyType, pose, fallbackEmoji) {
    var entry = _poseRegistry[enemyType];
    if (!entry) return fallbackEmoji || '👹';
    return entry[pose] || entry.idle || fallbackEmoji || '👹';
  }

  /**
   * Get the full visual FX descriptor for a state.
   * @param {string} state - STATE constant
   * @returns {Object} STATE_FX entry
   */
  function getFX(state) {
    return STATE_FX[state] || STATE_FX[STATE.IDLE];
  }

  /**
   * Determine which pose to use given an enemy's current state.
   * State FX can force a pose override; otherwise uses the enemy's
   * own pose field (set by combat logic).
   *
   * @param {Object} enemy - Enemy entity with .spriteState and .pose fields
   * @returns {string} POSE constant
   */
  function resolvePose(enemy) {
    var state = enemy.spriteState || STATE.IDLE;
    var fx = getFX(state);
    if (fx.pose) return fx.pose;
    return enemy.pose || POSE.IDLE;
  }

  /**
   * Compute render modifiers for a single frame.
   * Returns an object that the raycaster can use to adjust rendering.
   *
   * @param {Object} enemy - Enemy entity
   * @param {number} time - Current time in ms (for animation)
   * @returns {Object} { emoji, tint, glowColor, glowRadius, overlayText,
   *                      particleEmoji, scaleAdd, alphaAdd, bobY }
   */
  function computeFrame(enemy, time) {
    var state = enemy.spriteState || STATE.IDLE;
    var fx = getFX(state);
    var pose = resolvePose(enemy);
    var emoji = getEmoji(enemy.type, pose, enemy.emoji);

    var result = {
      emoji: emoji,
      stack: null,           // Triple stack data (null = use legacy emoji)
      stackFX: null,         // Per-stack FX: spring, lunge, flash, hue, alpha
      tint: fx.tint || null,
      glowColor: fx.glow ? fx.glow.color : null,
      glowRadius: fx.glow ? fx.glow.radius : 0,
      overlayText: fx.overlay || null,
      particleEmoji: fx.particle || null,
      scaleAdd: 0,
      alphaAdd: 0,
      bobY: 0
    };

    // Resolve stack if registered
    var stackDef = _stackRegistry[enemy.type];
    if (stackDef) {
      // Corpse pose collapses stack to single ground emoji
      if (pose === POSE.CORPSE) {
        result.emoji = stackDef.corpse || '💀';
        result.stack = null;
      } else {
        result.stack = {
          head:   stackDef.head,
          torso:  stackDef.torso,
          legs:   stackDef.legs,
          hat:    stackDef.hat    ? { emoji: stackDef.hat, scale: stackDef.hatScale, behind: stackDef.hatBehind } : null,
          backWeapon:  stackDef.backWeapon  ? { emoji: stackDef.backWeapon,  scale: stackDef.backWeaponScale,  offsetX: stackDef.backWeaponOffsetX }  : null,
          frontWeapon: stackDef.frontWeapon ? { emoji: stackDef.frontWeapon, scale: stackDef.frontWeaponScale, offsetX: stackDef.frontWeaponOffsetX } : null,
          headMods:  stackDef.headMods,
          torsoMods: stackDef.torsoMods,
          tintHue: stackDef.tintHue
        };
        // Legacy fallback emoji = head or torso (first non-empty slot)
        result.emoji = stackDef.head || stackDef.torso || emoji;
      }
    }

    // ── Stack FX: computed per-frame for the raycaster ──────────────
    if (result.stack) {
      // Travel spring: sinusoidal sway when spring > 0
      var springAmp = fx.spring || 0;
      // Enemy movement detection: use a fast hash of position+time
      // Moving enemies have their .moving flag set by EnemyAI
      var isMoving = enemy.moving || false;
      var travelSpring = 0;
      if (isMoving || springAmp > 0) {
        var springFreq = 5.5;  // Hz — brisk walk cycle
        var amp = isMoving ? Math.max(0.35, springAmp) : springAmp;
        travelSpring = Math.sin(time * 0.001 * springFreq * Math.PI * 2) * amp;
      }

      // Attack lunge: torso-first forward lean during ATTACKING state
      var lungeAmt = fx.lunge || 0;
      var lungePhase = 0;
      if (lungeAmt > 0 && state === STATE.ATTACKING) {
        // Ease-in-out lunge over 500ms cycle
        lungePhase = Math.sin(time * 0.001 * 4 * Math.PI) * lungeAmt;
      }

      // Damage flash: white overlay for 200ms after taking hit
      // enemy.lastHitTime is set by CombatBridge on damage
      var flashWhite = false;
      if (enemy.lastHitTime && (time - enemy.lastHitTime) < 200) {
        flashWhite = true;
      }

      // DoT tick flash: brief white pulse on DoT damage
      // enemy.lastDotTime set by CombatEngine on DoT tick
      var dotFlash = false;
      if (enemy.lastDotTime && (time - enemy.lastDotTime) < 150) {
        dotFlash = true;
      }

      result.stackFX = {
        travelSpring: travelSpring,      // X offset per slot (differential)
        lungePhase:   lungePhase,         // Forward lean amount
        flashWhite:   flashWhite,         // All-slot white overlay
        dotFlash:     dotFlash,           // Brief white on DoT tick
        statusHue:    fx.statusHue !== undefined ? fx.statusHue : null,
        statusAlpha:  fx.statusAlpha || 0,
        ghostAlpha:   fx.ghostAlpha !== undefined ? fx.ghostAlpha : 1,
        sleeping:     fx.sleeping || false
      };
    }

    // Pulse effect
    if (fx.pulse) {
      var pVal = Math.sin(time * fx.pulse.speed * 0.001) * 0.5 + 0.5;
      result.scaleAdd = fx.pulse.scale * pVal;
    }

    // Bob effect (vertical oscillation)
    if (fx.bob) {
      result.bobY = Math.sin(time * 0.004) * fx.bob;
    }

    return result;
  }

  // ── Death type classification ────────────────────────────────────
  // Some enemies fold into lootable corpses; others just poof.
  var DEATH_TYPE = {
    FOLD:  'fold',    // Origami fold → flatten to corpse tile
    POOF:  'poof'     // Particle burst → vanish entirely
  };

  /**
   * Determine the death type for an enemy.
   * Default: FOLD (lootable corpse). Ethereal/swarm enemies poof.
   *
   * @param {Object} enemy
   * @returns {string} DEATH_TYPE constant
   */
  function getDeathType(enemy) {
    if (enemy.deathType) return enemy.deathType;
    // Poof types: ghosts, swarms, elementals, summoned
    var poofTags = ['ethereal', 'swarm', 'elemental', 'summoned', 'illusion'];
    if (enemy.tags) {
      for (var i = 0; i < poofTags.length; i++) {
        if (enemy.tags.indexOf(poofTags[i]) !== -1) return DEATH_TYPE.POOF;
      }
    }
    return DEATH_TYPE.FOLD;
  }

  // ── Suit visual constants ─────────────────────────────────────────
  // Suit tint hues map to the RPS suit colours without overlapping
  // resource UI hues.  ♠ is achromatic (null tint), others shift.
  var SUIT_TINT = {
    spade:   null,    // Grey/earth — no hue shift (achromatic)
    club:    190,     // Electric Blue #00D4FF — cyan-blue
    diamond: 150,     // Toxic Green #00FFA6 — green
    heart:   330      // Vibrant Pink #FF6B9D — pink-magenta
  };

  // ── Register default enemy stacks ────────────────────────────────
  // Called during init.  Registers all 29 enemies.json archetypes
  // plus hero antagonists.  Suit identity is expressed through:
  //   • tintHue (suit colour wash)
  //   • creature body emojis (thematic to biome + suit)
  //   • headMods / torsoMods (suit-flavoured accessories)
  //   • weapon choices (suit-appropriate)
  function initDefaults() {

    // ================================================================
    //  CELLAR BIOME — ♠ Spade-dominant (earth / undead / bone)
    // ================================================================

    // ENM-001  Cobweb Crawler  ♠ — fast sneaky opener
    registerStack('cobweb_crawler', {
      head: '🕷️', torso: '', legs: '',
      headMods: [{ emoji: '🕸️', scale: 0.4, offsetX: -0.3, offsetY: -0.1 }],
      tintHue: SUIT_TINT.spade,
      corpse: '🕸️'
    });

    // ENM-002  Shambling Corpse  ♠ — tank intro
    registerStack('shambling_corpse', {
      head: '🧟', torso: '🦴', legs: '🦿',
      torsoMods: [{ emoji: '🪦', scale: 0.2, offsetX: 0.3, offsetY: 0.0 }],
      tintHue: SUIT_TINT.spade,
      corpse: '🦴'
    });

    // ENM-003  Dungeon Rat  ♠ — non-lethal filler
    registerStack('dungeon_rat', {
      head: '🐀', torso: '', legs: '',
      tintHue: SUIT_TINT.spade,
      corpse: '🦴'
    });

    // ENM-004  Bone Guard  ♠ — standard combat
    registerStack('bone_guard', {
      head: '💀', torso: '🦴', legs: '🦿',
      frontWeapon: '⚔️', frontWeaponScale: 0.5,
      backWeapon: '🛡️', backWeaponScale: 0.35, backWeaponOffsetX: 0.3,
      tintHue: SUIT_TINT.spade,
      corpse: '🦴'
    });

    // ENM-005  Mold Wraith  ♣ — club suit intro in cellar
    registerStack('mold_wraith', {
      head: '👻', torso: '', legs: '',
      headMods: [
        { emoji: '💧', scale: 0.2, offsetX: 0.3, offsetY: 0.1 },
        { emoji: '✨', scale: 0.15, offsetX: -0.25, offsetY: -0.15 }
      ],
      tintHue: SUIT_TINT.club,
      corpse: '✨'
    });

    // ENM-006  Cave Toad  ♦ — diamond suit intro in cellar
    registerStack('cave_toad', {
      head: '🐸', torso: '', legs: '',
      headMods: [{ emoji: '💎', scale: 0.18, offsetX: 0.3, offsetY: -0.1 }],
      tintHue: SUIT_TINT.diamond,
      corpse: '💎'
    });

    // ENM-007  Rot Hound  ♠ — elite
    registerStack('rot_hound', {
      head: '🐕', torso: '🦴', legs: '',
      headMods: [{ emoji: '💀', scale: 0.18, offsetX: 0.25, offsetY: -0.15 }],
      tintHue: SUIT_TINT.spade,
      corpse: '🦴'
    });

    // ENM-008  Bone Sovereign  ♠ — cellar boss
    registerStack('bone_sovereign', {
      head: '💀', torso: '🦴', legs: '🦿',
      hat: '👑', hatScale: 0.55,
      frontWeapon: '🗡️', frontWeaponScale: 0.7,
      backWeapon: '🛡️', backWeaponScale: 0.45, backWeaponOffsetX: 0.3,
      headMods: [{ emoji: '🔮', scale: 0.2, offsetX: -0.3, offsetY: 0.0 }],
      tintHue: SUIT_TINT.spade,
      corpse: '👑'
    });

    // ================================================================
    //  FOUNDRY BIOME — ♦ Diamond-dominant (crystal / construct / forge)
    // ================================================================

    // ENM-010  Soot Imp  ♦ — small organic
    registerStack('soot_imp', {
      head: '👺', torso: '🧥', legs: '👖',
      headMods: [{ emoji: '🔥', scale: 0.2, offsetX: 0.25, offsetY: -0.1 }],
      tintHue: SUIT_TINT.diamond,
      corpse: '💀'
    });

    // ENM-011  Iron Golem  ♠ — tank construct
    registerStack('iron_golem', {
      head: '🤖', torso: '🗿', legs: '🦿',
      torsoMods: [{ emoji: '⚙️', scale: 0.2, offsetX: 0.3, offsetY: 0.0 }],
      tintHue: SUIT_TINT.spade,
      corpse: '⬛'
    });

    // ENM-012  Slag Hound  ♦ — fast forge creature
    registerStack('slag_hound', {
      head: '🐺', torso: '', legs: '',
      headMods: [{ emoji: '🔥', scale: 0.18, offsetX: 0.25, offsetY: 0.15 }],
      tintHue: SUIT_TINT.diamond,
      corpse: '🦴'
    });

    // ENM-013  Clockwork Guard  ♣ — club suit construct
    registerStack('clockwork_guard', {
      head: '⚙️', torso: '🤖', legs: '🦿',
      frontWeapon: '🔧', frontWeaponScale: 0.55,
      torsoMods: [{ emoji: '⚡', scale: 0.18, offsetX: -0.25, offsetY: 0.0 }],
      tintHue: SUIT_TINT.club,
      corpse: '⚙️'
    });

    // ENM-014  Ember Sprite  ♦ — glass cannon
    registerStack('ember_sprite', {
      head: '✨', torso: '', legs: '',
      headMods: [{ emoji: '🔥', scale: 0.25, offsetX: 0.0, offsetY: 0.2 }],
      tintHue: SUIT_TINT.diamond,
      corpse: '✨'
    });

    // ENM-015  Scrap Brute  ♠ — elite tank
    registerStack('scrap_brute', {
      head: '🦾', torso: '🗿', legs: '🦿',
      frontWeapon: '🔨', frontWeaponScale: 0.65,
      torsoMods: [{ emoji: '⚙️', scale: 0.18, offsetX: 0.3, offsetY: 0.1 }],
      tintHue: SUIT_TINT.spade,
      corpse: '⬛'
    });

    // ENM-016  Smelt Master  ♦ — elite foreman
    registerStack('smelt_master', {
      head: '😤', torso: '🦺', legs: '🥾',
      hat: '⛑️', hatScale: 0.5,
      frontWeapon: '🔨', frontWeaponScale: 0.65,
      headMods: [{ emoji: '🔥', scale: 0.15, offsetX: 0.25, offsetY: -0.1 }],
      tintHue: SUIT_TINT.diamond,
      corpse: '🔨'
    });

    // ENM-017  The Amalgam  ♦ — foundry boss
    registerStack('the_amalgam', {
      head: '🏭', torso: '🗿', legs: '🦿',
      torsoMods: [
        { emoji: '⚙️', scale: 0.2, offsetX: -0.3, offsetY: 0.0 },
        { emoji: '🔥', scale: 0.2, offsetX: 0.3, offsetY: 0.1 }
      ],
      tintHue: SUIT_TINT.diamond,
      corpse: '🏭'
    });

    // ================================================================
    //  SEALAB BIOME — ♣ Club-dominant (wild / marine / arcane)
    // ================================================================

    // ENM-020  Tide Stalker  ♠ — fast marine
    registerStack('tide_stalker', {
      head: '🦈', torso: '', legs: '',
      headMods: [{ emoji: '💧', scale: 0.18, offsetX: 0.25, offsetY: 0.1 }],
      tintHue: SUIT_TINT.spade,
      corpse: '🦴'
    });

    // ENM-021  Shock Eel  ♣ — stealthy marine
    registerStack('shock_eel', {
      head: '🐍', torso: '', legs: '',
      headMods: [{ emoji: '⚡', scale: 0.2, offsetX: 0.3, offsetY: -0.1 }],
      tintHue: SUIT_TINT.club,
      corpse: '⚡'
    });

    // ENM-022  Lab Drone  ♣ — construct detector
    registerStack('lab_drone', {
      head: '🔬', torso: '🤖', legs: '',
      torsoMods: [{ emoji: '⚡', scale: 0.15, offsetX: -0.25, offsetY: 0.0 }],
      tintHue: SUIT_TINT.club,
      corpse: '🔬'
    });

    // ENM-023  Deep Crawler  ♠ — high HP brute
    registerStack('deep_crawler', {
      head: '🦀', torso: '', legs: '',
      headMods: [{ emoji: '💧', scale: 0.18, offsetX: -0.3, offsetY: 0.1 }],
      tintHue: SUIT_TINT.spade,
      corpse: '🦴'
    });

    // ENM-024  Brine Wraith  ♠ — stealthy undead
    registerStack('brine_wraith', {
      head: '👻', torso: '', legs: '',
      headMods: [{ emoji: '💧', scale: 0.2, offsetX: 0.3, offsetY: 0.0 }],
      tintHue: SUIT_TINT.spade,
      corpse: '✨'
    });

    // ENM-025  Bio-Hazard Slime  ♣ — non-lethal organic
    registerStack('bio_hazard_slime', {
      head: '', torso: '💧', legs: '',
      torsoMods: [{ emoji: '💧', scale: 0.22, offsetX: 0.3, offsetY: -0.15 }],
      tintHue: SUIT_TINT.club,
      corpse: '💧'
    });

    // ENM-026  Admiralty Enforcer  ♣ — elite marine
    registerStack('admiralty_enforcer', {
      head: '😠', torso: '🥷', legs: '🥾',
      hat: '⚓', hatScale: 0.45,
      frontWeapon: '🔱', frontWeaponScale: 0.65,
      backWeapon: '🛡️', backWeaponScale: 0.35, backWeaponOffsetX: 0.3,
      tintHue: SUIT_TINT.club,
      corpse: '⚓'
    });

    // ENM-027  Cryo-Brute  ♠ — elite construct
    registerStack('cryo_brute', {
      head: '🧊', torso: '🗿', legs: '🦿',
      torsoMods: [{ emoji: '❄️', scale: 0.2, offsetX: -0.25, offsetY: 0.0 }],
      tintHue: SUIT_TINT.spade,
      corpse: '🧊'
    });

    // ENM-028  The Archivist  ♣ — sealab boss
    registerStack('the_archivist', {
      head: '🌊', torso: '🥼', legs: '🦿',
      hat: '🎓', hatScale: 0.5,
      frontWeapon: '🔱', frontWeaponScale: 0.7,
      headMods: [{ emoji: '⚡', scale: 0.2, offsetX: -0.3, offsetY: -0.1 }],
      tintHue: SUIT_TINT.club,
      corpse: '🌊'
    });

    // ================================================================
    //  CROSS-BIOME / SPECIAL
    // ================================================================

    // ENM-090  Hero's Shadow  ♥ — rare elite
    registerStack('heros_shadow', {
      head: '👤', torso: '🖤', legs: '🦿',
      frontWeapon: '🗡️', frontWeaponScale: 0.6,
      headMods: [{ emoji: '💔', scale: 0.18, offsetX: 0.25, offsetY: -0.1 }],
      tintHue: SUIT_TINT.heart,
      corpse: '💀'
    });

    // ENM-091  Wandering Vendor  ♠ — non-lethal shop trigger
    registerStack('wandering_vendor', {
      head: '🛒', torso: '🧥', legs: '👖',
      tintHue: SUIT_TINT.spade,
      corpse: '🛒'
    });

    // ================================================================
    //  HERO ANTAGONIST STACKS (story encounters)
    // ================================================================

    registerStack('hero_seeker', {
      head: '😤', torso: '🥷', legs: '🥾',
      hat: '⛑️', hatScale: 0.5,
      frontWeapon: '⚔️', frontWeaponScale: 0.75, frontWeaponOffsetX: -0.2,
      backWeapon: '🛡️', backWeaponScale: 0.4, backWeaponOffsetX: 0.3,
      tintHue: 45,
      corpse: '💀'
    });
    registerStack('hero_scholar', {
      head: '🧐', torso: '🥼', legs: '👖',
      hat: '🎓', hatScale: 0.5,
      frontWeapon: '🪄', frontWeaponScale: 0.6,
      corpse: '💀'
    });
    registerStack('hero_shadow', {
      head: '😈', torso: '🖤', legs: '🦿',
      frontWeapon: '🗡️', frontWeaponScale: 0.6,
      backWeapon: '🏹', backWeaponScale: 0.4,
      corpse: '💀'
    });
    registerStack('hero_crusader', {
      head: '😠', torso: '🦺', legs: '🥾',
      hat: '👑', hatScale: 0.5,
      frontWeapon: '🔱', frontWeaponScale: 0.7,
      backWeapon: '🛡️', backWeaponScale: 0.4,
      corpse: '💀'
    });

    // Legacy aliases — backward compat for old type names
    // These map old generic names to the nearest canonical enemy
    _stackRegistry['goblin']   = _stackRegistry['soot_imp'];
    _stackRegistry['skeleton'] = _stackRegistry['bone_guard'];
    _stackRegistry['slime']    = _stackRegistry['bio_hazard_slime'];
    _stackRegistry['bat']      = _stackRegistry['cobweb_crawler'];
    _stackRegistry['ghost']    = _stackRegistry['mold_wraith'];
    _stackRegistry['rat']      = _stackRegistry['dungeon_rat'];
    _stackRegistry['spider']   = _stackRegistry['cobweb_crawler'];
    _stackRegistry['mimic']    = _stackRegistry['wandering_vendor'];
    _stackRegistry['golem']    = _stackRegistry['iron_golem'];
    _stackRegistry['dragon']   = _stackRegistry['the_archivist'];
    _stackRegistry['orc']      = _stackRegistry['scrap_brute'];
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    STATE:         STATE,
    POSE:          POSE,
    DEATH_TYPE:    DEATH_TYPE,
    STATE_FX:      STATE_FX,
    SUIT_TINT:     SUIT_TINT,
    registerPoses: registerPoses,
    registerStack: registerStack,
    getStack:      getStack,
    getEmoji:      getEmoji,
    getFX:         getFX,
    resolvePose:   resolvePose,
    computeFrame:  computeFrame,
    getDeathType:  getDeathType,
    initDefaults:  initDefaults
  };
})();

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

  var STATE_FX = {};

  STATE_FX[STATE.IDLE] = {
    tint: null, glow: null, particle: null, pose: POSE.IDLE
  };

  STATE_FX[STATE.ATTACKING] = {
    tint: 'rgba(255,80,60,0.15)',
    glow: { color: '#ff4030', radius: 6 },
    particle: '💥',
    pose: POSE.ATTACK,
    bob: 2
  };

  STATE_FX[STATE.SLEEPING] = {
    tint: 'rgba(80,80,160,0.2)',
    glow: null,
    particle: '💤',
    pose: POSE.IDLE,
    overlay: 'Zzz',
    bob: 1
  };

  STATE_FX[STATE.DEAD] = {
    tint: 'rgba(0,0,0,0.4)',
    glow: null,
    particle: null,
    pose: POSE.CORPSE
  };

  STATE_FX[STATE.BOUND] = {
    tint: 'rgba(180,160,100,0.2)',
    glow: { color: '#a89060', radius: 3 },
    particle: '⛓️',
    pose: POSE.IDLE,
    overlay: 'BOUND'
  };

  STATE_FX[STATE.BURNING] = {
    tint: 'rgba(255,120,20,0.25)',
    glow: { color: '#ff6010', radius: 8 },
    particle: '🔥',
    pose: POSE.IDLE,
    pulse: { scale: 0.03, speed: 6 }
  };

  STATE_FX[STATE.PARALYZED] = {
    tint: 'rgba(255,255,80,0.2)',
    glow: { color: '#ffff40', radius: 5 },
    particle: '⚡',
    pose: POSE.IDLE,
    overlay: 'PARA'
  };

  STATE_FX[STATE.FROZEN] = {
    tint: 'rgba(100,180,255,0.3)',
    glow: { color: '#60b0ff', radius: 6 },
    particle: '❄️',
    pose: POSE.IDLE,
    overlay: 'FREEZE'
  };

  STATE_FX[STATE.POISONED] = {
    tint: 'rgba(80,200,60,0.2)',
    glow: { color: '#40c830', radius: 4 },
    particle: '☠️',
    pose: POSE.IDLE,
    pulse: { scale: 0.02, speed: 3 }
  };

  STATE_FX[STATE.ENRAGED] = {
    tint: 'rgba(255,40,40,0.2)',
    glow: { color: '#ff2020', radius: 8 },
    particle: '😤',
    pose: POSE.ATTACK,
    pulse: { scale: 0.04, speed: 8 },
    bob: 3
  };

  STATE_FX[STATE.ATK_BUFFED] = {
    tint: 'rgba(255,160,60,0.15)',
    glow: { color: '#ffa030', radius: 4 },
    particle: '⚔️',
    pose: POSE.IDLE,
    overlay: 'ATK+'
  };

  STATE_FX[STATE.DEF_BUFFED] = {
    tint: 'rgba(60,120,255,0.15)',
    glow: { color: '#3080ff', radius: 4 },
    particle: '🛡️',
    pose: POSE.IDLE,
    overlay: 'DEF+'
  };

  STATE_FX[STATE.DEF_DRAINED] = {
    tint: 'rgba(160,60,200,0.2)',
    glow: { color: '#a040c0', radius: 3 },
    particle: null,
    pose: POSE.IDLE,
    overlay: 'DEF-'
  };

  STATE_FX[STATE.ATK_DRAINED] = {
    tint: 'rgba(160,100,60,0.2)',
    glow: { color: '#a06030', radius: 3 },
    particle: null,
    pose: POSE.IDLE,
    overlay: 'ATK-'
  };

  STATE_FX[STATE.PACIFIED] = {
    tint: 'rgba(200,200,255,0.2)',
    glow: { color: '#c0c0ff', radius: 4 },
    particle: '🕊️',
    pose: POSE.IDLE,
    overlay: 'PEACE'
  };

  STATE_FX[STATE.CRIPPLED] = {
    tint: 'rgba(120,80,60,0.2)',
    glow: { color: '#806040', radius: 3 },
    particle: null,
    pose: POSE.IDLE,
    overlay: 'CRIP',
    bob: 1
  };

  // ── Emoji pose system ────────────────────────────────────────────
  // Each enemy type can register 3 emoji variants.
  // Falls back to the base emoji for missing poses.
  var _poseRegistry = {};

  /**
   * Register pose emojis for an enemy type.
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
      tint: fx.tint || null,
      glowColor: fx.glow ? fx.glow.color : null,
      glowRadius: fx.glow ? fx.glow.radius : 0,
      overlayText: fx.overlay || null,
      particleEmoji: fx.particle || null,
      scaleAdd: 0,
      alphaAdd: 0,
      bobY: 0
    };

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

  // ── Register default enemy poses ─────────────────────────────────
  // Called during init. Game modules can register more later.
  function initDefaults() {
    registerPoses('goblin',   { idle: '👹', attack: '👺', corpse: '💀' });
    registerPoses('skeleton', { idle: '💀', attack: '☠️', corpse: '🦴' });
    registerPoses('slime',    { idle: '🟢', attack: '🟣', corpse: '💧' });
    registerPoses('bat',      { idle: '🦇', attack: '🦇', corpse: '🪶' });
    registerPoses('ghost',    { idle: '👻', attack: '👻', corpse: '✨' });
    registerPoses('rat',      { idle: '🐀', attack: '🐀', corpse: '🦴' });
    registerPoses('spider',   { idle: '🕷️', attack: '🕸️', corpse: '🕷️' });
    registerPoses('mimic',    { idle: '📦', attack: '👄', corpse: '💰' });
    registerPoses('golem',    { idle: '🗿', attack: '👊', corpse: '🪨' });
    registerPoses('dragon',   { idle: '🐉', attack: '🔥', corpse: '🐲' });
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    STATE:         STATE,
    POSE:          POSE,
    DEATH_TYPE:    DEATH_TYPE,
    STATE_FX:      STATE_FX,
    registerPoses: registerPoses,
    getEmoji:      getEmoji,
    getFX:         getFX,
    resolvePose:   resolvePose,
    computeFrame:  computeFrame,
    getDeathType:  getDeathType,
    initDefaults:  initDefaults
  };
})();

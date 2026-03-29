/**
 * KaomojiCapsule — animated kaomoji pill overlay for enemy/NPC sprites.
 *
 * Renders a translucent rounded-rect capsule above the head slot of any
 * sprite, displaying kaomoji text that conveys intent (combat) or speech
 * (NPC dialogue). Replaces the old floating emoji glyph intent display.
 *
 * Two modes:
 *   INTENT  — combat telegraph. Flashes periodically + on state change.
 *             Kaomoji from EyesOnly's 13-glyph ASCII catalog.
 *   SPEECH  — NPC talking. Shows rolling ellipsis (/.../) while text
 *             prints to the dialog box. Dismissed on dialog close.
 *
 * Animated kaomoji: some glyphs have a secondary "twitch" frame that
 * plays briefly mid-flash (^_^ → ^_~ wink, >__< → >_< squint, etc).
 *
 * Layer 2 — depends on: EnemyIntent (optional), DialogBox (optional)
 */
var KaomojiCapsule = (function () {
  'use strict';

  // ── Kaomoji catalog ──────────────────────────────────────────────
  // Each entry has a base glyph plus an optional animation frame.
  // Animation plays as: base → anim (150ms) → base within each flash.
  var KAOMOJI = {
    calm:       { base: '^_^',   anim: '^_~',  color: [120,200,120] },
    focused:    { base: '>__<',  anim: '>_<',   color: [200,160, 60] },
    angry:      { base: '>:()',  anim: '>:(',   color: [220,100, 60] },
    enraged:    { base: '#>_<',  anim: '#>.<',  color: [255, 60, 60] },
    surprised:  { base: 'O_O',  anim: 'o_O',   color: [160,180,220] },
    dazed:      { base: 'X_X',  anim: 'x_X',   color: [180,180,100] },
    sleeping:   { base: '-_-',  anim: '-_-z',   color: [100,100,180] },
    confident:  { base: '^w^',  anim: '^v^',    color: [200,160,220] },
    desperate:  { base: '@_@',  anim: '@.@',    color: [200,120,100] },
    charged:    { base: '*_*',  anim: '⁕_⁕',   color: [255,200, 60] },
    // NPC / dialogue modes
    speaking:   { base: '...',  anim: ' ..',    color: [180,200,220] },
    greeting:   { base: '^_^/', anim: '^_~/',   color: [140,220,160] },
    thinking:   { base: '?.?',  anim: '?_?',    color: [180,180,200] }
  };

  // Map EnemyIntent expression names to kaomoji keys
  var _INTENT_MAP = {
    'Calm':       'calm',
    'Focused':    'focused',
    'Angry':      'angry',
    'Enraged':    'enraged',
    'Surprised':  'surprised',
    'Dazed':      'dazed',
    'Sleeping':   'sleeping',
    'Confident':  'confident',
    'Desperate':  'desperate',
    'Charged':    'charged'
  };

  // ── Active capsule states (keyed by sprite ID) ───────────────────
  // Multiple capsules can be active simultaneously (one enemy in combat,
  // one NPC speaking, etc).
  var _capsules = {};

  // ── Flash timing constants ───────────────────────────────────────
  var FLASH_DURATION  = 900;   // ms visible per flash
  var FLASH_INTERVAL  = 2800;  // ms between flash starts (combat idle)
  var ANIM_DELAY      = 300;   // ms into flash before twitch frame
  var ANIM_DURATION   = 150;   // ms twitch frame holds
  var FADE_IN         = 120;   // ms alpha ramp up
  var FADE_OUT        = 200;   // ms alpha ramp down

  // Speech mode: capsule stays visible continuously (no flash cycle)
  var SPEECH_ELLIPSIS_RATE = 400; // ms per dot cycle

  // ── Capsule lifecycle ────────────────────────────────────────────

  /**
   * Show a kaomoji capsule above a sprite.
   * @param {string|number} spriteId - ID to match against sprite.id in raycaster
   * @param {string} kaomojiKey - Key from KAOMOJI catalog
   * @param {string} mode - 'intent' | 'speech'
   */
  function show(spriteId, kaomojiKey, mode) {
    var kao = KAOMOJI[kaomojiKey] || KAOMOJI.calm;
    var now = performance.now();
    _capsules[spriteId] = {
      key: kaomojiKey,
      base: kao.base,
      anim: kao.anim,
      color: kao.color,
      mode: mode || 'intent',
      flashStart: now,
      lastFlashStart: now,
      continuous: (mode === 'speech'),
      active: true
    };
  }

  /**
   * Trigger an immediate flash (e.g. on combat event or state change).
   * If no capsule exists for this sprite, creates one.
   * @param {string|number} spriteId
   * @param {string} kaomojiKey
   */
  function flash(spriteId, kaomojiKey) {
    var kao = KAOMOJI[kaomojiKey] || KAOMOJI.calm;
    var now = performance.now();
    var cap = _capsules[spriteId];
    if (cap) {
      cap.key = kaomojiKey;
      cap.base = kao.base;
      cap.anim = kao.anim;
      cap.color = kao.color;
      cap.lastFlashStart = now;
    } else {
      show(spriteId, kaomojiKey, 'intent');
    }
  }

  /**
   * Dismiss capsule for a sprite.
   * @param {string|number} spriteId
   */
  function dismiss(spriteId) {
    delete _capsules[spriteId];
  }

  /** Dismiss all capsules. */
  function clear() {
    _capsules = {};
  }

  /**
   * Update from EnemyIntent system — called each frame during combat.
   * Translates intent expression name to kaomoji key.
   * @param {Object} intentData - From EnemyIntent.getRenderData()
   */
  function updateFromIntent(intentData) {
    if (!intentData || intentData.enemyId === null || intentData.enemyId === undefined) return;
    var kaoKey = _INTENT_MAP[intentData.threat === 'high' ? _guessKeyFromGlyph(intentData.glyph) : _guessKeyFromGlyph(intentData.glyph)] || 'calm';
    // Only flash on change
    var existing = _capsules[intentData.enemyId];
    if (existing && existing.key === kaoKey && existing.mode === 'intent') return;
    flash(intentData.enemyId, kaoKey);
    // Mark as intent mode
    if (_capsules[intentData.enemyId]) {
      _capsules[intentData.enemyId].mode = 'intent';
      _capsules[intentData.enemyId].continuous = false;
    }
  }

  /**
   * Best-effort map from EnemyIntent expression name to kaomoji key.
   * Works via the _INTENT_MAP keyed by expression.name.
   */
  function _guessKeyFromGlyph(glyph) {
    // EnemyIntent uses emoji glyphs; we need to reverse-map to expression name
    // The intent data has .threat but not .name directly, so we compare glyphs
    if (typeof EnemyIntent !== 'undefined') {
      var exprs = EnemyIntent.EXPRESSIONS;
      for (var key in exprs) {
        if (exprs[key].glyph === glyph) {
          return _INTENT_MAP[exprs[key].name] || 'calm';
        }
      }
    }
    return 'calm';
  }

  /**
   * Start speech capsule for an NPC sprite.
   * @param {string|number} spriteId
   * @param {string} [kaomojiKey] - Default 'speaking'
   */
  function startSpeech(spriteId, kaomojiKey) {
    show(spriteId, kaomojiKey || 'speaking', 'speech');
  }

  /**
   * Stop speech capsule for an NPC sprite.
   * @param {string|number} spriteId
   */
  function stopSpeech(spriteId) {
    var cap = _capsules[spriteId];
    if (cap && cap.mode === 'speech') {
      dismiss(spriteId);
    }
  }

  // ── Render data (consumed by raycaster) ──────────────────────────

  /**
   * Get capsule render data for a specific sprite.
   * Returns null if no capsule is active or currently invisible (between flashes).
   *
   * @param {string|number} spriteId
   * @param {number} now - performance.now()
   * @returns {Object|null} { text, alpha, bgColor, textColor }
   */
  function getRenderData(spriteId, now) {
    var cap = _capsules[spriteId];
    if (!cap || !cap.active) return null;

    // ── Speech mode: always visible with rolling ellipsis ──
    if (cap.continuous) {
      var dots = Math.floor(now / SPEECH_ELLIPSIS_RATE) % 4;
      var ellipsis;
      if (cap.key === 'speaking') {
        // Rolling: .  ..  ...  (blank)
        ellipsis = dots === 0 ? '.' : dots === 1 ? '..' : dots === 2 ? '...' : '';
      } else {
        // Non-ellipsis speech kaomoji (greeting, thinking) — use anim cycle
        var speechCycle = (now - cap.flashStart) % (FLASH_DURATION * 2);
        ellipsis = speechCycle < FLASH_DURATION ? cap.base : (cap.anim || cap.base);
      }
      return {
        text: ellipsis,
        alpha: 0.85,
        bgR: cap.color[0], bgG: cap.color[1], bgB: cap.color[2]
      };
    }

    // ── Intent mode: periodic flash cycle ──
    var elapsed = now - cap.lastFlashStart;
    var cyclePos = elapsed % FLASH_INTERVAL;

    // Between flashes — invisible
    if (cyclePos > FLASH_DURATION) return null;

    // Alpha envelope: fade in → hold → fade out
    var alpha;
    if (cyclePos < FADE_IN) {
      alpha = cyclePos / FADE_IN;
    } else if (cyclePos < FLASH_DURATION - FADE_OUT) {
      alpha = 1.0;
    } else {
      alpha = Math.max(0, (FLASH_DURATION - cyclePos) / FADE_OUT);
    }

    // Animated twitch frame
    var text = cap.base;
    if (cap.anim && cyclePos >= ANIM_DELAY && cyclePos < ANIM_DELAY + ANIM_DURATION) {
      text = cap.anim;
    }

    return {
      text: text,
      alpha: alpha * 0.9,
      bgR: cap.color[0], bgG: cap.color[1], bgB: cap.color[2]
    };
  }

  /**
   * Check if any capsule is active for a sprite.
   * @param {string|number} spriteId
   * @returns {boolean}
   */
  function isActive(spriteId) {
    return !!_capsules[spriteId];
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    KAOMOJI:          KAOMOJI,
    show:             show,
    flash:            flash,
    dismiss:          dismiss,
    clear:            clear,
    updateFromIntent: updateFromIntent,
    startSpeech:      startSpeech,
    stopSpeech:       stopSpeech,
    getRenderData:    getRenderData,
    isActive:         isActive
  };
})();

/**
 * MonologuePeek — intrusive thought / internal monologue overlay.
 *
 * Gleaner's inner voice. Displays text over cinematic letterbox bars
 * during key moments: morning recaps, conspiracy realizations,
 * emotional reactions to what the hero left behind, obtrusive thoughts
 * that break through during exploration.
 *
 * Visual style: italic text rendered on the letterbox bars themselves
 * (top bar = speaker attribution, bottom bar = thought text), with
 * typewriter reveal and slow fade. Feels like subtitles in a film
 * noir, but the character is talking to themselves.
 *
 * Trigger points:
 *   - Spawn-in / morning recap (automatic, timed)
 *   - First time seeing specific evidence (corpse type, dragon scale)
 *   - Entering a new biome for the first time
 *   - After combat (reaction to violence)
 *   - Bonfire rest (reflection)
 *   - Player-initiated "think" action (future)
 *
 * Layer 2 (after CinematicCamera)
 * Depends on: CinematicCamera, i18n (optional), AudioSystem (optional)
 */
var MonologuePeek = (function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var _active = false;
  var _queue = [];          // Array of { text, attribution, duration, preset }
  var _current = null;      // Currently displaying monologue line
  var _charIndex = 0;       // Typewriter position
  var _charTimer = 0;       // ms until next character
  var _lineElapsed = 0;     // ms since current line started
  var _fadeOut = 1;         // 1 = fully visible, 0 = invisible
  var _fadingOut = false;

  // ── Config ─────────────────────────────────────────────────────
  var CHAR_SPEED = 35;        // ms per character (typewriter speed)
  var HOLD_AFTER_REVEAL = 1200; // ms to hold after full reveal before fade
  var FADE_DURATION = 600;     // ms to fade out
  var LINE_GAP = 300;          // ms between consecutive lines

  // ── Visual style ───────────────────────────────────────────────
  var STYLE = {
    textColor: 'rgba(200,195,180,0.92)',
    attrColor: 'rgba(140,135,120,0.65)',
    textFont: 'italic 15px "Consolas", "Monaco", monospace',
    attrFont: 'italic 11px "Consolas", "Monaco", monospace',
    // Text renders on the letterbox bars — positioned as percentage
    // from bar inner edge
    topBarTextY: 0.55,    // Attribution on top bar, centered vertically
    bottomBarTextY: 0.45  // Thought on bottom bar, centered vertically
  };

  // ── Preset monologue sequences ─────────────────────────────────

  var SEQUENCES = {
    /**
     * Morning spawn-in recap. Player wakes up, recaps yesterday.
     * Called from FloorManager when loading the "morning" state.
     */
    morning_recap: [
      { attribution: 'GLEANER', text: '...another night in this town.', duration: 3000 },
      { attribution: 'GLEANER', text: 'The walls still smell like smoke and copper.', duration: 3500 },
      { attribution: 'GLEANER', text: 'Time to clean up someone else\'s mess.', duration: 3000 }
    ],

    /**
     * First corpse discovery. Player finds hero's handiwork.
     */
    first_corpse: [
      { attribution: 'GLEANER', text: 'That\'s... not a monster.', duration: 2500 },
      { attribution: 'GLEANER', text: 'The scales. The markings. This was a guardian.', duration: 3500 }
    ],

    /**
     * Dragon evidence realization.
     */
    dragon_evidence: [
      { attribution: 'GLEANER', text: 'They told us dragons were the enemy.', duration: 3000 },
      { attribution: 'GLEANER', text: 'But this one died protecting something.', duration: 3500 }
    ],

    /**
     * Bonfire reflection. Rest-triggered contemplation.
     */
    bonfire_rest: [
      { attribution: 'GLEANER', text: 'Quiet, for once.', duration: 2000 },
      { attribution: 'GLEANER', text: 'The fire doesn\'t judge. It just burns.', duration: 3000 }
    ],

    /**
     * Post-combat reaction. After defeating an enemy.
     */
    post_combat: [
      { attribution: 'GLEANER', text: 'I\'m a cleaner, not a fighter.', duration: 2500 },
      { attribution: 'GLEANER', text: 'Since when did the mops start biting back?', duration: 3000 }
    ],

    /**
     * Dispatcher grab opening. NPC turns player around.
     */
    dispatcher_grab: [
      { attribution: '???', text: 'Hey. Hey! You\'re going the wrong way, rookie.', duration: 3000 },
      { attribution: 'REN', text: 'Briefing\'s this way. Try to keep up.', duration: 2500 }
    ],

    /**
     * Deploy dropoff. Plays immediately after the driving cutscene
     * deposits the player on Floor 0. The feeling: "you were just
     * dropped off in the middle of nowhere."
     */
    deploy_dropoff: [
      { attribution: 'GLEANER', text: '...and just like that, they drove off.', duration: 3000 },
      { attribution: 'GLEANER', text: 'No map. No briefing. Just a field and a door.', duration: 3500 },
      { attribution: 'GLEANER', text: 'Guess I should start walking.', duration: 2500 }
    ]
  };

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Play a monologue sequence.
   *
   * @param {string|Array} sequence - Preset name or array of line objects
   * @param {Object} [opts] - Options
   * @param {string} [opts.cameraPreset] - CinematicCamera preset (default: 'monologue')
   * @param {Function} [opts.onComplete] - Called when all lines finish
   */
  function play(sequence, opts) {
    opts = opts || {};

    var lines;
    if (typeof sequence === 'string') {
      lines = SEQUENCES[sequence];
      if (!lines) {
        console.warn('[MonologuePeek] Unknown sequence: ' + sequence);
        return;
      }
      // Clone so we don't mutate the template
      lines = lines.slice();
    } else if (Array.isArray(sequence)) {
      lines = sequence.slice();
    } else {
      return;
    }

    _queue = lines;
    _active = true;
    _fadingOut = false;
    _fadeOut = 1;

    // Start cinematic bars
    var camPreset = opts.cameraPreset || 'monologue';
    if (typeof CinematicCamera !== 'undefined') {
      CinematicCamera.start(camPreset, {
        onMidpoint: function () {
          // Bars are fully open — start first line
          _advanceLine();
        },
        onComplete: opts.onComplete || null
      });
    } else {
      // No camera — just start immediately
      _advanceLine();
    }
  }

  /**
   * Play a single line (no sequence, quick thought bubble).
   */
  function thought(text, attribution, duration) {
    play([{
      text: text,
      attribution: attribution || 'GLEANER',
      duration: duration || 2500
    }], { cameraPreset: 'monologue' });
  }

  /**
   * Add a custom sequence at runtime.
   */
  function defineSequence(name, lines) {
    SEQUENCES[name] = lines;
  }

  /**
   * Skip current line / advance to next.
   */
  function skip() {
    if (!_active) return;
    if (_current && _charIndex < _current.text.length) {
      // Reveal full text immediately
      _charIndex = _current.text.length;
      _lineElapsed = 0;
    } else {
      // Advance to next line
      _advanceLine();
    }
  }

  /**
   * Cancel the entire monologue.
   */
  function cancel() {
    _active = false;
    _current = null;
    _queue = [];
    if (typeof CinematicCamera !== 'undefined') {
      CinematicCamera.close();
    }
  }

  function isActive() { return _active; }

  // ── Internal ───────────────────────────────────────────────────

  function _advanceLine() {
    if (_queue.length === 0) {
      // All lines done — close
      _current = null;
      _active = false;
      if (typeof CinematicCamera !== 'undefined') {
        CinematicCamera.close();
      }
      return;
    }

    _current = _queue.shift();
    _charIndex = 0;
    _charTimer = 0;
    _lineElapsed = 0;
    _fadingOut = false;
    _fadeOut = 1;
  }

  // ── Tick ────────────────────────────────────────────────────────

  function tick(dt) {
    if (!_active || !_current) return;

    _lineElapsed += dt;

    // Typewriter advance
    if (_charIndex < _current.text.length) {
      _charTimer += dt;
      while (_charTimer >= CHAR_SPEED && _charIndex < _current.text.length) {
        _charTimer -= CHAR_SPEED;
        _charIndex++;

        // Tick sound (every 3rd char for subtlety)
        if (_charIndex % 3 === 0 && typeof AudioSystem !== 'undefined') {
          AudioSystem.play('ui_tick');
        }
      }
    } else if (!_fadingOut) {
      // Text fully revealed — hold then fade
      var holdDuration = _current.duration || (HOLD_AFTER_REVEAL + _current.text.length * 30);
      if (_lineElapsed > _current.text.length * CHAR_SPEED + holdDuration) {
        _fadingOut = true;
      }
    }

    // Fade out
    if (_fadingOut) {
      _fadeOut = Math.max(0, _fadeOut - dt / FADE_DURATION);
      if (_fadeOut <= 0) {
        // Line done — gap then next
        setTimeout(function () {
          if (_active) _advanceLine();
        }, LINE_GAP);
        _fadingOut = false;
        _fadeOut = 0;
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  /**
   * Render monologue text on the cinematic letterbox bars.
   * Call AFTER CinematicCamera.render().
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} vpW
   * @param {number} vpH
   */
  function render(ctx, vpW, vpH) {
    if (!_active || !_current) return;
    if (_fadeOut <= 0) return;

    var barH = 0;
    if (typeof CinematicCamera !== 'undefined') {
      barH = CinematicCamera.getBarHeight(vpH);
    }
    if (barH < 10) return;  // Too small to render text on

    var revealedText = _current.text.substring(0, _charIndex);
    var cx = vpW / 2;

    ctx.save();
    ctx.globalAlpha = _fadeOut;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ── Attribution on top bar ──
    if (_current.attribution) {
      ctx.fillStyle = STYLE.attrColor;
      ctx.font = STYLE.attrFont;
      var attrY = barH * STYLE.topBarTextY;
      ctx.fillText(_current.attribution, cx, attrY);
    }

    // ── Thought text on bottom bar ──
    ctx.fillStyle = STYLE.textColor;
    ctx.font = STYLE.textFont;
    var textY = vpH - barH + barH * STYLE.bottomBarTextY;

    // Word wrap if text is too wide
    var maxW = vpW * 0.8;
    var measured = ctx.measureText(revealedText).width;
    if (measured > maxW && revealedText.length > 0) {
      // Simple word-wrap: split into two lines
      var words = revealedText.split(' ');
      var line1 = '';
      var line2 = '';
      var halfway = false;
      for (var i = 0; i < words.length; i++) {
        var testLine = line1 + (line1 ? ' ' : '') + words[i];
        if (!halfway && ctx.measureText(testLine).width > maxW * 0.55) {
          halfway = true;
        }
        if (halfway) {
          line2 += (line2 ? ' ' : '') + words[i];
        } else {
          line1 = testLine;
        }
      }
      ctx.fillText(line1, cx, textY - 9);
      if (line2) ctx.fillText(line2, cx, textY + 9);
    } else {
      ctx.fillText(revealedText, cx, textY);
    }

    // ── Typewriter cursor blink ──
    if (_charIndex < _current.text.length) {
      var cursorBlink = Math.sin(performance.now() / 200) > 0;
      if (cursorBlink) {
        var cursorX = cx + measured / 2 + 4;
        ctx.fillStyle = STYLE.textColor;
        ctx.fillRect(cursorX, textY - 7, 2, 14);
      }
    }

    ctx.restore();
  }

  return Object.freeze({
    play:            play,
    thought:         thought,
    skip:            skip,
    cancel:          cancel,
    tick:            tick,
    render:          render,
    isActive:        isActive,
    defineSequence:  defineSequence,
    SEQUENCES:       SEQUENCES  // Expose for content additions
  });
})();

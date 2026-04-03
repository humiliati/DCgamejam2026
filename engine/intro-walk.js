/**
 * IntroWalk — SHELVED for jam (script tag commented out in index.html).
 *
 * To restore: uncomment the script tag in index.html (Layer 3, after
 * minimap-nav.js) and wire _startIntroWalk() back into game.js
 * _initGameplay() after the MonologuePeek.play('deploy_dropoff') call.
 *
 * ─────────────────────────────────────────────────────────────────────
 *
 * IntroWalk — cursor-hijack tutorial that teaches minimap click-to-move.
 *
 * Adapted from EyesOnly/public/js/onboarding-tutorial.js (gone-rogue
 * cursor hijack sequence). Instead of a scripted auto-walk that locks
 * input, this module:
 *
 *   1. Gives the player free input immediately
 *   2. After a short delay, shows a fake cursor on the minimap
 *   3. Animates the cursor from player position to the DOOR tile
 *   4. Fires a tap-ring visual at the target
 *   5. Uses MinimapNav.navigateTo() to auto-walk the computed path
 *   6. If the player manually moves/clicks at ANY point, aborts the
 *      demo gracefully ("Nice! Keep exploring.")
 *
 * The player always has control. The demo is a suggestion, not a lock.
 *
 * Named sequences (HOME_DEPARTURE) preserved for fail-state recovery.
 *
 * Depends on: MovementController, MinimapNav, Minimap, Toast, Pathfind
 */
var IntroWalk = (function () {
  'use strict';

  var MC = MovementController;

  var _active = false;
  var _playerTookControl = false;
  var _phase = 0;
  var _timers = [];
  var _onComplete = null;
  var _cursorEl = null;       // Fake cursor overlay element
  var _tapRingEl = null;      // Tap-ring animation element
  var _inputListener = null;  // Bound input listener for abort detection
  var _startDelay = 800;

  // ── Target tile (set by caller) ──────────────────────────────────
  var _targetX = 19;
  var _targetY = 5;

  // ── Swipe curve data (normalized macro — from gone-rogue) ────────
  // Recorded pointer macro, normalized to 0→1 with organic overshoot.
  var SWIPE_CURVE = [
    { t: 0.00, x: 0.00, y: 0.00 },
    { t: 0.06, x: 0.10, y: 0.05 },
    { t: 0.12, x: 0.28, y: 0.14 },
    { t: 0.18, x: 0.50, y: 0.30 },
    { t: 0.25, x: 0.72, y: 0.48 },
    { t: 0.30, x: 0.85, y: 0.58 },
    { t: 0.38, x: 1.02, y: 0.70 },  // overshoot
    { t: 0.45, x: 1.07, y: 0.78 },  // peak overshoot
    { t: 0.52, x: 1.04, y: 0.84 },  // settle back
    { t: 0.60, x: 0.98, y: 0.88 },
    { t: 0.68, x: 0.96, y: 0.91 },
    { t: 0.76, x: 0.97, y: 0.94 },
    { t: 0.84, x: 0.98, y: 0.96 },
    { t: 0.92, x: 0.99, y: 0.98 },
    { t: 1.00, x: 1.00, y: 1.00 }
  ];
  var SWIPE_DURATION = 1200; // ms

  // ── Named sequences (shelved — fail-state recovery) ──────────────
  var SEQUENCES = Object.freeze({
    HOME_DEPARTURE: {
      startDelay: 600,
      steps: [
        { action: 'bark', key: 'home.departure', delay: 1200 },
        { action: 'turn_right', delay: 280 },
        { action: 'turn_right', delay: 280 },
        { action: 'forward', delay: 580 }
      ]
    }
  });

  // ── Named sequence playback (legacy compat) ──────────────────────
  var _seqStepIndex = 0;
  var _seqSteps = [];
  var _seqMode = false; // true when running a named sequence, not cursor hijack

  function isActive() { return _active; }

  /**
   * Returns true only when running a legacy sequential sequence that
   * should block player input (e.g., HOME_DEPARTURE).
   * The cursor-hijack tutorial does NOT block input.
   */
  function isBlocking() { return _active && _seqMode; }

  // ── Cursor hijack tutorial start ─────────────────────────────────

  /**
   * Begin the cursor-hijack tutorial.
   *
   * @param {Object} opts
   * @param {number} opts.targetX       - Door tile X
   * @param {number} opts.targetY       - Door tile Y
   * @param {number} [opts.startDelay]  - ms before demo starts (default 800)
   * @param {Function} opts.onComplete  - Called after path completes or player takes over
   */
  function start(opts) {
    opts = opts || {};
    _targetX = opts.targetX != null ? opts.targetX : 19;
    _targetY = opts.targetY != null ? opts.targetY : 5;
    _onComplete = opts.onComplete || null;
    _startDelay = (opts.startDelay != null) ? opts.startDelay : 800;
    _playerTookControl = false;
    _phase = 0;
    _active = true;
    _seqMode = false;

    // Legacy compat: if opts.steps is provided, use old sequential mode
    if (opts.steps) {
      _seqMode = true;
      _seqSteps = opts.steps;
      _seqStepIndex = 0;
      _scheduleTimer(function () { _executeSeqStep(); }, _startDelay);
      return;
    }

    console.log('[IntroWalk] Starting cursor-hijack tutorial → target (' + _targetX + ',' + _targetY + ')');

    // Bind input listener for abort detection
    _bindInputAbort();

    // Phase 1 (0ms): Player has free input. Timer starts.
    _phase = 1;

    // Phase 2 (startDelay + 350ms): Show tooltip hint
    _scheduleTimer(function () {
      if (_aborted()) return;
      _phase = 2;
      if (typeof Toast !== 'undefined') {
        Toast.show('\uD83D\uDC46 Click the minimap to move', 'system');
      }
    }, _startDelay + 350);

    // Phase 3 (startDelay + 600ms): Create cursor overlay with glitch effect
    _scheduleTimer(function () {
      if (_aborted()) return;
      _phase = 3;
      _createCursorOverlay();
    }, _startDelay + 600);

    // Phase 4 (startDelay + 800ms): Animate cursor from player to target on minimap
    _scheduleTimer(function () {
      if (_aborted()) return;
      _phase = 4;
      _animateSwipe();
    }, _startDelay + 800);

    // Phase 5 (startDelay + 800ms + SWIPE_DURATION + 100): Tap ring + trigger nav
    _scheduleTimer(function () {
      if (_aborted()) return;
      _phase = 5;
      _showTapRing();

      // Brief pause, then trigger MinimapNav
      _scheduleTimer(function () {
        if (_aborted()) return;
        _phase = 6;
        _removeCursorOverlay();

        if (typeof Toast !== 'undefined') {
          Toast.show('REPORT FOR DUTY.', 'system');
        }

        // Navigate to one tile south of the door (19,6) since door itself isn't walkable
        var navTarget = { x: _targetX, y: _targetY + 1 };
        var started = false;
        if (typeof MinimapNav !== 'undefined' && MinimapNav.navigateTo) {
          started = MinimapNav.navigateTo(navTarget.x, navTarget.y, {
            onArrived: function () {
              _finish();
            }
          });
        }

        if (!started) {
          // Fallback: just finish (player can walk manually)
          console.log('[IntroWalk] MinimapNav path failed — player walks manually');
          _active = false;
          _unbindInputAbort();
        }
      }, 400);
    }, _startDelay + 800 + SWIPE_DURATION + 100);
  }

  // ── Timer management ─────────────────────────────────────────────

  function _scheduleTimer(fn, delay) {
    var t = setTimeout(fn, delay);
    _timers.push(t);
    return t;
  }

  function _clearTimers() {
    for (var i = 0; i < _timers.length; i++) {
      clearTimeout(_timers[i]);
    }
    _timers = [];
  }

  // ── Abort detection ──────────────────────────────────────────────

  function _aborted() {
    return _playerTookControl || !_active;
  }

  function _bindInputAbort() {
    var container = document.getElementById('viewport');
    if (!container) return;

    _inputListener = function (e) {
      // Ignore clicks on the minimap itself (that's what we're teaching!)
      if (e.target && e.target.id === 'minimap') return;
      _onPlayerInput();
    };

    container.addEventListener('mousedown', _inputListener);
    container.addEventListener('touchstart', _inputListener, { passive: true });

    // Also detect keyboard input
    document.addEventListener('keydown', _inputListener);
  }

  function _unbindInputAbort() {
    var container = document.getElementById('viewport');
    if (container && _inputListener) {
      container.removeEventListener('mousedown', _inputListener);
      container.removeEventListener('touchstart', _inputListener);
    }
    if (_inputListener) {
      document.removeEventListener('keydown', _inputListener);
    }
    _inputListener = null;
  }

  function _onPlayerInput() {
    if (!_active || _playerTookControl || _seqMode) return;
    _playerTookControl = true;
    console.log('[IntroWalk] Player took control — aborting cursor demo');

    _clearTimers();
    _removeCursorOverlay();
    _removeTapRing();

    if (typeof Toast !== 'undefined') {
      Toast.show('Nice! Keep exploring.', 'system');
    }

    _active = false;
    _unbindInputAbort();
    // Don't call onComplete — player is in control now
  }

  // ── Cursor overlay ───────────────────────────────────────────────

  function _createCursorOverlay() {
    if (_cursorEl) return;

    _cursorEl = document.createElement('div');
    _cursorEl.id = 'tutorial-cursor';
    _cursorEl.style.cssText = [
      'position: fixed',
      'width: 24px',
      'height: 24px',
      'z-index: 9990',
      'pointer-events: none',
      'transition: opacity 0.2s',
      'opacity: 0'
    ].join(';');

    // SVG cursor arrow — hazmat yellow
    _cursorEl.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 3L10.5 21L13 13L21 10.5L3 3Z" fill="#f0c830" stroke="#2a2520" stroke-width="1.5" stroke-linejoin="round"/>' +
      '</svg>';

    document.body.appendChild(_cursorEl);

    // Fade in with glitch effect
    requestAnimationFrame(function () {
      _cursorEl.style.opacity = '1';
      _cursorEl.style.animation = 'tutorial-cursor-glitch 2s ease-in-out 1';
    });

    // Inject glitch keyframes if not already present
    if (!document.getElementById('tutorial-cursor-style')) {
      var style = document.createElement('style');
      style.id = 'tutorial-cursor-style';
      style.textContent = [
        '@keyframes tutorial-cursor-glitch {',
        '  0%, 100% { filter: none; }',
        '  22% { filter: invert(1) brightness(1.5); }',
        '  25% { filter: none; }',
        '  62% { filter: invert(1) brightness(1.3); }',
        '  65% { filter: none; }',
        '}',
        '@keyframes tutorial-tap-ring {',
        '  0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }',
        '  100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }',
        '}'
      ].join('\n');
      document.head.appendChild(style);
    }
  }

  function _removeCursorOverlay() {
    if (_cursorEl) {
      _cursorEl.style.opacity = '0';
      var el = _cursorEl;
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 200);
      _cursorEl = null;
    }
  }

  // ── Swipe animation ──────────────────────────────────────────────

  function _animateSwipe() {
    if (!_cursorEl) return;

    var minimapFrame = document.getElementById('minimap-frame');
    if (!minimapFrame) return;

    var rect = minimapFrame.getBoundingClientRect();

    // Get player tile position on minimap
    var pos = MC.getGridPos();
    var startPx = _gridToMinimapPx(pos.x, pos.y, rect);
    var endPx = _gridToMinimapPx(_targetX, _targetY, rect);

    // Position cursor at start
    _cursorEl.style.left = startPx.x + 'px';
    _cursorEl.style.top = startPx.y + 'px';

    var startTime = performance.now();

    function frame(now) {
      if (_aborted() || !_cursorEl) return;

      var elapsed = now - startTime;
      var t = Math.min(elapsed / SWIPE_DURATION, 1.0);

      // Interpolate along swipe curve
      var pos = _sampleCurve(t);
      var cx = startPx.x + (endPx.x - startPx.x) * pos.x;
      var cy = startPx.y + (endPx.y - startPx.y) * pos.y;

      _cursorEl.style.left = cx + 'px';
      _cursorEl.style.top = cy + 'px';

      if (t < 1.0) {
        requestAnimationFrame(frame);
      }
    }

    requestAnimationFrame(frame);
  }

  /**
   * Sample the swipe curve at normalized time t (0→1).
   * Linear interpolation between keyframes.
   */
  function _sampleCurve(t) {
    if (t <= 0) return { x: 0, y: 0 };
    if (t >= 1) return { x: 1, y: 1 };

    for (var i = 1; i < SWIPE_CURVE.length; i++) {
      if (SWIPE_CURVE[i].t >= t) {
        var prev = SWIPE_CURVE[i - 1];
        var next = SWIPE_CURVE[i];
        var segT = (t - prev.t) / (next.t - prev.t);
        return {
          x: prev.x + (next.x - prev.x) * segT,
          y: prev.y + (next.y - prev.y) * segT
        };
      }
    }
    return { x: 1, y: 1 };
  }

  /**
   * Convert grid tile to viewport pixel position over the minimap.
   */
  function _gridToMinimapPx(tileX, tileY, rect) {
    // Use MinimapNav's render params if available, otherwise estimate
    var canvas = document.getElementById('minimap');
    if (!canvas) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    var canvasW = canvas.width;
    var canvasH = canvas.height;
    var displayW = rect.width;
    var displayH = rect.height;

    // Minimap renders centered with uniform tile size
    var floorData = (typeof FloorManager !== 'undefined') ? FloorManager.getFloorData() : null;
    var gridW = floorData ? floorData.gridW : 40;
    var gridH = floorData ? floorData.gridH : 30;

    var tileSize = Math.min(canvasW / gridW, canvasH / gridH);
    var offX = (canvasW - gridW * tileSize) / 2;
    var offY = (canvasH - gridH * tileSize) / 2;

    // Canvas pixel → display pixel
    var scaleX = displayW / canvasW;
    var scaleY = displayH / canvasH;

    return {
      x: rect.left + (offX + tileX * tileSize + tileSize / 2) * scaleX,
      y: rect.top + (offY + tileY * tileSize + tileSize / 2) * scaleY
    };
  }

  // ── Tap ring ─────────────────────────────────────────────────────

  function _showTapRing() {
    var minimapFrame = document.getElementById('minimap-frame');
    if (!minimapFrame) return;

    var rect = minimapFrame.getBoundingClientRect();
    var px = _gridToMinimapPx(_targetX, _targetY, rect);

    _tapRingEl = document.createElement('div');
    _tapRingEl.style.cssText = [
      'position: fixed',
      'width: 32px',
      'height: 32px',
      'border: 3px solid #f0c830',
      'border-radius: 50%',
      'left: ' + px.x + 'px',
      'top: ' + px.y + 'px',
      'transform: translate(-50%, -50%) scale(0.3)',
      'pointer-events: none',
      'z-index: 9989',
      'animation: tutorial-tap-ring 0.6s ease-out forwards'
    ].join(';');

    document.body.appendChild(_tapRingEl);

    // Clean up after animation
    setTimeout(function () {
      _removeTapRing();
    }, 700);
  }

  function _removeTapRing() {
    if (_tapRingEl && _tapRingEl.parentNode) {
      _tapRingEl.parentNode.removeChild(_tapRingEl);
    }
    _tapRingEl = null;
  }

  // ── Finish ───────────────────────────────────────────────────────

  function _finish() {
    _active = false;
    _unbindInputAbort();
    _removeCursorOverlay();
    _removeTapRing();
    _clearTimers();
    console.log('[IntroWalk] Tutorial complete — triggering door');
    if (_onComplete) _onComplete();
  }

  // ── Cancel ───────────────────────────────────────────────────────

  function cancel() {
    _clearTimers();
    _removeCursorOverlay();
    _removeTapRing();
    _unbindInputAbort();
    _active = false;
    _seqMode = false;
    console.log('[IntroWalk] Cancelled');
  }

  // ── Legacy sequential mode (for HOME_DEPARTURE etc.) ─────────────

  function _executeSeqStep() {
    if (!_active || !_seqMode) return;
    if (_seqStepIndex >= _seqSteps.length) {
      var t = setTimeout(function () {
        _active = false;
        _seqMode = false;
        if (_onComplete) _onComplete();
      }, MC.WALK_TIME + 100);
      _timers.push(t);
      return;
    }

    var step = _seqSteps[_seqStepIndex];
    _seqStepIndex++;

    switch (step.action) {
      case 'forward':      MC.startRelativeMove('forward'); break;
      case 'back':         MC.startRelativeMove('back'); break;
      case 'strafe_left':  MC.startRelativeMove('strafe_left'); break;
      case 'strafe_right': MC.startRelativeMove('strafe_right'); break;
      case 'turn_left':    MC.turnLeft(); break;
      case 'turn_right':   MC.turnRight(); break;
      case 'bark':
        if (step.key && typeof BarkLibrary !== 'undefined') {
          BarkLibrary.fire(step.key, step.barkOpts || {});
        }
        break;
      default:
        console.warn('[IntroWalk] Unknown action: ' + step.action);
    }

    var delay = step.delay || MC.WALK_TIME + 50;
    _scheduleTimer(function () { _executeSeqStep(); }, delay);
  }

  /**
   * Convenience: start a named shelved sequence (legacy).
   */
  function startNamed(sequenceName, onComplete) {
    var seq = SEQUENCES[sequenceName];
    if (!seq) {
      console.warn('[IntroWalk] Unknown named sequence: ' + sequenceName);
      return;
    }
    start({
      steps: seq.steps,
      startDelay: seq.startDelay,
      onComplete: onComplete
    });
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    start:      start,
    startNamed: startNamed,
    cancel:     cancel,
    isActive:   isActive,
    isBlocking: isBlocking,
    SEQUENCES:  SEQUENCES
  };
})();

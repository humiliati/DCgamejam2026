/**
 * ScreenManager — game state machine.
 *
 * Layer 2 (depends on i18n). Owns the top-level screen state and
 * transition logic. Each state maps to a rendering mode:
 *
 *   SPLASH   → splash logo, auto-advance
 *   TITLE    → title screen (later: MenuBox over skybox)
 *   GAMEPLAY → raycaster + HUD
 *   PAUSE    → (later: MenuBox fold-up over frozen world)
 *   GAME_OVER → death overlay with stats
 *   VICTORY  → win overlay with stats
 *
 * Other modules read the state to decide what to render and which
 * input to accept. ScreenManager does NOT render anything itself —
 * it exposes the state and fires callbacks on transitions.
 */
var ScreenManager = (function () {
  'use strict';

  // ── States ────────────────────────────────────────────────────────

  var STATES = {
    SPLASH:    'SPLASH',
    TITLE:     'TITLE',
    GAMEPLAY:  'GAMEPLAY',
    PAUSE:     'PAUSE',
    GAME_OVER: 'GAME_OVER',
    VICTORY:   'VICTORY'
  };

  var _state = STATES.SPLASH;
  var _prevState = null;
  var _listeners = [];

  // ── State query ───────────────────────────────────────────────────

  function getState() { return _state; }
  function getPrevState() { return _prevState; }

  function is(state) { return _state === state; }
  function isPlaying() { return _state === STATES.GAMEPLAY; }
  function isPaused() { return _state === STATES.PAUSE; }

  // ── State transitions ────────────────────────────────────────────

  /** Register a callback for state changes: fn(newState, oldState) */
  function onChange(fn) {
    _listeners.push(fn);
  }

  function _transition(newState) {
    if (newState === _state) return;
    var old = _state;
    _prevState = old;
    _state = newState;
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](newState, old); }
      catch (e) { console.error('[ScreenManager] listener error:', e); }
    }
    console.log('[ScreenManager] ' + old + ' → ' + newState);
  }

  // ── Public transitions (named for clarity) ───────────────────────

  /** SPLASH → TITLE */
  function toTitle() { _transition(STATES.TITLE); }

  /** TITLE → GAMEPLAY (start new game) */
  function toGameplay() { _transition(STATES.GAMEPLAY); }

  /** GAMEPLAY → PAUSE */
  function toPause() { _transition(STATES.PAUSE); }

  /** PAUSE → GAMEPLAY (resume) */
  function resumeGameplay() { _transition(STATES.GAMEPLAY); }

  /** GAMEPLAY → GAME_OVER */
  function toGameOver() { _transition(STATES.GAME_OVER); }

  /** GAMEPLAY → VICTORY */
  function toVictory() { _transition(STATES.VICTORY); }

  /** GAME_OVER or VICTORY → TITLE (return to title) */
  function returnToTitle() { _transition(STATES.TITLE); }

  /** GAME_OVER → GAMEPLAY (retry) */
  function retry() { _transition(STATES.GAMEPLAY); }

  // ── Init ─────────────────────────────────────────────────────────

  function init() {
    _state = STATES.SPLASH;
    _prevState = null;
    console.log('[ScreenManager] Initialized at SPLASH');
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    STATES: STATES,
    init: init,
    getState: getState,
    getPrevState: getPrevState,
    is: is,
    isPlaying: isPlaying,
    isPaused: isPaused,
    onChange: onChange,
    toTitle: toTitle,
    toGameplay: toGameplay,
    toPause: toPause,
    resumeGameplay: resumeGameplay,
    toGameOver: toGameOver,
    toVictory: toVictory,
    returnToTitle: returnToTitle,
    retry: retry
  };
})();

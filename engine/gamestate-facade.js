/**
 * GAMESTATE — thin facade bridging the debrief feed's EyesOnly-style
 * GAMESTATE.getFatigue() / GAMESTATE.getMaxFatigue() reads to
 * Dungeon Gleaner's Player module.
 *
 * The debrief-feed-controller.js (ported from EyesOnly) reads fatigue
 * via `typeof GAMESTATE !== 'undefined' && GAMESTATE.getFatigue`.
 * Rather than rewriting the debrief feed, this facade provides the
 * expected API surface using Player as the backing store.
 *
 * Layer 1.5 (after Player, before DebriefFeedController)
 * Depends on: Player (optional — returns safe defaults if unavailable)
 */
var GAMESTATE = (function () {
  'use strict';

  function getFatigue() {
    return (typeof Player !== 'undefined' && Player.getFatigue)
      ? Player.getFatigue() : 0;
  }

  function getMaxFatigue() {
    return (typeof Player !== 'undefined' && Player.getMaxFatigue)
      ? Player.getMaxFatigue() : 100;
  }

  return {
    getFatigue:    getFatigue,
    getMaxFatigue: getMaxFatigue
  };
})();

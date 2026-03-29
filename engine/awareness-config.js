/**
 * AwarenessConfig — Single source of truth for enemy awareness
 * state thresholds, color codes, detection ranges, and gain/decay rates.
 *
 * Extracted from EyesOnly awareness-config.js (Phase A4).
 * Consumed by: EnemyAI, StealthSystem, Minimap sight cones, HUD.
 *
 * Layer 0 — zero dependencies. Loads before everything that reads awareness.
 */
var AwarenessConfig = (function () {
  'use strict';

  // ── Awareness state definitions ──────────────────────────────────
  // min/max define the awareness value ranges.
  // color is the HUD / minimap indicator color.
  var STATES = {
    UNAWARE:    { min: 0,   max: 30,  color: '#4a4', name: 'UNAWARE',    label: 'Unaware' },
    SUSPICIOUS: { min: 31,  max: 70,  color: '#cc4', name: 'SUSPICIOUS', label: 'Suspicious' },
    ALERTED:    { min: 71,  max: 100, color: '#c44', name: 'ALERTED',    label: 'Alerted' },
    ENGAGED:    { min: 101, max: 999, color: '#c4c', name: 'ENGAGED',    label: 'Engaged' }
  };

  // ── Detection tuning knobs ───────────────────────────────────────
  var DETECTION = {
    SIGHT_RANGE:        6,      // Max detection distance (tiles)
    SIGHT_ANGLE:        Math.PI / 3,  // 60° half-angle cone (full cone = 120°)
    AWARENESS_DECAY:    3,      // pts per tick (100ms) when player out of sight
    AWARENESS_GAIN_SIGHT: 15,   // pts per tick when player in sight cone
    AWARENESS_GAIN_CLOSE: 25,   // pts per tick when player adjacent (≤1 tile)
    AWARENESS_GAIN_NOISE: 10,   // pts per noise event (doors, combat, breakables)
    ALERTED_DECAY_MULT: 0.3    // Decay multiplier while ALERTED (slower cooldown)
  };

  // ── Minimap cone colors (per awareness state) ────────────────────
  var CONE_COLORS = {
    UNAWARE:    'rgba(68, 170, 68, 0.15)',
    SUSPICIOUS: 'rgba(204, 204, 68, 0.25)',
    ALERTED:    'rgba(204, 68, 68, 0.30)',
    ENGAGED:    'rgba(204, 68, 204, 0.35)'
  };

  // ── Resolver ─────────────────────────────────────────────────────

  /**
   * Resolve which awareness state an entity is in.
   * @param {number} awareness - Current awareness value (0–999)
   * @returns {Object} The matching state object
   */
  function resolve(awareness) {
    if (awareness >= STATES.ENGAGED.min)    return STATES.ENGAGED;
    if (awareness >= STATES.ALERTED.min)    return STATES.ALERTED;
    if (awareness >= STATES.SUSPICIOUS.min) return STATES.SUSPICIOUS;
    return STATES.UNAWARE;
  }

  /**
   * Check if awareness value meets or exceeds a named threshold.
   * @param {number} awareness
   * @param {string} stateName - 'UNAWARE'|'SUSPICIOUS'|'ALERTED'|'ENGAGED'
   * @returns {boolean}
   */
  function meetsThreshold(awareness, stateName) {
    var state = STATES[stateName];
    if (!state) return false;
    return awareness >= state.min;
  }

  /**
   * Get the cone color for a given awareness value (minimap rendering).
   * @param {number} awareness
   * @returns {string} RGBA color string
   */
  function getConeColor(awareness) {
    var state = resolve(awareness);
    return CONE_COLORS[state.name] || CONE_COLORS.UNAWARE;
  }

  /** All state names in escalation order */
  function getEscalationOrder() {
    return ['UNAWARE', 'SUSPICIOUS', 'ALERTED', 'ENGAGED'];
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    STATES:             STATES,
    DETECTION:          DETECTION,
    CONE_COLORS:        CONE_COLORS,
    resolve:            resolve,
    meetsThreshold:     meetsThreshold,
    getConeColor:       getConeColor,
    getEscalationOrder: getEscalationOrder
  };
})();

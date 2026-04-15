/**
 * SeededRNG — deterministic random number generator for reproducible dungeons.
 * Mulberry32 algorithm.
 *
 * Two-seed architecture (see docs/SEED_AND_SAVELOAD_DESIGN.md §2):
 *   - _runSeed     — top-level seed for the whole run; player-facing as 3-word phrase.
 *   - _seed        — current walking seed (per-floor derivative during play).
 *
 * Lifecycle:
 *   Game.init()      → optional SeededRNG.seed(n)       (legacy, rarely used)
 *   new-game flow    → SeededRNG.beginRun(runSeed)      (M1 §3 in short-roadmap)
 *   FloorTransition  → SeededRNG.deriveFloor(floorId)   (M1 §3)
 */
var SeededRNG = (function () {
  'use strict';

  var _seed    = Date.now() | 0;   // walking seed (per-floor after beginRun)
  var _runSeed = _seed;            // top-level run seed (player-facing)

  // ════════════════════════════════════════════════════════════════════════
  // Core Mulberry32
  // ════════════════════════════════════════════════════════════════════════

  function seed(s) {
    _seed = s | 0;
  }

  function random() {
    _seed |= 0;
    _seed = (_seed + 0x6D2B79F5) | 0;
    var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Random int in [min, max] inclusive */
  function randInt(min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array */
  function pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(random() * arr.length)];
  }

  /** Weighted random selection: items = [{ weight, value }] */
  function weighted(items) {
    var total = 0;
    for (var i = 0; i < items.length; i++) total += items[i].weight;
    var roll = random() * total;
    var cumulative = 0;
    for (var i = 0; i < items.length; i++) {
      cumulative += items[i].weight;
      if (roll < cumulative) return items[i].value;
    }
    return items[items.length - 1].value;
  }

  /** Shuffle array in place (Fisher-Yates) */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ════════════════════════════════════════════════════════════════════════
  // Run + per-floor lifecycle (M1)
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Begin a new run. Called from TitleScreen.deploy() after callsign + class
   * are chosen, before Game.startNewRun. If the caller omits `runSeed`, one
   * is generated from Date.now() XOR Math.random — deliberately using the
   * unseeded Math.random here since no run is active yet.
   *
   * @param {number} [runSeed] uint32 — if omitted, a random one is generated.
   * @returns {number} the uint32 runSeed actually used.
   */
  function beginRun(runSeed) {
    if (runSeed == null) {
      runSeed = ((Date.now() & 0xFFFFFFFF) ^ Math.floor(Math.random() * 0xFFFFFFFF)) >>> 0;
    }
    _runSeed = runSeed | 0;
    _seed    = _runSeed;
    console.log('[SeededRNG] beginRun seed=' + (_runSeed >>> 0).toString(16));
    return _runSeed >>> 0;
  }

  /**
   * Reseed the walking RNG from hash(runSeed, floorId). Called at every
   * floor-enter inside FloorTransition._doFloorSwitch, before
   * FloorManager.generateCurrentFloor runs. Ensures the floor's proc-gen
   * scatter is reproducible regardless of which order the player visits
   * floors.
   *
   * Hash: FNV-1a over the floorId string, XOR-folded with _runSeed.
   *
   * @param {string} floorId
   * @returns {number} the derived uint32 used to reseed.
   */
  function deriveFloor(floorId) {
    var h = 0x811C9DC5 >>> 0; // FNV-1a offset basis
    var key = String(floorId);
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0; // FNV prime
    }
    var derived = (h ^ (_runSeed >>> 0)) >>> 0;
    _seed = derived | 0;
    return derived;
  }

  /** Returns the current walking seed (for debug HUD). */
  function currentSeed() {
    return _seed >>> 0;
  }

  /** Returns the top-level run seed (unchanged by deriveFloor calls). */
  function runSeed() {
    return _runSeed >>> 0;
  }

  return {
    seed:        seed,
    random:      random,
    randInt:     randInt,
    pick:        pick,
    weighted:    weighted,
    shuffle:     shuffle,
    beginRun:    beginRun,
    deriveFloor: deriveFloor,
    currentSeed: currentSeed,
    runSeed:     runSeed
  };
})();

/**
 * BarkLibrary — Fable-style contextual NPC bark system.
 *
 * NPCs in Fable react to the world by drawing randomly from named
 * bark pools keyed by context. Each bark can carry a weight (likelihood
 * of selection), a speaker label, a visual style hint, and an optional
 * oneShot flag so rare lines are never repeated in a session.
 *
 * This module is a pure picker/tracker. It knows nothing about rendering.
 * Higher-level code (Game, IntroWalk, enemy AI) calls:
 *   BarkLibrary.fire(key)         — pick + display via registered displayFn
 *   BarkLibrary.pick(key)         — pick only (returns bark object or null)
 *   BarkLibrary.setDisplay(fn)    — wire the display function once at Game init
 *
 * Bark pool registration is done in data/barks/en.js (Layer 5), keeping
 * all text out of engine logic just as i18n.register() keeps UI strings
 * out of engine logic.
 *
 * Pool entry schema:
 *   {
 *     text:    string  — the bark line (supports emoji)
 *     speaker: string  — optional NPC name label (null = anonymous passerby)
 *     style:   string  — hint to displayFn: 'toast'|'bubble'|'dialog' (default 'toast')
 *     weight:  number  — relative pick probability (default 1)
 *     oneShot: bool    — if true, fires at most once per session (default false)
 *   }
 *
 * Anti-repeat / cooldown rules (Fable pattern):
 *   - A just-fired bark enters a per-key cooldown set.
 *   - While cooling, that bark is skipped during picks.
 *   - Cooldown expires after `cooldownMs` (default 45 s per pool).
 *   - If ALL barks in the pool are cooling, the oldest fires anyway
 *     (prevents permanent silence on tiny pools).
 *   - oneShot barks are tracked in _firedOnce and never cool back in.
 *
 * Layer 1 (depends on: nothing — pure data + helpers)
 */
var BarkLibrary = (function () {
  'use strict';

  // ── Registry ──────────────────────────────────────────────────────
  // _pools: contextKey → Array<BarkEntry>

  var _pools      = {};      // Registered bark pools
  var _cooling    = {};      // contextKey → Map<entryIndex, expiryTimestamp>
  var _firedOnce  = {};      // contextKey → Set<entryIndex>  (oneShot tracking)
  var _displayFn  = null;    // Pluggable display hook set by Game at init

  // Default cooldown per key in ms. Override per pool via opts.cooldownMs.
  var _DEFAULT_COOLDOWN_MS = 45000;
  var _poolOpts = {};        // contextKey → { cooldownMs }

  // ── Registration ─────────────────────────────────────────────────

  /**
   * Register (or extend) a bark pool for a context key.
   *
   * @param {string}  key   - Context identifier, e.g. 'ambient.promenade'
   * @param {Array}   barks - Array of bark entry objects (see schema above)
   * @param {Object}  [opts]
   * @param {number}  [opts.cooldownMs] - Per-entry cooldown in ms (default 45000)
   */
  function register(key, barks, opts) {
    if (!Array.isArray(barks) || barks.length === 0) return;
    if (!_pools[key]) {
      _pools[key]     = [];
      _cooling[key]   = {};
      _firedOnce[key] = {};
    }
    // Append entries; normalise missing fields to defaults
    for (var i = 0; i < barks.length; i++) {
      _pools[key].push({
        text:    barks[i].text    || '',
        speaker: barks[i].speaker || null,
        style:   barks[i].style   || 'toast',
        weight:  (barks[i].weight != null) ? barks[i].weight : 1,
        oneShot: !!barks[i].oneShot
      });
    }
    if (opts && opts.cooldownMs != null) {
      _poolOpts[key] = { cooldownMs: opts.cooldownMs };
    }
  }

  // ── Display wiring ───────────────────────────────────────────────

  /**
   * Set the display function. Called once at Game init.
   *
   * @param {Function} fn - fn(barkEntry, opts) where:
   *                        barkEntry — the full bark object { text, speaker, style }
   *                        opts      — optional caller overrides e.g. { style: 'dialog' }
   *                        The implementation decides whether to route to Toast,
   *                        DialogBox, etc.
   */
  function setDisplay(fn) {
    _displayFn = fn;
  }

  // ── Pick logic ───────────────────────────────────────────────────

  /**
   * Pick a bark from a pool, respecting cooldowns and oneShot state.
   * Returns null if the pool is empty or unregistered.
   *
   * @param {string} key - Pool key
   * @returns {Object|null} Bark entry object (not mutated)
   */
  function pick(key) {
    var pool = _pools[key];
    if (!pool || pool.length === 0) return null;

    var now = Date.now();
    var cooldownMs = (_poolOpts[key] && _poolOpts[key].cooldownMs != null)
      ? _poolOpts[key].cooldownMs
      : _DEFAULT_COOLDOWN_MS;

    // Partition into available (not cooling, not oneShot-done) and cooling
    var available = [];
    var allCooling = [];

    for (var i = 0; i < pool.length; i++) {
      // Skip permanently spent oneShot barks
      if (pool[i].oneShot && _firedOnce[key][i]) continue;

      var expiresAt = _cooling[key][i] || 0;
      if (now >= expiresAt) {
        available.push(i);
      } else {
        allCooling.push({ idx: i, expiresAt: expiresAt });
      }
    }

    var chosenIdx;

    if (available.length > 0) {
      // Weighted pick from available entries
      chosenIdx = _weightedPick(pool, available);
    } else if (allCooling.length > 0) {
      // All cooling — pick the oldest (soonest to expire) to avoid silence
      allCooling.sort(function (a, b) { return a.expiresAt - b.expiresAt; });
      chosenIdx = allCooling[0].idx;
    } else {
      // All oneShot entries spent
      return null;
    }

    // Apply cooldown and oneShot tracking
    _cooling[key][chosenIdx] = now + cooldownMs;
    if (pool[chosenIdx].oneShot) {
      _firedOnce[key][chosenIdx] = true;
    }

    return pool[chosenIdx];
  }

  /**
   * Weighted random pick from a subset of pool indices.
   *
   * @param {Array}  pool    - Full pool array
   * @param {Array}  indices - Candidate indices within pool
   * @returns {number} Selected index
   */
  function _weightedPick(pool, indices) {
    var totalWeight = 0;
    for (var i = 0; i < indices.length; i++) {
      totalWeight += pool[indices[i]].weight;
    }
    var roll = Math.random() * totalWeight;
    var cumulative = 0;
    for (var j = 0; j < indices.length; j++) {
      cumulative += pool[indices[j]].weight;
      if (roll < cumulative) return indices[j];
    }
    return indices[indices.length - 1];
  }

  // ── Fire ─────────────────────────────────────────────────────────

  /**
   * Pick a bark and send it to the display function.
   * No-ops gracefully if pool is unregistered, empty, or displayFn not set.
   *
   * @param {string}   key    - Pool key
   * @param {Object}   [opts] - Optional overrides passed to displayFn alongside bark
   *                            e.g. { style: 'dialog', x: 10, y: 3 } for positional barks
   * @returns {Object|null} The bark entry that was fired, or null if nothing fired
   */
  function fire(key, opts) {
    var bark = pick(key);
    if (!bark) return null;

    if (_displayFn) {
      _displayFn(bark, opts || {});
    } else {
      // Fallback: log to console during development before Game wires displayFn
      console.log('[BarkLibrary] ' + (bark.speaker ? bark.speaker + ': ' : '') + bark.text);
    }

    return bark;
  }

  // ── Utility ──────────────────────────────────────────────────────

  /**
   * Reset all cooldowns and oneShot state (e.g., on new game / new day).
   * @param {string} [key] - If provided, reset only this pool; otherwise reset all.
   */
  function reset(key) {
    if (key) {
      _cooling[key]   = {};
      _firedOnce[key] = {};
    } else {
      _cooling   = {};
      _firedOnce = {};
      // Rebuild per-key empty maps
      for (var k in _pools) {
        _cooling[k]   = {};
        _firedOnce[k] = {};
      }
    }
  }

  /**
   * Check whether a pool key has any barks registered.
   * @param {string} key
   * @returns {boolean}
   */
  function hasPool(key) {
    return !!(_pools[key] && _pools[key].length > 0);
  }

  /**
   * Return a copy of all registered pool keys (for debug/tooling).
   * @returns {string[]}
   */
  function getKeys() {
    return Object.keys(_pools);
  }

  // ── Public API ───────────────────────────────────────────────────

  return Object.freeze({
    register:   register,
    setDisplay: setDisplay,
    pick:       pick,
    fire:       fire,
    reset:      reset,
    hasPool:    hasPool,
    getKeys:    getKeys
  });
})();

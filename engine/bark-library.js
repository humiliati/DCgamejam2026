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
 * Pool-level fire throttle (anti-spam):
 *   - `minIntervalMs` sets the minimum gap between ANY fire from the pool.
 *   - When multiple NPCs share the same ambient pool, this prevents spam
 *     by returning null (comfortable silence) if the pool was fired too
 *     recently, instead of exhausting cooldowns and triggering the
 *     "oldest fires anyway" fallback.
 *   - Default: auto-calculated as cooldownMs / poolSize, clamped [5s, cooldownMs].
 *   - Override per pool via opts.minIntervalMs in register().
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
  var _poolOpts = {};        // contextKey → { cooldownMs, minIntervalMs }

  // Pool-level fire throttle: prevents multiple callers (NPCs sharing a pool)
  // from spamming the same pool. Tracks when each pool last fired.
  var _lastPoolFire = {};    // contextKey → timestamp

  // ── Registration ─────────────────────────────────────────────────

  /**
   * Register (or extend) a bark pool for a context key.
   *
   * @param {string}  key   - Context identifier, e.g. 'ambient.promenade'
   * @param {Array}   barks - Array of bark entry objects (see schema above)
   * @param {Object}  [opts]
   * @param {number}  [opts.cooldownMs]      - Per-entry cooldown in ms (default 45000)
   * @param {number}  [opts.minIntervalMs]   - Pool-level minimum gap between ANY fire
   *                                           from this pool. When multiple NPCs share
   *                                           the same pool, this prevents spam by
   *                                           returning null if the pool was fired too
   *                                           recently. Default: auto (cooldownMs / poolSize,
   *                                           clamped to [5000, cooldownMs]).
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
    if (opts) {
      if (!_poolOpts[key]) _poolOpts[key] = {};
      if (opts.cooldownMs != null)    _poolOpts[key].cooldownMs = opts.cooldownMs;
      if (opts.minIntervalMs != null) _poolOpts[key].minIntervalMs = opts.minIntervalMs;
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

    // ── Pool-level fire throttle ──────────────────────────────────
    // Prevents multiple NPCs sharing the same ambient pool from
    // spamming identical barks when the player idles. If the pool
    // was fired too recently, return null (comfortable silence).
    var minInterval = (_poolOpts[key] && _poolOpts[key].minIntervalMs != null)
      ? _poolOpts[key].minIntervalMs
      : Math.max(5000, Math.min(cooldownMs, Math.floor(cooldownMs / Math.max(pool.length, 1))));

    var lastFire = _lastPoolFire[key] || 0;
    if (now - lastFire < minInterval) {
      return null; // Pool on cooldown — silence, not spam
    }

    // Partition into available (not cooling, not oneShot-done) and cooling
    var available = [];

    for (var i = 0; i < pool.length; i++) {
      // Skip permanently spent oneShot barks
      if (pool[i].oneShot && _firedOnce[key][i]) continue;

      var expiresAt = _cooling[key][i] || 0;
      if (now >= expiresAt) {
        available.push(i);
      }
    }

    var chosenIdx;

    if (available.length > 0) {
      // Weighted pick from available entries
      chosenIdx = _weightedPick(pool, available);
    } else {
      // All cooling (or all oneShot-spent) — find oldest cooling entry
      var allCooling = [];
      for (var j = 0; j < pool.length; j++) {
        if (pool[j].oneShot && _firedOnce[key][j]) continue;
        allCooling.push({ idx: j, expiresAt: _cooling[key][j] || 0 });
      }
      if (allCooling.length === 0) return null; // All oneShot entries spent
      allCooling.sort(function (a, b) { return a.expiresAt - b.expiresAt; });
      chosenIdx = allCooling[0].idx;
    }

    // Apply cooldown, oneShot tracking, and pool-level timestamp
    _cooling[key][chosenIdx] = now + cooldownMs;
    _lastPoolFire[key] = now;
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

    // Template substitution — replace {callsign} and {class} with player values
    if (bark.text && (bark.text.indexOf('{') !== -1)) {
      var pState = (typeof Player !== 'undefined' && Player.state) ? Player.state() : {};
      bark = {
        text:    bark.text
          .replace(/\{callsign\}/g, pState.callsign || 'Gleaner')
          .replace(/\{class\}/g, pState.avatarName || 'Gleaner'),
        speaker: bark.speaker,
        style:   bark.style,
        weight:  bark.weight,
        oneShot: bark.oneShot
      };
    }

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
      delete _lastPoolFire[key];
    } else {
      _cooling      = {};
      _firedOnce    = {};
      _lastPoolFire = {};
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

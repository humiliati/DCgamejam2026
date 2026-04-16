/**
 * TrapRearm — Tracks consumed trap positions and lets Gleaner re-arm them.
 *
 * When HazardSystem consumes a TRAP tile (tile → EMPTY), TrapRearm records
 * that position. When the Gleaner faces a recorded position and interacts,
 * the tile is restored to TRAP. Re-armed traps contribute to the floor's
 * readiness score (misc weight in ReadinessCalc).
 *
 * Layer 1 — depends on: TILES
 */
var TrapRearm = (function () {
  'use strict';

  // ── Per-floor state ──────────────────────────────────────────────
  // _consumed[floorId] = { "x,y": true, ... }   — positions where traps were consumed
  // _rearmed[floorId]  = { "x,y": true, ... }   — positions Gleaner has re-armed
  // _total[floorId]    = number                  — total trap count at floor load
  var _consumed = {};
  var _rearmed  = {};
  var _total    = {};

  // Re-arm cooldown (ms) — prevents spam-rearming
  var REARM_TIME_MS = 600;
  var _lastRearmTime = 0;

  function _key(x, y) { return x + ',' + y; }

  // ── Floor lifecycle ─────────────────────────────────────────────

  /**
   * Scan a floor grid and count initial TRAP tiles. Call on floor load.
   *
   * @param {string} floorId
   * @param {Array}  grid
   * @param {number} gridW
   * @param {number} gridH
   */
  function onFloorLoad(floorId, grid, gridW, gridH) {
    // Post-load path (M2.3d): _total is already set from a save blob.
    // The fresh grid has authored-baseline TRAP tiles everywhere; patch
    // consumed-but-not-rearmed positions back to EMPTY so the loaded
    // floor matches the saved state.
    if (_total[floorId] !== undefined) {
      var consumed = _consumed[floorId];
      var rearmed  = _rearmed[floorId] || {};
      if (consumed) {
        for (var ck in consumed) {
          if (!consumed.hasOwnProperty(ck)) continue;
          if (rearmed[ck]) continue; // re-armed → grid already has TRAP
          var parts = ck.split(',');
          var cx = parseInt(parts[0], 10);
          var cy = parseInt(parts[1], 10);
          if (!isFinite(cx) || !isFinite(cy)) continue;
          if (grid[cy] && typeof grid[cy][cx] !== 'undefined') {
            grid[cy][cx] = TILES.EMPTY;
          }
        }
      }
      return;
    }

    var count = 0;
    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        if (grid[y][x] === TILES.TRAP) count++;
      }
    }
    _total[floorId] = count;
    if (!_consumed[floorId]) _consumed[floorId] = {};
    if (!_rearmed[floorId])  _rearmed[floorId]  = {};
  }

  /**
   * Record that a trap at (x, y) was consumed (triggered by player/enemy).
   * Called from HazardSystem.checkTile() after tile → EMPTY.
   *
   * If the trap was previously re-armed by the Gleaner, this clears the
   * rearmed flag so it can be re-armed again. This creates the core
   * strategic loop: arm traps → backtrack carefully → eat your own trap
   * if you forget → re-arm it again (at readiness cost each cycle).
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   */
  function onTrapConsumed(x, y, floorId) {
    if (!_consumed[floorId]) _consumed[floorId] = {};
    if (!_rearmed[floorId])  _rearmed[floorId]  = {};
    var key = _key(x, y);
    _consumed[floorId][key] = true;
    // Reset rearmed flag — trap must be re-armed again for readiness
    delete _rearmed[floorId][key];
  }

  /**
   * Check if a position is a consumed (disarmed) trap that can be re-armed.
   * Returns true when the position is consumed AND not currently armed.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @returns {boolean}
   */
  function canRearm(x, y, floorId) {
    if (!_consumed[floorId]) return false;
    var key = _key(x, y);
    return !!_consumed[floorId][key] && !(_rearmed[floorId] && _rearmed[floorId][key]);
  }

  /**
   * Re-arm the trap at (x, y). Restores the tile to TILES.TRAP on the grid.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} floorId
   * @param {Array}  grid - 2D tile grid (mutated in place)
   * @returns {boolean} true if re-armed successfully
   */
  function rearm(x, y, floorId, grid) {
    var now = Date.now();
    if (now - _lastRearmTime < REARM_TIME_MS) return false;

    if (!canRearm(x, y, floorId)) return false;

    grid[y][x] = TILES.TRAP;
    _rearmed[floorId][_key(x, y)] = true;
    _lastRearmTime = now;
    return true;
  }

  // ── Readiness ───────────────────────────────────────────────────

  /**
   * Get trap readiness for a floor (0.0–1.0).
   * 1.0 = all consumed traps re-armed (or no traps consumed).
   *
   * @param {string} floorId
   * @returns {number}
   */
  function getReadiness(floorId) {
    var consumed = _consumed[floorId];
    if (!consumed) return 1.0;

    var consumedCount = 0;
    var rearmedCount  = 0;
    var rearmed = _rearmed[floorId] || {};

    for (var key in consumed) {
      if (consumed.hasOwnProperty(key)) {
        consumedCount++;
        if (rearmed[key]) rearmedCount++;
      }
    }

    if (consumedCount === 0) return 1.0;
    return rearmedCount / consumedCount;
  }

  /**
   * Get stats for display.
   * @param {string} floorId
   * @returns {{ total: number, consumed: number, rearmed: number }}
   */
  function getStats(floorId) {
    var consumed = _consumed[floorId] || {};
    var rearmed  = _rearmed[floorId]  || {};
    var cc = 0, rc = 0;
    for (var k in consumed) { if (consumed.hasOwnProperty(k)) cc++; }
    for (var k2 in rearmed) { if (rearmed.hasOwnProperty(k2)) rc++; }
    return {
      total:    _total[floorId] || 0,
      consumed: cc,
      rearmed:  rc
    };
  }

  /**
   * Clear state for a floor (floor reset / re-generation).
   */
  function clearFloor(floorId) {
    delete _consumed[floorId];
    delete _rearmed[floorId];
    delete _total[floorId];
  }

  /**
   * Full reset (new game).
   */
  function reset() {
    _consumed = {};
    _rearmed  = {};
    _total    = {};
    _lastRearmTime = 0;
  }

  // ── Save/Load (Track B M2.3d) ───────────────────────────────────
  //
  // Three sparse sets + baseline count per floor — all plain JSON.
  // serialize returns null if nothing of interest has been recorded
  // (no consumed traps AND no baseline count). On deserialize, the
  // _total[floorId] flag also serves as the "already loaded" sentinel
  // for onFloorLoad's grid-patch path.

  function _copyKeys(src) {
    var out = {};
    if (!src) return out;
    for (var k in src) {
      if (src.hasOwnProperty(k) && src[k]) out[k] = true;
    }
    return out;
  }

  function serialize(floorId) {
    var totalSet = (_total[floorId] !== undefined);
    var consumed = _copyKeys(_consumed[floorId]);
    var rearmed  = _copyKeys(_rearmed[floorId]);
    var hasConsumed = false;
    for (var ckS in consumed) { if (consumed.hasOwnProperty(ckS)) { hasConsumed = true; break; } }
    if (!totalSet && !hasConsumed) return null;
    return {
      consumed: consumed,
      rearmed:  rearmed,
      total:    _total[floorId] | 0
    };
  }

  function deserialize(floorId, snap) {
    delete _consumed[floorId];
    delete _rearmed[floorId];
    delete _total[floorId];
    if (!snap || typeof snap !== 'object') return;
    _consumed[floorId] = _copyKeys(snap.consumed);
    _rearmed[floorId]  = _copyKeys(snap.rearmed);
    _total[floorId]    = snap.total | 0;
  }

  return Object.freeze({
    onFloorLoad:    onFloorLoad,
    onTrapConsumed: onTrapConsumed,
    canRearm:       canRearm,
    rearm:          rearm,
    getReadiness:   getReadiness,
    getStats:       getStats,
    clearFloor:     clearFloor,
    reset:          reset,
    serialize:      serialize,
    deserialize:    deserialize,
    REARM_TIME_MS:  REARM_TIME_MS
  });
})();

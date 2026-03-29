/**
 * StealthSystem — Player stealth bonus calculation.
 *
 * Extracted from EyesOnly stealth-system.js (Phase A3).
 * Jam-simplified: no SHADOW/GRASS/SMOKE tiles, no LightingSystem dep.
 *
 * Detection modifier sources (jam scope):
 *   - Darkness:    Unlit corridor tiles → flat -30% detection
 *   - Crate cover: Adjacent to BREAKABLE tile → -20% ("hiding behind your work")
 *   - Equipment:   Gleaner's Apron passive → -10% while restocking
 *   - Crouching:   Player crouched → -15% (future: crouch mechanic)
 *
 * The bonus is subtracted from the enemy's awareness gain per tick.
 * Example: 15 pts/tick base sight gain × (1 - 0.30 bonus) = 10.5 effective.
 *
 * Layer 1 — depends on: TILES, AwarenessConfig (Layer 0)
 */
var StealthSystem = (function () {
  'use strict';

  // ── Modifier constants ──────────────────────────────────────────
  var MODIFIERS = {
    DARKNESS:     0.30,  // Unlit corridor: -30% detection
    CRATE_COVER:  0.20,  // Adjacent to BREAKABLE: -20%
    APRON:        0.10,  // Gleaner's Apron passive: -10%
    CROUCH:       0.15   // Crouching: -15% (stub for future)
  };

  // ── Cache ───────────────────────────────────────────────────────
  // Avoid recalculation when player hasn't moved.
  var _cache = { px: -1, py: -1, floorId: '', bonus: 0 };

  // ── Tile darkness check ─────────────────────────────────────────
  // Jam-scope: unlit corridors are EMPTY tiles far from light sources.
  // Until the Lighting module exposes per-tile brightness, we approximate:
  // any EMPTY tile at distance > 4 from a STAIRS_UP (entry light) is "dark".

  /**
   * Check if a tile is in a dark corridor.
   * Simplified heuristic: EMPTY tiles where Lighting reports low brightness,
   * or fallback to distance-from-stairs if no Lighting module.
   *
   * @param {number} x
   * @param {number} y
   * @param {Array} grid
   * @param {number} gridW
   * @param {number} gridH
   * @returns {boolean}
   */
  function _isDark(x, y, grid, gridW, gridH) {
    // If Lighting module is available, use its brightness query
    if (typeof Lighting !== 'undefined' && Lighting.getBrightness) {
      return Lighting.getBrightness(x, y) < 0.3;
    }

    // Fallback heuristic: tile is EMPTY and not adjacent to any light source tile
    var tile = grid[y] && grid[y][x];
    if (tile !== TILES.EMPTY) return false;

    // Check 4-tile radius for light-source tiles (stairs, doors)
    var r = 4;
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        var nx = x + dx;
        var ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
        var t = grid[ny][nx];
        if (t === TILES.STAIRS_UP || t === TILES.STAIRS_DOWN ||
            t === TILES.DOOR || t === TILES.BOSS_DOOR) {
          return false; // Near a light source — not dark
        }
      }
    }
    return true;
  }

  /**
   * Check if player has crate cover (adjacent to a BREAKABLE tile).
   * "Hiding behind your work" — the restocking crates provide concealment.
   *
   * @param {number} x
   * @param {number} y
   * @param {Array} grid
   * @param {number} gridW
   * @param {number} gridH
   * @returns {boolean}
   */
  function _hasCrateCover(x, y, grid, gridW, gridH) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var nx = x + dirs[i][0];
      var ny = y + dirs[i][1];
      if (nx >= 0 && ny >= 0 && nx < gridW && ny < gridH) {
        if (grid[ny][nx] === TILES.BREAKABLE || grid[ny][nx] === TILES.CORPSE) {
          return true;
        }
      }
    }
    return false;
  }

  // ── Main API ────────────────────────────────────────────────────

  /**
   * Calculate total player stealth bonus (0.0–1.0 scale).
   * Capped at 0.80 — player can never be fully invisible.
   *
   * @param {number} px - Player grid X
   * @param {number} py - Player grid Y
   * @param {Array}  grid - Floor grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {string} floorId - Current floor ID
   * @param {Object} [opts] - Optional modifiers
   * @param {boolean} [opts.crouching] - Player is crouching
   * @param {boolean} [opts.hasApron] - Gleaner's Apron equipped
   * @param {boolean} [opts.restocking] - Currently in restock mode
   * @returns {number} Stealth bonus (0.0–0.80)
   */
  function getPlayerStealthBonus(px, py, grid, gridW, gridH, floorId, opts) {
    // Return cached value if player hasn't moved
    if (_cache.px === px && _cache.py === py && _cache.floorId === floorId) {
      return _cache.bonus;
    }

    opts = opts || {};
    var bonus = 0;

    // Darkness bonus
    if (_isDark(px, py, grid, gridW, gridH)) {
      bonus += MODIFIERS.DARKNESS;
    }

    // Crate cover bonus
    if (_hasCrateCover(px, py, grid, gridW, gridH)) {
      bonus += MODIFIERS.CRATE_COVER;
    }

    // Equipment: Gleaner's Apron (only while restocking)
    if (opts.hasApron && opts.restocking) {
      bonus += MODIFIERS.APRON;
    }

    // Crouch bonus (stub — future mechanic)
    if (opts.crouching) {
      bonus += MODIFIERS.CROUCH;
    }

    // Cap at 80%
    bonus = Math.min(0.80, bonus);

    // Cache
    _cache = { px: px, py: py, floorId: floorId, bonus: bonus };

    return bonus;
  }

  /**
   * Apply stealth bonus to an awareness gain value.
   * @param {number} baseGain - Raw awareness gain (e.g. 15 for sight)
   * @param {number} stealthBonus - From getPlayerStealthBonus()
   * @returns {number} Effective gain after stealth reduction
   */
  function applyBonus(baseGain, stealthBonus) {
    return baseGain * (1 - stealthBonus);
  }

  /**
   * Invalidate the stealth cache (call on floor transition).
   */
  function invalidateCache() {
    _cache = { px: -1, py: -1, floorId: '', bonus: 0 };
  }

  // ── Public API ──────────────────────────────────────────────────
  return {
    MODIFIERS:              MODIFIERS,
    getPlayerStealthBonus:  getPlayerStealthBonus,
    applyBonus:             applyBonus,
    invalidateCache:        invalidateCache
  };
})();

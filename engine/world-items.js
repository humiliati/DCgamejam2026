/**
 * WorldItems — unified ground-item manager for walk-over collectibles.
 *
 * Tracks gold, battery, and food items that spill onto floor tiles from
 * destroyed breakable props. Player walks over TILES.COLLECTIBLE tiles to
 * auto-collect them.
 *
 * Adapted from EyesOnly's world-items.js (119 lines).
 * DG simplification: single _groundItems[] vs EyesOnly's two-array split.
 *
 * Layer 1 — depends on: TILES
 */
var WorldItems = (function () {
  'use strict';

  // ── Internal state ───────────────────────────────────────────────

  // Each entry: { x, y, type, amount?, itemId? }
  // type: 'gold' | 'battery' | 'food'
  var _groundItems = [];

  // ── Lifecycle ────────────────────────────────────────────────────

  /** Reset on new floor. */
  function init() {
    _groundItems = [];
  }

  // ── Mutation ─────────────────────────────────────────────────────

  /**
   * Spawn a collectible at grid position (x, y).
   * Sets the grid tile to TILES.COLLECTIBLE.
   *
   * @param {number}   x     - Grid X
   * @param {number}   y     - Grid Y
   * @param {Object}   entry - { type, amount?, itemId? }
   * @param {Array}    grid  - Live grid from FloorManager
   */
  function spawnAt(x, y, entry, grid) {
    _groundItems.push({ x: x, y: y, type: entry.type, amount: entry.amount, itemId: entry.itemId });
    if (grid && grid[y] && grid[y][x] !== undefined) {
      grid[y][x] = TILES.COLLECTIBLE;
    }
  }

  /**
   * Remove and return the first item at (x, y).
   * Clears the grid tile to TILES.EMPTY if no items remain at that position.
   *
   * @param {number} x
   * @param {number} y
   * @param {Array}  grid - Live grid from FloorManager
   * @returns {Object|null} The collected item entry, or null if nothing there.
   */
  function pickupAt(x, y, grid) {
    var idx = -1;
    for (var i = 0; i < _groundItems.length; i++) {
      if (_groundItems[i].x === x && _groundItems[i].y === y) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return null;

    var picked = _groundItems.splice(idx, 1)[0];

    // Clear tile only if no more items remain at this position
    var stillHere = false;
    for (var j = 0; j < _groundItems.length; j++) {
      if (_groundItems[j].x === x && _groundItems[j].y === y) {
        stillHere = true;
        break;
      }
    }
    if (!stillHere && grid && grid[y] && grid[y][x] === TILES.COLLECTIBLE) {
      grid[y][x] = TILES.EMPTY;
    }

    return picked;
  }

  /**
   * Peek at the first item at (x, y) without removing it.
   * @returns {Object|null}
   */
  function getAt(x, y) {
    for (var i = 0; i < _groundItems.length; i++) {
      if (_groundItems[i].x === x && _groundItems[i].y === y) {
        return _groundItems[i];
      }
    }
    return null;
  }

  // ── Filter helper ────────────────────────────────────────────────

  /** Batch-remove items matching a predicate. Updates grid tiles. */
  function filterItems(fn, grid) {
    _groundItems = _groundItems.filter(function (item) {
      var keep = fn(item);
      if (!keep && grid && grid[item.y] && grid[item.y][item.x] === TILES.COLLECTIBLE) {
        // Only clear tile if no other item lives there
        var others = _groundItems.filter(function (o) { return o !== item && o.x === item.x && o.y === item.y; });
        if (others.length === 0) grid[item.y][item.x] = TILES.EMPTY;
      }
      return keep;
    });
  }

  // ── Rendering view ───────────────────────────────────────────────

  /**
   * Returns all ground items tagged with _wt (world-type) for the renderer.
   * DG renderer uses _wt to pick glyph / colour.
   *   'gold'    → yellow ¢ coin glyph
   *   'battery' → cyan ◈ glyph
   *   'food'    → emoji from itemId
   */
  function getAllForRendering() {
    return _groundItems.map(function (item) {
      return { x: item.x, y: item.y, _wt: item.type, amount: item.amount, itemId: item.itemId };
    });
  }

  /** Raw access to the live array (for debugging / save-load). */
  function getAll() { return _groundItems; }

  // ── Public API ───────────────────────────────────────────────────
  return {
    init:               init,
    spawnAt:            spawnAt,
    pickupAt:           pickupAt,
    getAt:              getAt,
    filterItems:        filterItems,
    getAllForRendering:  getAllForRendering,
    getAll:             getAll
  };
})();

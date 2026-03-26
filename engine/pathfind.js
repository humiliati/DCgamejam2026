/**
 * Pathfind — BFS grid pathfinding.
 * Ported from dcexjam2025's pathfind.ts.
 *
 * Respects wall/tile blocking and fog-of-war visibility.
 * Returns array of {x, y} positions from start to destination, or null.
 *
 * Depends on: TILES, MovementController (for DX/DY)
 */
var Pathfind = (function () {
  'use strict';

  var DX = MovementController.DX; // [1, 0, -1, 0]
  var DY = MovementController.DY; // [0, 1, 0, -1]

  /**
   * Find shortest path on grid from (sx, sy) to (dx, dy).
   * @param {Array[]} grid - 2D grid[y][x]
   * @param {number} gridW
   * @param {number} gridH
   * @param {number} sx - Start X
   * @param {number} sy - Start Y
   * @param {number} dx - Dest X
   * @param {number} dy - Dest Y
   * @param {Object} [opts]
   * @param {Object} [opts.explored] - "x,y" → true hash for fog-of-war (null = ignore)
   * @returns {Array<{x:number, y:number}>|null} Path including start and end, or null
   */
  function find(grid, gridW, gridH, sx, sy, dx, dy, opts) {
    opts = opts || {};
    var explored = opts.explored || null;

    var destIdx = dx + dy * gridW;
    var startIdx = sx + sy * gridW;

    var seen = {};
    var queue = [];
    var parent = [];

    function push(idx, parentIdx) {
      if (seen[idx]) return;
      seen[idx] = true;

      var cx = idx % gridW;
      var cy = (idx - cx) / gridW;

      // Must be walkable (except destination — allow path TO non-walkable for interaction)
      if (idx !== destIdx && !TILES.isWalkable(grid[cy][cx])) return;

      // Fog-of-war: only path through explored tiles (except destination)
      if (explored && idx !== destIdx && !explored[cx + ',' + cy]) return;

      queue.push(idx);
      parent.push(parentIdx);
    }

    function buildPath(queueIdx) {
      var path = [];
      while (queueIdx !== -1) {
        var idx = queue[queueIdx];
        var cx = idx % gridW;
        var cy = (idx - cx) / gridW;
        path.push({ x: cx, y: cy });
        queueIdx = parent[queueIdx];
      }
      return path.reverse();
    }

    push(startIdx, -1);

    var qi = 0;
    while (qi < queue.length) {
      var idx = queue[qi];
      if (idx === destIdx) {
        return buildPath(qi);
      }

      var cx = idx % gridW;
      var cy = (idx - cx) / gridW;

      // Check all 4 directions
      for (var dir = 0; dir < 4; dir++) {
        var nx = cx + DX[dir];
        var ny = cy + DY[dir];
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        push(nx + ny * gridW, qi);
      }

      qi++;
    }

    return null; // No path found
  }

  return {
    find: find
  };
})();

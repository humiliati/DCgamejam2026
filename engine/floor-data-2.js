/**
 * FloorData2 — Hand-authored Floor "2": Lantern Row (depth 1)
 *
 * 24×16 exterior. Commercial district north of The Promenade.
 * Gas lanterns line the cobblestone streets. More shops, the Dispatcher's
 * Office (DOOR at 5,2), and the Watchman's Post (DOOR at 18,2).
 * Bonfire rest point at (11,8) — street lamp gathering area.
 *
 * Legend: 0=EMPTY, 2=DOOR, 4=DOOR_EXIT, 10=PILLAR, 12=SHOP, 18=BONFIRE,
 *         21=TREE, 22=SHRUB
 *
 * Spawn: (11, 13) facing NORTH
 * DOOR_EXIT (11,14) → Floor "1" (The Promenade)
 * DOOR (5,2) → Floor "2.1" (Dispatcher's Office)
 * DOOR (18,2) → Floor "2.2" (Watchman's Post)
 */
var FloorData2 = (function() {
  'use strict';

  var _FLOOR2_W = 24;
  var _FLOOR2_H = 16;
  var _FLOOR2_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 0  tree perimeter
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 1  north walk
    [21, 0, 1, 1, 1, 2, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 1, 1, 0, 0,21], // 2  shop facades + DOORs (5,2) (18,2)
    [21, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0,21], // 3  shop backs (solid mass)
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 4  corridor
    [21, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 0,21], // 5  pillar row (lanterns)
    [21, 0,12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 6  SHOP stall (2,6)
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 7  street lane
    [21, 0, 0, 0,10, 0, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 0,21], // 8  BONFIRE (10,8) + pillar lanterns
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 9  open plaza
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 10 open plaza
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 11 approach
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 12 spawn area
    [21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21], // 13 south gate, DOOR_EXIT (10,13)
    [21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21], // 14 behind gate
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21]  // 15 tree perimeter
  ];

  var _FLOOR2_SPAWN = { x: 11, y: 13, dir: 3 }; // facing NORTH
  var _FLOOR2_ROOMS = [
    // Main street corridor (open plaza area)
    { x: 1, y: 4, w: 22, h: 9, cx: 12, cy: 8 }
  ];

  function _buildFloor2() {
    var grid = [];
    for (var y = 0; y < _FLOOR2_H; y++) {
      grid[y] = _FLOOR2_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR2_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorExit: { x: 10, y: 13 }  // DOOR_EXIT — back to The Promenade (depth 1→1)
      },
      doorTargets: { '5,2': '2.1', '18,2': '2.2', '10,13': '1' },  // DOORs (5,2)→Dispatcher's Office, (18,2)→Watchman's Post, DOOR_EXIT (10,13)→Promenade
      gridW: _FLOOR2_W,
      gridH: _FLOOR2_H,
      biome: 'exterior',
      shops: []
    };
  }

  return { build: _buildFloor2 };
})();

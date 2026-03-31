var FloorData13 = (function() { 'use strict';
  //
  // ── Hand-authored Floor 1.3: Cellar Entrance (depth 2) ──────────────
  //
  // 14×10 interior. A cramped stone building with stairs leading down
  // to the Soft Cellar dungeon. Two distinct rooms separated by a
  // partition wall with archway.
  //
  //   1. Entry room (south)  — DOOR_EXIT (back to Promenade), CHEST (supply cache)
  //   2. Stair chamber (north, lower) — STAIRS_DN (descent), BOOKSHELF (warning note)
  //
  // PILLAR archway columns at (4,5) and (9,5) separate the two rooms.
  // CHEST (tile 7) at (10,3) holds supply items.
  // BOOKSHELF (tile 25) at (2,3) contains lore warning about the dungeon.
  //
  // DOOR_EXIT at (6,8) leads back to The Promenade (Floor 1).
  // STAIRS_DN at (6,2) descends to Soft Cellar (Floor 1.3.1).
  //
  // Tile legend:
  //   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  7=CHEST
  //  10=PILLAR  25=BOOKSHELF

  var _FLOOR13_W = 14;
  var _FLOOR13_H = 10;
  // prettier-ignore
  var _FLOOR13_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13
    [  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  perimeter
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1  stair chamber
    [  1, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 1], // 2  STAIRS_DN (6,2)
    [  1, 0,25, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 1], // 3  BOOKSHELF (2,3) | CHEST (10,3)
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 4  stair chamber
    [  1, 0, 0, 0,10, 0, 0, 0, 0,10, 0, 0, 0, 1], // 5  PILLAR archway (4,5) (9,5)
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6  entry room
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 7  entry room
    [  1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1], // 8  DOOR_EXIT (6,8)
    [  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // 9  perimeter
  ];

  var _FLOOR13_SPAWN = { x: 6, y: 7, dir: 3 }; // facing NORTH
  var _FLOOR13_ROOMS = [
    // Entry room (south)
    { x: 1, y: 6, w: 12, h: 2, cx: 6, cy: 7 },
    // Stair chamber (north)
    { x: 1, y: 1, w: 12, h: 4, cx: 6, cy: 3 }
  ];

  function _buildFloor13() {
    var grid = [];
    for (var y = 0; y < _FLOOR13_H; y++) {
      grid[y] = _FLOOR13_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR13_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: { x: 6, y: 2 }, // STAIRS_DN — to Soft Cellar (depth 2→3)
        doorExit: { x: 6, y: 8 }  // DOOR_EXIT — back to Promenade (depth 2→1)
      },
      doorTargets: {},  // DOOR_EXIT and STAIRS follow convention
      gridW: _FLOOR13_W,
      gridH: _FLOOR13_H,
      biome: 'cellar',
      shops: [],
      books: [
        { x: 2, y: 3, bookId: 'tip_cellar_warning' }  // Warning note about dungeon
      ]
    };
  }

  return { build: _buildFloor13 };
})();

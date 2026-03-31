/**
 * FloorData21 — Hand-authored Floor 2.1: Dispatcher's Office (depth 2)
 *
 * 16×14 interior. The agency that employs Gleaner. Mission briefing room,
 * filing cabinets, dispatch desk. Three rooms: Reception (south), Briefing
 * room (center, large), Back office (north).
 *
 * DOOR_EXIT at (7,12) leads back to Lantern Row (Floor "2").
 * STAIRS_DN at (12,2) descends to dungeon "2.1.1" (if implemented).
 * TABLE tiles (28) at (7,5) and (8,5) — briefing table.
 * BOOKSHELF (25) at (2,2) and (13,2) — mission dossiers.
 * BAR_COUNTER (26) at (3,9) — reception desk.
 * PILLAR (10) at (5,7) and (10,7) — structural supports.
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN
 *  10=PILLAR  25=BOOKSHELF  26=BAR_COUNTER  28=TABLE
 */
var FloorData21 = (function() {
  'use strict';

  var _FLOOR21_W = 16;
  var _FLOOR21_H = 14;
  // prettier-ignore
  var _FLOOR21_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], //  0  north wall
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], //  1  back office (open)
    [ 1, 0,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5,25, 0, 1], //  2  BOOKSHELF(2,2) | STAIRS_DN(12,2) | BOOKSHELF(13,2)
    [ 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], //  3  inner wall | inner wall
    [ 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], //  4  briefing chamber
    [ 1, 0, 0, 0, 1, 0, 0,28,28, 0, 0, 1, 0, 0, 0, 1], //  5  | TABLE pair(7,5)(8,5) |
    [ 1, 0,10, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0,10, 0, 1], //  6  PILLAR(2,6) | | PILLAR(13,6)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], //  7  briefing open (door to reception)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], //  8  reception hall
    [ 1, 0, 0,26, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], //  9  BAR_COUNTER(3,9) — reception desk
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 10  reception open
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 11  reception entry
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], // 12  DOOR_EXIT(7,12)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // 13  south wall
  ];

  var _FLOOR21_SPAWN = { x: 7, y: 11, dir: 3 }; // facing NORTH (toward briefing room)
  var _FLOOR21_ROOMS = [
    // Reception (south) — entry hall with desk
    { x: 1, y: 8, w: 14, h: 4, cx: 7, cy: 9 },
    // Briefing room (center) — large space with table
    { x: 5, y: 3, w: 6, h: 5, cx: 7, cy: 5 },
    // Back office (north) — filing, shelves, stairs
    { x: 1, y: 1, w: 14, h: 2, cx: 7, cy: 1 }
  ];

  function _buildFloor21() {
    var grid = [];
    for (var y = 0; y < _FLOOR21_H; y++) {
      grid[y] = _FLOOR21_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR21_ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: { x: 12, y: 2 }, // STAIRS_DN — to dungeon 2.1.1 (depth 2→3)
        doorExit: { x: 7, y: 12 }  // DOOR_EXIT — back to Lantern Row (depth 2→1)
      },
      doorTargets: {},  // DOOR_EXIT and STAIRS follow convention
      gridW: _FLOOR21_W,
      gridH: _FLOOR21_H,
      biome: 'inn',
      shops: [],
      books: [
        { x: 2,  y: 2, bookId: 'lore_agency_history' },
        { x: 13, y: 2, bookId: 'tip_dispatch_missions' }
      ]
    };
  }

  return { build: _buildFloor21 };
})();

/**
 * FloorData22 — Hand-authored Floor "2.2" — Watchman's Post (depth 2)
 *
 * 16×12 interior. Military outpost staging area for Hero's Wake dungeons.
 * A shaken watchman guards the entrance to the deeper dungeons. This is
 * the staging area where Gleaner prepares for hero-cleaning operations.
 *
 * Rooms:
 *   - Guard room (south) — DOOR_EXIT, armory nook, bonfire
 *   - Watch station (center) — desk, incident report (bookshelf)
 *   - Stair access (north) — STAIRS_DN to Hero's Wake B1
 *
 * Features:
 *   - DOOR_EXIT (tile 4) at (7,10) → back to Floor "2" (Lantern Row)
 *   - STAIRS_DN (tile 5) at (7,2) → descends to "2.2.1" (Hero's Wake B1)
 *   - CHEST (tile 7) at (2,3) — gear cache
 *   - BONFIRE (tile 18) at (12,4) — staging bonfire
 *   - BOOKSHELF (tile 25) at (12,8) — incident report
 *   - PILLAR (tile 10) at (4,6) and (10,6) — support posts
 *   - WALL perimeter with partition at row 6
 *
 * Spawn: x=7, y=9, facing NORTH
 * Biome: "bazaar" (military cool tones — steel, concrete, sharp angles)
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  7=CHEST  10=PILLAR
 *  18=BONFIRE  25=BOOKSHELF
 */
var FloorData22 = (function() {
  'use strict';

  var _FLOOR22_W = 16;
  var _FLOOR22_H = 12;
  // prettier-ignore
  var _FLOOR22_GRID = [
    // 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  perimeter
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1  north hall
    [  1, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 1], // 2  STAIRS_DN (7,2)
    [  1, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 3  CHEST (2,3) — gear cache
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,18, 0, 0, 1], // 4  staging area | BONFIRE (12,4)
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  open space
    [  1, 0, 0, 0,10, 0, 1, 0, 0, 0,10, 0, 0, 0, 0, 1], // 6  PILLAR (4,6) | partition | PILLAR (10,6)
    [  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 7  watch station (east side)
    [  1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,25, 0, 0, 1], // 8  desk area | BOOKSHELF (12,8) — incident report
    [  1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  guard room — spawn row
    [  1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], // 10 DOOR_EXIT (7,10)
    [  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // 11 perimeter
  ];

  var _FLOOR22_SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH

  var _FLOOR22_ROOMS = [
    // Guard room (south — entry area)
    { x: 1, y: 7, w: 14, h: 3, cx: 7, cy: 8 },
    // Watch station (center — desk and report area)
    { x: 1, y: 1, w: 14, h: 6, cx: 8, cy: 4 }
  ];

  function _buildFloor22() {
    var grid = [];
    for (var y = 0; y < _FLOOR22_H; y++) {
      grid[y] = _FLOOR22_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR22_ROOMS.slice(),
      doors: {
        stairsUp: null,            // Exit is via DOOR_EXIT, not stairs
        stairsDn: { x: 7, y: 2 },  // STAIRS_DN — to Hero's Wake B1 (depth 2→3)
        doorExit: { x: 7, y: 10 }  // DOOR_EXIT — back to Lantern Row (depth 2→1)
      },
      doorTargets: {},  // DOOR_EXIT and STAIRS follow convention
      gridW: _FLOOR22_W,
      gridH: _FLOOR22_H,
      biome: 'bazaar',
      shops: [],
      books: [
        { x: 12, y: 8, bookId: 'lore_hero_sightings' }  // Incident report — hero activity log
      ]
    };
  }

  return { build: _buildFloor22 };
})();

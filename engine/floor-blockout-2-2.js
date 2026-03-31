/**
 * Floor Blockout 2.2 — Watchman's Post (depth 2, interior)
 *
 * 18×14 interior. Military staging area — a guard station that serves
 * as the gateway to Hero's Wake dungeon (Floors 2.2.1, 2.2.2).
 * Entered from Lantern Row (Floor 2). Heavy stone walls, iron details,
 * planning table, and a prominent stairway descending into darkness.
 *
 * Biome: 'watchpost' — cathedral stone walls, stone floor, cold grey
 * military palette with iron accents.
 *
 * Rooms:
 *   1. Armory room (west)    — weapon racks (BOOKSHELF), supply chest
 *   2. Planning room (east)  — planning TABLE, mission records
 *   3. Descent hall (north)  — STAIRS_DN to Hero's Wake B1 (2.2.1)
 *   4. Entry hall (south)    — DOOR_EXIT, guard pillars
 *
 * Purpose:
 *   - Hero's Wake dungeon gateway (major narrative pivot point)
 *   - Shaken watchman NPC delivers warning about what lies below
 *   - Planning table holds dungeon intel (bookshelf lore)
 *   - Bonfire for pre-dungeon rest
 *
 * NPC zones:
 *   - Shaken Watchman (INTERACTIVE) near stairs — delivers hero warning
 *   - Guard (AMBIENT) patrols entry hall
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  7=CHEST  10=PILLAR
 *   18=BONFIRE  25=BOOKSHELF  28=TABLE
 */
(function () {
  'use strict';

  var W = 18;
  var H = 14;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0,28, 0, 1], // 1  armory shelf | descent hall | planning table
    [ 1, 0, 0, 7, 0, 1, 0, 0, 0, 5, 0, 0, 1, 0, 0, 0, 0, 1], // 2  CHEST(3,2) | STAIRS_DN(9,2) | planning room
    [ 1,25, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0,25, 0,25, 1], // 3  armory shelf | descent open | records shelves
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 4  ←doorway   | descent open | doorway→
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  open hall
    [ 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], // 6  armory wall | bonfire area | planning wall
    [ 1, 0, 0, 0, 0, 1, 0, 0, 0,18, 0, 0, 1, 0, 0, 0, 0, 1], // 7  armory      | BONFIRE(9,7) | planning room
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], // 8  side walls  | entry corr   | side walls
    [ 1, 1, 1, 1, 1, 1, 0, 0,10, 0,10, 0, 1, 1, 1, 1, 1, 1], // 9             | guard pillars |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], //10             | entry hall    |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1], //11             | spawn area    |
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], //12  DOOR_EXIT (9,12)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //13  south wall
  ];

  var SPAWN = { x: 9, y: 11, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1,  y: 1, w: 4,  h: 6, cx: 2,  cy: 3 },  // Armory room (west)
    { x: 6,  y: 1, w: 6,  h: 6, cx: 9,  cy: 3 },  // Descent hall (center)
    { x: 13, y: 1, w: 4,  h: 6, cx: 15, cy: 3 },  // Planning room (east)
    { x: 6,  y: 8, w: 6,  h: 4, cx: 9,  cy: 10 }  // Entry hall (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1, bookId: 'manual_admiralty_handbook' },  // Armory — equipment manual
    { x: 1,  y: 3, bookId: 'lore_hero_arrival' },          // Armory — hero arrival report
    { x: 14, y: 3, bookId: 'notice_hero_registration' },   // Planning — hero registration notice
    { x: 16, y: 3, bookId: 'lore_dragon_history_2' }       // Planning — dragon lore
  ];

  function build() {
    var grid = [];
    for (var y = 0; y < H; y++) {
      grid[y] = GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: { x: 9, y: 2 },   // STAIRS_DN — to Hero's Wake B1 (2.2.1)
        doorExit: { x: 9, y: 12 }   // DOOR_EXIT — back to Lantern Row
      },
      doorTargets: { '9,12': '2' },  // DOOR_EXIT → Lantern Row
      gridW: W,
      gridH: H,
      biome: 'watchpost',
      shops: [],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('2.2', build);
})();

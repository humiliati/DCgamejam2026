/**
 * Floor Blockout 1.2 — Driftwood Inn (depth 2, interior)
 *
 * 20×16 interior. Warm tavern space entered from The Promenade (Floor 1).
 * Features a main taproom with bar counter, dining area, guest rooms,
 * and a cozy hearth. DOOR_EXIT at south returns to Floor 1.
 *
 * Biome: 'inn' — warm wood plank walls, amber lamplight, wooden floor.
 *
 * Rooms:
 *   1. Taproom (center)   — BAR_COUNTER, dining TABLEs, bookshelves
 *   2. Hearth nook (west) — HEARTH fireplace, seating
 *   3. Guest wing (east)  — BEDs for resting, storage shelf
 *   4. Entry hall (south) — DOOR_EXIT, pillars, welcome area
 *
 * NPC zones:
 *   - Bartender (VENDOR) behind bar counter at (10,3)
 *   - Ambient patron at taproom table area
 *   - Interactive innkeeper near hearth nook
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  10=PILLAR  18=BONFIRE
 *   25=BOOKSHELF  26=BAR_COUNTER  27=BED  28=TABLE  29=HEARTH
 */
(function () {
  'use strict';

  var W = 20;
  var H = 16;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,25, 1], // 1  hearth shelf | taproom | guest shelf
    [ 1, 0, 0, 0, 0, 1, 0, 0,26,26,26,26, 0, 0, 0, 1, 0,27,27, 1], // 2  hearth room  | bar counter row | guest BEDs
    [ 1, 0,29, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 3  HEARTH(2,3) | taproom open    | guest room
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 4  ←doorway    | taproom open    | doorway→
    [ 1, 0, 0, 0, 0, 0, 0, 0,28, 0, 0,28, 0, 0, 0, 0, 0, 0, 0, 1], // 5  hearth area | dining TABLEs(8,11) | guest area
    [ 1, 0, 0,28, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0,25, 0, 1], // 6  side table  | open            | guest bookshelf
    [ 1, 0, 0, 0, 0, 1, 0, 0,28, 0, 0,28, 0, 0, 0, 1, 0, 0, 0, 1], // 7  hearth room | dining TABLEs   | guest room
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 8  hearth wall | taproom mid     | guest wall
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 9             | corridor        |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0,10, 0,10, 0, 0, 0, 1, 1, 1, 1, 1], //10             | hall pillars    |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //11             | entry open      |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //12             | entry open      |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //13             | entry open      |
    [ 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //14             | spawn row       |
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //15  DOOR_EXIT(10,15)
  ];

  var SPAWN = { x: 10, y: 14, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1,  y: 1, w: 4,  h: 7, cx: 2,  cy: 3  },  // Hearth nook (west)
    { x: 6,  y: 1, w: 9,  h: 7, cx: 10, cy: 4  },  // Taproom (center)
    { x: 16, y: 1, w: 3,  h: 7, cx: 17, cy: 3  },  // Guest wing (east)
    { x: 6,  y: 9, w: 9,  h: 6, cx: 10, cy: 12 }   // Entry hall (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1, bookId: 'fiction_tides_of_passion' },  // Hearth shelf — romance novel
    { x: 18, y: 1, bookId: 'lore_dragon_history_1' },     // Guest shelf — dragon lore
    { x: 17, y: 6, bookId: 'tip_inn_bonfire' }            // Guest bookshelf — inn tips
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
        stairsDn: null,
        doorExit: { x: 10, y: 15 }
      },
      doorTargets: { '10,15': '1' },  // DOOR_EXIT → The Promenade
      gridW: W,
      gridH: H,
      biome: 'inn',
      shops: [],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('1.2', build);
})();

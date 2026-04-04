/**
 * Floor Blockout 1.3 — Cellar Entrance (depth 2, interior)
 *
 * 16×12 interior. Transitional building that serves as the gateway
 * to the tutorial dungeon below (Floor 1.3.1 — Soft Cellar).
 * Entered from The Promenade (Floor 1). Stone walls with cellar theme.
 *
 * Biome: 'cellar_entry' — rough stone walls, dirt floor, cellar doors.
 *
 * Rooms:
 *   1. Staging room (north)  — STAIRS_DN to dungeon, supply shelf
 *   2. Entry hall (south)    — DOOR_EXIT, lantern pillars
 *
 * Purpose:
 *   - Tutorial dungeon gateway (gentle introduction to depth-3 floors)
 *   - Supply check before descent (bookshelf with combat tips)
 *   - Bonfire for pre-dungeon rest
 *
 * NPC zones:
 *   - Guide NPC (INTERACTIVE) near stairs — warns about dungeon dangers
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  10=PILLAR
 *   18=BONFIRE  25=BOOKSHELF
 */
(function () {
  'use strict';

  var W = 16;
  var H = 12;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1, 0,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,25, 0, 1], // 1  supply shelves
    [ 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 2  inner wall (stair alcove)
    [ 1, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 1], // 3  STAIRS_DN (7,3) — to Soft Cellar
    [ 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 4  stair chamber
    [ 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 5  alcove gap
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6  main hall
    [ 1, 0,10, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,10, 0, 1], // 7  pillars + BONFIRE (7,7)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 8  entry hall
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  spawn area
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], //10  DOOR_EXIT (7,10)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //11  south wall
  ];

  var SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1,  y: 1, w: 14, h: 5, cx: 7, cy: 3 },  // Staging room (north)
    { x: 1,  y: 6, w: 14, h: 4, cx: 7, cy: 8 }   // Entry hall (south)
  ];

  var BOOKS = [
    { x: 2,  y: 1, bookId: 'guide_adventurer_general' },   // Adventurer's Pocket Guide (universal)
    { x: 13, y: 1, bookId: 'guide_cleaner_general' }       // Gleaner's Cleaning Manual (universal)
  ];

  // NOTE: tip_combat and lore_dragon_history_2 still resolve via biome fallback.
  // The explicit assignments prioritize the two universal guides a new player needs
  // before their first dungeon descent. Cellar-specific lore (lore_soft_cellar)
  // resolves from the cellar_entry biome pool on any un-assigned shelf.

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
        stairsDn: { x: 7, y: 3 },   // STAIRS_DN — to Soft Cellar (1.3.1)
        doorExit: { x: 7, y: 10 }   // DOOR_EXIT — back to Promenade
      },
      doorTargets: { '7,10': '1' },  // DOOR_EXIT → The Promenade
      gridW: W,
      gridH: H,
      biome: 'cellar_entry',
      shops: [],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('1.3', build);
})();

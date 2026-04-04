/**
 * Floor Blockout 3.1 — Armory / Barracks (depth 2, interior)
 *
 * 18×14 interior. Military staging area entered from The Garrison
 * (Floor 3) via the north arm facade door. Heavy stone and iron,
 * weapon racks, a planning table, and descent to Ironhold Depths.
 *
 * Biome: 'armory' — stone_cathedral walls, iron doors, stone floor.
 *
 * Rooms:
 *   1. Armory hall (north)   — weapon racks (BOOKSHELF), supply shelves,
 *                               STAIRS_DN to Ironhold Depths (3.1.1)
 *   2. Staging area (center) — planning TABLE, BONFIRE, pillars
 *   3. Entry corridor (south)— DOOR_EXIT back to The Garrison
 *
 * NPC zones:
 *   - Quartermaster near weapon racks (north hall)
 *   - Guard at staging area entrance
 *
 * Door wiring:
 *   DOOR_EXIT (8,13) → '3' (The Garrison)
 *   STAIRS_DN (8,3)  → 3.1.1 (Ironhold Depths — proc-gen foundry dungeon)
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  10=PILLAR
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
    [ 1, 0,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,25, 0, 1], // 1  weapon racks (bookshelves)
    [ 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1], // 2  inner wall (stair alcove)
    [ 1, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 0, 1], // 3  STAIRS_DN (8,3) — to Ironhold Depths
    [ 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], // 4  stair chamber
    [ 1, 0,25, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0,25, 0, 0, 1], // 5  shelves + alcove gap
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6  open staging hall
    [ 1, 0,10, 0, 0,28, 0, 0,18, 0, 0,28, 0, 0, 0,10, 0, 1], // 7  pillars + TABLEs + BONFIRE (8,7)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 8  staging open
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 9  corridor neck
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //10  corridor
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //11  entry hall
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //12  spawn row
    [ 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //13  DOOR_EXIT (8,13)
  ];

  var SPAWN = { x: 8, y: 12, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1,  y: 1, w: 16, h: 8, cx: 8, cy: 5 },  // Armory + staging hall (north)
    { x: 5,  y: 9, w: 8,  h: 4, cx: 8, cy: 11 }   // Entry corridor (south)
  ];

  var BOOKS = [
    { x: 2,  y: 1, bookId: 'guide_adventurer_general' },     // Weapon rack — Adventurer's Pocket Guide (universal)
    { x: 15, y: 1, bookId: 'guide_cleaner_general' },        // Weapon rack — Gleaner's Cleaning Manual (universal)
    { x: 2,  y: 5, bookId: 'lore_ironhold_depths' },         // Supply shelf — Ironhold dungeon lore
    { x: 14, y: 5, bookId: 'notice_ironhold_expedition' }    // Supply shelf — expedition log
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
        stairsDn: { x: 8, y: 3 },   // STAIRS_DN — to Ironhold Depths (3.1.1)
        doorExit: { x: 8, y: 13 }   // DOOR_EXIT — back to The Garrison
      },
      doorTargets: { '8,13': '3' },  // DOOR_EXIT → The Garrison (Floor 3)
      gridW: W,
      gridH: H,
      biome: 'armory',
      shops: [],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('3.1', build);
})();

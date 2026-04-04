/**
 * Floor Blockout 1.1 — Coral Bazaar (depth 2, interior)
 *
 * 16×12 interior. Warm coral-gold market hall entered from
 * The Promenade (Floor 1). DOOR_EXIT at south returns to Floor 1.
 * STAIRS_DN at north descends to Coral Cellars (1.1.1 — proc-gen dungeon).
 *
 * Biome: 'bazaar' — warm coral-gold, stone_rough walls, wood_plank pillars.
 *
 * Rooms:
 *   1. Main hall (south)   — entry area, pillars, bonfire, bookshelves
 *   2. Stair chamber (north) — recessed alcove with STAIRS_DN to Coral Cellars
 *
 * NPC zones:
 *   - bazaar_merchant at (4,8) — stall vendor
 *   - bazaar_archivist at (10,8) — lore contact
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  10=PILLAR
 *   12=SHOP  18=BONFIRE  25=BOOKSHELF  26=BAR_COUNTER
 */
(function () {
  'use strict';

  var W = 16;
  var H = 12;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  perimeter
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1  north hall
    [ 1, 0,25, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0,25, 0, 1], // 2  inner wall + BOOKSHELVES (2,2) (13,2)
    [ 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 3  stair chamber
    [ 1, 0, 0, 0, 1, 0, 0, 5, 0, 0, 0, 1, 0, 0, 0, 1], // 4  STAIRS_DN (7,4) — to Coral Cellars
    [ 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1], // 5  stair chamber
    [ 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // 6  gap at (6-8)
    [ 1, 0,25, 0,12, 0, 0, 0, 0, 0,12, 0, 0, 0, 0, 1], // 7  BOOKSHELF + SHOP (4,7) tide + SHOP (10,7) tide
    [ 1, 0,10, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,10, 0, 1], // 8  pillars + bonfire (7,8)  NPC: (4,8) (10,8)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  entry hall
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], //10  DOOR_EXIT (7,10)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //11  perimeter
  ];

  var SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1, y: 7, w: 14, h: 3, cx: 7, cy: 8 },   // Main hall (entry area)
    { x: 5, y: 3, w: 6,  h: 3, cx: 7, cy: 4 }    // Stair chamber (inner room)
  ];

  var BOOKS = [
    { x: 2,  y: 2, bookId: 'tip_bazaar_shopping' },       // How to Buy and Sell
    { x: 13, y: 2, bookId: 'lore_adventuring_economy' },   // Adventuring Economy survey
    { x: 2,  y: 7, bookId: 'fiction_dashing_rogue' }       // The Dashing Rogue (fiction)
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
        stairsDn: { x: 7, y: 4 },   // STAIRS_DN — to Coral Cellars (1.1.1)
        doorExit: { x: 7, y: 10 }   // DOOR_EXIT — back to Promenade
      },
      doorTargets: { '7,10': '1' },  // DOOR_EXIT → The Promenade
      gridW: W,
      gridH: H,
      biome: 'bazaar',
      shops: [
        { x: 4,  y: 7, faction: 'tide' },    // Merchant stall (west)
        { x: 10, y: 7, faction: 'tide' }     // Archivist stall (east)
      ],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('1.1', build);
})();

/**
 * Floor Blockout 2.7 — The Tea House (depth 2, interior social)
 *
 * 16×12 interior. Tide-faction tea house on Lantern Row (Floor 2).
 * Warm social space: tea service behind the counter, seating tables in the
 * commons. Entered from Floor 2 north building row, door at (46,5) on the
 * exterior side.
 *
 * Biome: 'shop' — warm lamplight, lacquered wood, hushed atmosphere.
 *
 * Rooms:
 *   1. Tea room (north)       — SHOP tiles behind BAR_COUNTER, tea master NPC,
 *                               sideboard shelves (BOOKSHELF), TORCH_LIT sconces
 *   2. Commons (middle)       — seating tables, hearth
 *   3. Entry vestibule (south) — pillar-flanked spawn, DOOR_EXIT back to
 *                               Lantern Row
 *
 * Entry clearance:
 *   - Row 9 has pillars flanking the spawn tile at (6,9)/(8,9) to form a
 *     vestibule. This forces door-contracts to land spawn at (7,9) with a
 *     clean forward view north through the corridor neck into the tea room.
 *
 * NPC zones:
 *   - tea_master_vendor at (8,2) — behind counter, Tide faction
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  10=PILLAR  12=SHOP
 *   25=BOOKSHELF  26=BAR_COUNTER  28=TABLE  30=TORCH_LIT
 */
(function () {
  'use strict';

  var W = 16;
  var H = 12;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0, 0,30, 0, 0, 0, 0, 0, 0,30, 0, 0,25, 1], // 1  sideboard shelves + torches
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 2  tea master NPC at (8,2)
    [ 1, 0, 0,26,26,26,26,26,26,26,26,26,26, 0, 0, 1], // 3  BAR_COUNTER tea service
    [ 1, 0, 0,12,12,12,12,12,12,12,12,12,12, 0, 0, 1], // 4  SHOP tiles (face N to order)
    [ 1, 0, 0, 0,28,28, 0, 0, 0, 0,28,28, 0, 0, 0, 1], // 5  commons seating tables
    [ 1, 0,25, 0,28,28, 0, 0, 0, 0,28,28, 0,25, 0, 1], // 6  commons seating tables
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 7  corridor neck
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 8  vestibule neck
    [ 1, 1, 1, 1, 1, 0,10, 0,10, 0, 0, 1, 1, 1, 1, 1], // 9  vestibule pillars flank spawn (7,9)
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], //10  DOOR_EXIT (7,10)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //11  south wall
  ];

  var SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1, y: 1, w: 14, h: 4, cx: 8, cy: 3 },  // Tea room (north)
    { x: 1, y: 5, w: 14, h: 2, cx: 8, cy: 6 },  // Commons (middle)
    { x: 5, y: 8, w: 6,  h: 2, cx: 7, cy: 9 }   // Entry vestibule (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1, bookId: 'tip_home_schedule' },            // Sideboard — rest & ritual
    { x: 14, y: 1, bookId: 'notice_restock_schedule' },      // Sideboard — tea imports
    { x: 2,  y: 6, bookId: 'lore_hero_arrival' },            // Commons — hero's arrival
    { x: 13, y: 6, bookId: 'lore_adventuring_economy' }      // Commons — trade talk
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
        doorExit: { x: 7, y: 10 }   // DOOR_EXIT — back to Lantern Row
      },
      doorTargets: { '7,10': '2' },  // DOOR_EXIT → Lantern Row (Floor 2)
      gridW: W,
      gridH: H,
      biome: 'shop',
      spawn: SPAWN,
      shops: [
        { x: 5,  y: 4, faction: 'tide' },
        { x: 8,  y: 4, faction: 'tide' },
        { x: 11, y: 4, faction: 'tide' }
      ],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('2.7', build);
})();

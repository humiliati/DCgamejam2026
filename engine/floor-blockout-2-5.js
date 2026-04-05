/**
 * Floor Blockout 2.5 — The Apothecary (depth 2, interior shop)
 *
 * 16×12 interior. Tide-faction herbalist on Lantern Row (Floor 2).
 * Sells tinctures, salves, poultices, and dried herbs. Entered from Floor 2
 * north building row, door at (34,5) on the exterior side.
 *
 * Biome: 'shop' — warm lamplight, glass bottles, stone floor.
 *
 * Rooms:
 *   1. Shop floor (north)   — SHOP tiles behind BAR_COUNTER, apothecary NPC,
 *                               herb shelves (BOOKSHELF), TORCH_LIT ambience
 *   2. Entry vestibule (south) — pillar-flanked spawn, DOOR_EXIT back to
 *                               Lantern Row
 *
 * Entry clearance:
 *   - Row 9 has pillars flanking the spawn tile at (6,9)/(8,9) to form a
 *     vestibule. This forces door-contracts to land spawn at (7,9) with a
 *     clean forward view north through the corridor neck into the shop.
 *
 * NPC zones:
 *   - apothecary_vendor at (8,2) — behind counter, Tide faction
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  10=PILLAR  12=SHOP
 *   25=BOOKSHELF  26=BAR_COUNTER  30=TORCH_LIT
 */
(function () {
  'use strict';

  var W = 16;
  var H = 12;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0,30, 0, 0, 0, 0, 0, 0, 0, 0,30, 0,25, 1], // 1  herb shelves + torches
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 2  apothecary NPC at (8,2)
    [ 1, 0, 0,26,26,26,26,26,26,26,26,26,26, 0, 0, 1], // 3  BAR_COUNTER display case
    [ 1, 0, 0,12,12,12,12,12,12,12,12,12,12, 0, 0, 1], // 4  SHOP tiles (face N to browse)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  customer floor
    [ 1, 0,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,25, 0, 1], // 6  side shelves (tincture stock)
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 7  corridor neck
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 8  vestibule neck
    [ 1, 1, 1, 1, 1, 0,10, 0,10, 0, 0, 1, 1, 1, 1, 1], // 9  vestibule pillars flank spawn (7,9)
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], //10  DOOR_EXIT (7,10)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //11  south wall
  ];

  var SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1, y: 1, w: 14, h: 6, cx: 8, cy: 4 },  // Shop floor (north)
    { x: 5, y: 8, w: 6,  h: 2, cx: 7, cy: 9 }   // Entry vestibule (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1, bookId: 'tip_equipment_care' },           // Herb shelf — preparation tips
    { x: 14, y: 1, bookId: 'notice_restock_schedule' },      // Herb shelf — supply notice
    { x: 2,  y: 6, bookId: 'lore_adventuring_economy' },     // Tincture stock — trade lore
    { x: 13, y: 6, bookId: 'tip_home_schedule' }             // Tincture stock — daily habits
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

  FloorManager.registerFloorBuilder('2.5', build);
})();

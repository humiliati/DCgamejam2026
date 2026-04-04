/**
 * Floor Blockout 2.3 — Armorer's Workshop (depth 2, interior shop)
 *
 * 16×12 interior. Foundry-faction shop on Lantern Row (Floor 2).
 * Sells restocking supplies (torches, repair kits) and combat cards.
 * Entered from Floor 2 north building row, door at (22,5).
 *
 * Biome: 'shop' — warm lamplight, display cases, stone floor.
 *
 * Rooms:
 *   1. Shop floor (north)   — SHOP tiles behind BAR_COUNTER, vendor NPC,
 *                               weapon rack (BOOKSHELF), TORCH_LIT ambience
 *   2. Entry hall (south)   — DOOR_EXIT back to Lantern Row
 *
 * Layout:
 *   - North wall: weapon racks (BOOKSHELF) flanking vendor alcove
 *   - Row 3: BAR_COUNTER display case separating vendor from customer
 *   - Row 4: SHOP tiles (walkable — player faces them to browse wares)
 *   - South: entry corridor with pillars and DOOR_EXIT
 *
 * NPC zones:
 *   - armorer_vendor at (8,2) — behind counter, Foundry faction
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
    [ 1,25, 0, 0,30, 0, 0, 0, 0, 0, 0,30, 0, 0,25, 1], // 1  weapon racks + torches
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 2  vendor NPC at (8,2)
    [ 1, 0, 0,26,26,26,26,26,26,26,26,26,26, 0, 0, 1], // 3  BAR_COUNTER display case
    [ 1, 0, 0,12,12,12,12,12,12,12,12,12,12, 0, 0, 1], // 4  SHOP tiles (face N to browse)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  customer floor
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6  open floor
    [ 1,30, 0,25, 0, 0, 0, 0, 0, 0, 0, 0,25, 0,30, 1], // 7  side shelves + torches
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], // 8  corridor neck
    [ 1, 1, 1, 1, 1, 0, 0,10, 0,10, 0, 1, 1, 1, 1, 1], // 9  entry pillars
    [ 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], //10  spawn row
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1]  //11  DOOR_EXIT (7,11)
  ];

  var SPAWN = { x: 7, y: 10, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1,  y: 1, w: 14, h: 7, cx: 8, cy: 4 },  // Shop floor (north)
    { x: 5,  y: 8, w: 6,  h: 3, cx: 7, cy: 10 }  // Entry corridor (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1, bookId: 'tip_equipment_care' },        // Weapon rack — gear maintenance tips
    { x: 14, y: 1, bookId: 'lore_foundry_forging' },       // Weapon rack — Foundry lore
    { x: 3,  y: 7, bookId: 'notice_restock_schedule' },    // Side shelf — vendor restock info
    { x: 12, y: 7, bookId: 'tip_card_synergies' }          // Side shelf — card combo guide
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
        doorExit: { x: 7, y: 11 }   // DOOR_EXIT — back to Lantern Row
      },
      doorTargets: { '7,11': '2' },  // DOOR_EXIT → Lantern Row (Floor 2)
      gridW: W,
      gridH: H,
      biome: 'shop',
      shops: [
        { x: 5,  y: 4, faction: 'foundry' },
        { x: 8,  y: 4, faction: 'foundry' },
        { x: 11, y: 4, faction: 'foundry' }
      ],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('2.3', build);
})();

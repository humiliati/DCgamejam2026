/**
 * Floor Blockout 3.2 — Quartermaster's Shop (depth 2, interior shop)
 *
 * 14×10 interior. Admiralty-faction shop in The Garrison (Floor 3).
 * Tucked into a slum shack in the NE quadrant of the center hub.
 * Sells naval supplies, restocking gear, and occasional combat cards.
 * STAIRS_DN at (9,7) in corridor neck leads to Foundry Stores (3.2.1, proc-gen foundry).
 *
 * Biome: 'shop' — warm lamplight, display cases, stone floor.
 *
 * Rooms:
 *   1. Shop floor (north)   — SHOP tiles, BAR_COUNTER, vendor NPC,
 *                               supply shelves (BOOKSHELF), TORCH_LIT
 *   2. Entry alcove (south) — DOOR_EXIT back to The Garrison
 *
 * NPC zones:
 *   - quartermaster at (7,2) — behind counter, Admiralty faction
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  5=STAIRS_DN  10=PILLAR  12=SHOP
 *   25=BOOKSHELF  26=BAR_COUNTER  30=TORCH_LIT
 */
(function () {
  'use strict';

  var W = 14;
  var H = 10;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0,30, 0, 0, 0, 0, 0, 0,30, 0,25, 1], // 1  supply shelves + torches
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 2  vendor NPC at (7,2)
    [ 1, 0,26,26,26,26,26,26,26,26,26,26, 0, 1], // 3  BAR_COUNTER display case
    [ 1, 0,12,12,12,12,12,12,12,12,12,12, 0, 1], // 4  SHOP tiles (face N to browse)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  customer floor
    [ 1,30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,30, 1], // 6  torches
    [ 1, 1, 1, 1, 0, 0,10, 0,10, 5, 0, 1, 1, 1], // 7  corridor neck + pillars + STAIRS_DN(9,7)
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1], // 8  spawn row
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1]  // 9  DOOR_EXIT (7,9) — aligned with spawn between pillars
  ];

  var SPAWN = { x: 7, y: 8, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1,  y: 1, w: 12, h: 6, cx: 7, cy: 4 },  // Shop floor (north)
    { x: 4,  y: 7, w: 7,  h: 2, cx: 7, cy: 8 }   // Entry alcove (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1, bookId: 'manual_admiralty_handbook' },   // Supply shelf — admiralty manual
    { x: 12, y: 1, bookId: 'lore_garrison_trade_routes' }   // Supply shelf — trade route lore
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
        stairsDn: { x: 9, y: 7 },    // STAIRS_DN — to Foundry Stores (3.2.1)
        doorExit: { x: 7, y: 9 }   // DOOR_EXIT — back to The Garrison
      },
      doorTargets: { '7,9': '3' },  // DOOR_EXIT → The Garrison (Floor 3)
      gridW: W,
      gridH: H,
      biome: 'shop',
      shops: [
        { x: 4,  y: 4, faction: 'admiralty' },
        { x: 7,  y: 4, faction: 'admiralty' },
        { x: 10, y: 4, faction: 'admiralty' }
      ],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('3.2', build);
})();

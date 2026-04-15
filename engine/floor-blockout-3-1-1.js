/**
 * Floor Blockout 3.1.1 — Sealab Depths (depth 3, nested dungeon)
 *
 * 20×20 submarine-base dungeon beneath the Armory (3.1). Retrofuturistic
 * undersea bunker: iron bulkheads, ribbed pressure tunnels, ocean-view
 * portholes, and a cluster of sub-pillar colonnades. Entered from 3.1
 * via STAIRS_UP at (10, 2) — player descends from Armory stair alcove
 * (8,3) and arrives at the north airlock, facing south into the base.
 *
 * Biome: 'sealab' — concrete/iron walls, DARKNESS fog, ocean skybox
 * bleeds through PORTHOLE_OCEAN cells.
 *
 * Rooms:
 *   1. North airlock      (rows 1–4) — arrival chamber, PILLARs + BONFIRE
 *   2. Porthole gallery   (rows 6–9) — ocean-view hall w/ PILLAR_QUAD
 *   3. Ribbed pressure    (rows 10–13) — narrow TUNNEL_RIB corridor
 *   4. Terminal chamber   (rows 14–18) — TUNNEL_WALL alcoves + supplies
 *
 * Showcased tiles (for visual regression + dungeon flavor):
 *   94 TUNNEL_RIB     walkable ribbed freeform (rows 10–13)
 *   95 TUNNEL_WALL    recessed alcove face (row 15, 17 flanks)
 *   96 PORTHOLE_OCEAN ocean-view windows (rows 6, 8, 14)
 *   88 PILLAR_QUAD    2×2 sub-pillar cluster (row 7)
 *
 * Door wiring:
 *   STAIRS_UP (10, 2) → '3.1' (Armory) — returns to stair alcove
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  6=STAIRS_UP  10=PILLAR  18=BONFIRE
 *   25=BOOKSHELF  28=TABLE  88=PILLAR_QUAD  94=TUNNEL_RIB
 *   95=TUNNEL_WALL  96=PORTHOLE_OCEAN
 */
(function () {
  'use strict';

  var W = 20;
  var H = 20;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 1  airlock open
    [ 1, 1, 1, 1, 0,25, 0, 0, 0, 0, 6, 0, 0, 0, 0,25, 1, 1, 1, 1], // 2  STAIRS_UP (10,2) + bookshelves
    [ 1, 1, 1, 1, 0, 0, 0,10, 0, 0, 0, 0,10, 0, 0, 0, 1, 1, 1, 1], // 3  single pillars
    [ 1, 1, 1, 1, 0, 0, 0, 0, 0,18, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // 4  bonfire (overheal)
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 5  neck
    [ 1, 1, 1, 1,96, 1, 1, 0, 0, 0, 0, 0, 1, 1,96, 1, 1, 1, 1, 1], // 6  portholes L+R
    [ 1, 1, 1, 1, 1, 1, 1, 0,88, 0,88, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 7  PILLAR_QUAD pair
    [ 1, 1, 1, 1,96, 1, 1, 0, 0, 0, 0, 0, 1, 1,96, 1, 1, 1, 1, 1], // 8  portholes L+R
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 9  gallery exit
    [ 1, 1, 1, 1, 1, 1, 1, 1,94,94,94, 1, 1, 1, 1, 1, 1, 1, 1, 1], //10  TUNNEL_RIB entry (3-wide)
    [ 1, 1, 1, 1, 1, 1, 1, 1,94, 0,94, 1, 1, 1, 1, 1, 1, 1, 1, 1], //11  ribbed walkway sides
    [ 1, 1, 1, 1, 1, 1, 1, 1,94, 0,94, 1, 1, 1, 1, 1, 1, 1, 1, 1], //12
    [ 1, 1, 1, 1, 1, 1, 1, 1,94,94,94, 1, 1, 1, 1, 1, 1, 1, 1, 1], //13  RIB exit
    [ 1, 1,96, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1,96, 1, 1, 1], //14  edge portholes
    [ 1, 1, 1, 1,95,95,95, 1, 0, 0, 0, 1,95,95,95, 1, 1, 1, 1, 1], //15  alcove top row
    [ 1, 1, 1, 1,95, 0, 0, 0, 0,28, 0, 0, 0, 0,95, 1, 1, 1, 1, 1], //16  terminal chamber + TABLE
    [ 1, 1, 1, 1,95,95,95, 1, 0, 0, 0, 1,95,95,95, 1, 1, 1, 1, 1], //17  alcove bottom row
    [ 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1], //18  south nook
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //19
  ];

  var SPAWN = { x: 10, y: 3, dir: 1 }; // facing SOUTH, one tile below STAIRS_UP

  var ROOMS = [
    { x: 4,  y: 1,  w: 12, h: 4, cx: 10, cy: 2  }, // North airlock
    { x: 7,  y: 6,  w: 5,  h: 4, cx: 9,  cy: 7  }, // Porthole gallery
    { x: 8,  y: 10, w: 3,  h: 4, cx: 9,  cy: 11 }, // Ribbed tunnel
    { x: 5,  y: 15, w: 10, h: 4, cx: 9,  cy: 16 }  // Terminal chamber
  ];

  var BOOKS = [
    { x: 5,  y: 2, bookId: 'lore_ironhold_depths' },     // airlock supply
    { x: 15, y: 2, bookId: 'notice_ironhold_expedition' } // airlock log
  ];

  function build() {
    var grid = [];
    for (var y = 0; y < H; y++) {
      grid[y] = GRID[y].slice();
    }
    return {
      grid: grid,
      spawn: { x: SPAWN.x, y: SPAWN.y, dir: SPAWN.dir },
      rooms: ROOMS.slice(),
      doors: {
        stairsUp: { x: 10, y: 2 },
        stairsDn: null,
        doorExit: null
      },
      doorTargets: { '10,2': '3.1' }, // STAIRS_UP → Armory
      gridW: W,
      gridH: H,
      biome: 'sealab',
      shops: [],
      books: BOOKS.slice()
    };
  }

  if (typeof FloorManager !== 'undefined' &&
      typeof FloorManager.registerFloorBuilder === 'function') {
    FloorManager.registerFloorBuilder('3.1.1', build);
  }
})();

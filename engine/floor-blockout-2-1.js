/**
 * Floor Blockout 2.1 — Dispatcher's Office (depth 2, interior)
 *
 * 16×12 interior. Formal institutional space — the Gleaner employer's
 * field office. Entered from Lantern Row (Floor 2). Clean stone walls,
 * dispatch desk, filing shelves. Mission briefing happens here.
 *
 * Biome: 'office' — clean institutional stone walls, stone floor,
 * neutral grey palette with warm document-amber accents.
 *
 * Rooms:
 *   1. Dispatch room (north) — dispatch desk (TABLE), mission board (BOOKSHELF)
 *   2. Reception (south)     — DOOR_EXIT, waiting bench, pillars
 *
 * Purpose:
 *   - Mission briefing hub (Dispatcher NPC assigns work orders)
 *   - Filing shelf lore (guild charter, work order templates)
 *   - No rest point (deliberate — creates pressure to return to inn/home)
 *
 * NPC zones:
 *   - Dispatcher NPC (DISPATCHER) behind desk — blocks, forces conversation
 *   - Filing clerk (AMBIENT) patrols between shelves
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  10=PILLAR  25=BOOKSHELF  28=TABLE
 */
(function () {
  'use strict';

  var W = 16;
  var H = 12;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,25, 1], // 1  filing shelves (mission records)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 2  dispatch room
    [ 1, 0, 0, 0,10, 0,28,28,28,28, 0,10, 0, 0, 0, 1], // 3  dispatch desk (6-9,3) + pillars
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 4  front of desk (dispatcher stands here)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  open area
    [ 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1], // 6  divider wall with gaps
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 7  reception area
    [ 1, 0,25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,25, 0, 1], // 8  waiting area shelves
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  spawn area
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], //10  DOOR_EXIT (7,10)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //11  south wall
  ];

  var SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH

  var ROOMS = [
    { x: 1, y: 1, w: 14, h: 5, cx: 7, cy: 3 },  // Dispatch room (north)
    { x: 1, y: 7, w: 14, h: 3, cx: 7, cy: 8 }   // Reception (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1,  bookId: 'lore_gleaner_guild_charter' },   // Guild charter
    { x: 14, y: 1,  bookId: 'notice_work_order_template' },    // Work order template
    { x: 2,  y: 8,  bookId: 'tip_dispatch_protocol' },         // Dispatch protocol guide
    { x: 13, y: 8,  bookId: 'lore_hero_arrival' }              // Hero arrival report
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
        doorExit: { x: 7, y: 10 }
      },
      doorTargets: { '7,10': '2' },  // DOOR_EXIT → Lantern Row
      gridW: W,
      gridH: H,
      biome: 'office',
      shops: [],
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('2.1', build);
})();

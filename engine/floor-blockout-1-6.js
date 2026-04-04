/**
 * Floor Blockout 1.6 — Gleaner's Home (depth 2, interior)
 *
 * 24×20 interior. Multi-room Gleaner's dwelling — generous interior
 * space that takes advantage of the "bigger on the inside" rule for
 * depth-2 floors. Entered from The Promenade (Floor 1).
 *
 * Biome: 'home' — warm wood plank walls, amber lamplight, wooden floor.
 *
 * Rooms:
 *   1. Bedroom (west)       — BED pair (bonfire equivalent), nightstand
 *   2. Living room (center) — TABLE pair, HEARTH, bookshelves
 *   3. Storage (east)       — CHEST (stash+keys), mailbox PILLAR, shelves
 *   4. Entry hall (south)   — DOOR_EXIT, hall shelves, pillar pair
 *
 * Special positions:
 *   - BED pair at (2,3)/(3,3) — bonfire equivalent (rest point)
 *   - CHEST at (19,3)         — stash container (work keys)
 *   - TERMINAL at (19,6)      — mail terminal + dispatch feed (§14)
 *   - HEARTH at (11,7)        — living room fireplace
 *
 * DOOR_EXIT at (11,19) leads back to The Promenade (Floor 1).
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  7=CHEST  10=PILLAR
 *   25=BOOKSHELF  27=BED  28=TABLE  29=HEARTH  36=TERMINAL
 */
(function () {
  'use strict';

  var W = 24;
  var H = 20;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1,25, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,25, 0, 1], // 1  bedroom shelf | living room | storage shelf
    [ 1, 0, 0, 0, 0, 0, 1, 0, 0,25, 0, 0, 0, 0,25, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 2  bedroom open  | bookshelves | storage open
    [ 1, 0,27,27, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 7, 0, 0, 0, 1], // 3  BED pair      | living open | CHEST (stash+keys)
    [ 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 4  bedroom open  | living open | storage open
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,28,28, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 5  ←doorway      | TABLE pair  | doorway→
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,36, 0, 0, 0, 1], // 6  bedroom open  | living open | TERMINAL (mail+dispatch)
    [ 1, 0, 0, 0,28, 0, 1, 0, 0, 0, 0,29, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1], // 7  nightstand    | HEARTH(11,7)| storage open
    [ 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,25, 0, 0, 1], // 8  bedroom floor | living open | storage shelf
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], // 9  bedroom wall  | living mid  | storage wall
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0,10, 0, 0,10, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //10               | hall pillars |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //11               | corridor    |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //12               | entry hall  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //13               | entry hall  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //14               | entry hall  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0,25, 0, 0, 0, 0,25, 0, 1, 1, 1, 1, 1, 1, 1, 1], //15               | hall shelves|
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //16               | entry open  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //17               | entry open  |
    [ 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], //18               | spawn row   |
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  //19  DOOR_EXIT(11,19)
  ];

  var SPAWN = { x: 11, y: 18, dir: 3 }; // facing NORTH (toward rooms)

  var ROOMS = [
    { x: 1,  y: 1,  w: 5,  h: 8,  cx: 3,  cy: 4  },  // Bedroom (west)
    { x: 7,  y: 1,  w: 9,  h: 8,  cx: 11, cy: 5  },  // Living room (center)
    { x: 17, y: 1,  w: 6,  h: 8,  cx: 20, cy: 4  },  // Storage (east)
    { x: 7,  y: 10, w: 9,  h: 9,  cx: 11, cy: 14 }   // Entry hall (south)
  ];

  var BOOKS = [
    { x: 1,  y: 1,  bookId: 'journal_personal_day0' },         // Bedroom shelf — personal journal
    { x: 9,  y: 2,  bookId: 'notice_dispatcher_orientation' }, // Living room — dispatcher's orientation
    { x: 14, y: 2,  bookId: 'journal_contract_terms' },        // Living room — employment contract
    { x: 19, y: 6,  bookId: 'term_home_dispatch' },            // TERMINAL — dispatch feed (CRT style)
    { x: 21, y: 1,  bookId: 'notice_landlord_welcome' },       // Storage shelf — landlord's welcome
    { x: 20, y: 8,  bookId: 'journal_operative_brief' },       // Storage shelf — personnel file
    { x: 9,  y: 15, bookId: 'journal_field_notes_day1' },      // Entry hall — dispatcher's log
    { x: 14, y: 15, bookId: 'letter_anonymous_tip' }            // Entry hall — unsigned letter
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
        doorExit: { x: 11, y: 19 }   // DOOR_EXIT — back to The Promenade
      },
      doorTargets: { '11,19': '1' },  // DOOR_EXIT → The Promenade
      gridW: W,
      gridH: H,
      biome: 'home',
      shops: [],
      mailboxHistory: { x: 19, y: 6 },  // TERMINAL in storage — mail history + dispatch feed (§14)
      books: BOOKS.slice()
    };
  }

  FloorManager.registerFloorBuilder('1.6', build);
})();

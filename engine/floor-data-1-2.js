var FloorData12 = (function() { 'use strict';

  // ── Hand-authored Floor 1.2: Driftwood Inn (depth 2) ──────────────
  //
  // 16×12 interior. An old seaside inn with warm wood paneling and dim
  // lanterns. Features a main tavern room (large, open), back kitchen/
  // storage (smaller), and upstairs balcony hallway (narrow).
  //
  // Entry from The Promenade via DOOR_EXIT at (7,10).
  // BONFIRE (hearth) at (7,4) — rest point.
  // BAR_COUNTER (tile 26) at (3,3) and (4,3) — stat boost.
  // BOOKSHELF (tile 25) at (12,2) — lore book.
  // TABLE (tile 28) at (9,4) and (10,4) — decoration.
  // BED (tile 27) at (2,7) and (3,7) — rest alternative.
  // PILLAR (tile 10) at (5,5) and (10,5) — support columns.
  //
  // Tile legend:
  //   0=EMPTY  1=WALL  4=DOOR_EXIT  10=PILLAR  18=BONFIRE
  //  25=BOOKSHELF  26=BAR_COUNTER  27=BED  28=TABLE

  var _FLOOR12_W = 16;
  var _FLOOR12_H = 12;
  // prettier-ignore
  var _FLOOR12_GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // 0  north wall
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 1  bar/dining area
    [ 1, 0,25, 0, 1, 0, 0, 0, 0, 0, 0, 0,25, 0, 0, 1], // 2  BOOKSHELF (2,2) | partition | BOOKSHELF (12,2)
    [ 1, 0,26,26, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 3  BAR_COUNTER (2,3)(3,3) | kitchen/storage
    [ 1, 0, 0, 0, 1, 0, 0,18, 0, 0, 0, 0, 0, 0, 0, 1], // 4  dining area | BONFIRE(7,4) | storage
    [ 1, 0,10, 0, 1, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 1], // 5  PILLAR(2,5) | inner wall | PILLAR(9,5)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 6  hallway connecting
    [ 1, 0,27,27, 0, 0, 0, 0, 0,28,28, 0, 0, 0, 0, 1], // 7  BED(2,7)(3,7) | balcony | TABLE(9,7)(10,7)
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 8  balcony hallway
    [ 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 9  entry area (spawn)
    [ 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1], // 10 DOOR_EXIT (7,10)
    [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // 11 south wall
  ];

  var _FLOOR12_SPAWN = { x: 7, y: 9, dir: 3 }; // facing NORTH
  var _FLOOR12_ROOMS = [
    // Main tavern room (large, open)
    { x: 1, y: 1, w: 3, h: 6, cx: 2, cy: 3 },
    // Dining/bar area (center)
    { x: 1, y: 3, w: 14, h: 5, cx: 7, cy: 6 },
    // Kitchen/storage (east side)
    { x: 5, y: 3, w: 10, h: 2, cx: 10, cy: 4 },
    // Balcony hallway (narrow upstairs)
    { x: 1, y: 7, w: 14, h: 2, cx: 7, cy: 8 }
  ];

  function _buildFloor12() {
    var grid = [];
    for (var y = 0; y < _FLOOR12_H; y++) {
      grid[y] = _FLOOR12_GRID[y].slice();
    }
    return {
      grid: grid,
      rooms: _FLOOR12_ROOMS.slice(),
      doors: {
        stairsUp: null,            // Exit is via DOOR_EXIT, not stairs
        stairsDn: null,            // No dungeon from the inn
        doorExit: { x: 7, y: 10 }  // DOOR_EXIT — back to The Promenade (depth 2→1)
      },
      doorTargets: {},  // DOOR_EXIT follows convention → parent "1"
      gridW: _FLOOR12_W,
      gridH: _FLOOR12_H,
      biome: 'inn',
      shops: [],
      books: [
        { x: 12, y: 2, bookId: 'lore_driftwood_history' }  // Balcony shelf — inn's coastal past
      ]
    };
  }

  return { build: _buildFloor12 };
})();

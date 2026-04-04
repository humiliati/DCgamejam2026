/**
 * Floor Blockout 2 — Lantern Row (depth 1, exterior)
 *
 * 50×36 exterior. High-density waterfront commercial boardwalk — the Balmora
 * moment. Reached via east gate of The Promenade (Floor 1).
 *
 * Biome: 'lantern' — warm amber atmosphere, boardwalk-over-water south half.
 *
 * Layout (from FLOOR2_BLOCKOUT_PREP.md):
 *   North half (rows 0–14): civilization layer
 *     - Row 0: tree border
 *     - Row 1: shrub backing
 *     - Rows 2–5: 7 north building facades (2.1–2.7), doors face south
 *     - Row 6: shrub strip south of buildings
 *     - Rows 7–9: grass buffer
 *     - Row 10: pillar/lantern arcade
 *     - Row 11: path shoulder N
 *     - Rows 12–13: E-W ROAD spine (2 wide) + west/east gates
 *     - Row 14: path shoulder S
 *   South half (rows 15–35): boardwalk-over-water layer
 *     - Row 15: FENCE spine (main E-W railing) with access gaps
 *     - Rows 16–20: 5 fenced boardwalk appendages over WATER
 *     - Rows 21–34: open WATER (no floor tile — waterColor renders)
 *     - Row 35: tree border S
 *
 * Buildings (north row only — south is boardwalk):
 *   2.1 Dispatcher (cols 5–10)  2.2 Watchman (cols 12–17)
 *   2.3 Armorer (cols 20–24)    2.4 Chandler (cols 26–30)
 *   2.5 Apothecary (cols 32–36) 2.6 Cartographer (cols 38–42)
 *   2.7 Tea House (cols 44–48)
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  2=DOOR  4=DOOR_EXIT  9=WATER  10=PILLAR
 *   18=BONFIRE  21=TREE  22=SHRUB  32=ROAD  33=PATH  34=GRASS  35=FENCE
 */
(function () {
  'use strict';

  var W = 50;
  var H = 36;

  // Tile aliases
  var _ = 0;   // EMPTY
  var W1 = 1;  // WALL
  var DR = 2;  // DOOR
  var DX = 4;  // DOOR_EXIT
  var WA = 9;  // WATER
  var PL = 10; // PILLAR
  var BF = 18; // BONFIRE
  var TR = 21; // TREE
  var SB = 22; // SHRUB
  var RD = 32; // ROAD
  var PT = 33; // PATH (also boardwalk walkable surface — biome maps to floor_boardwalk)
  var GR = 34; // GRASS
  var FN = 35; // FENCE

  // ── Grid builder helpers ──

  function makeRow(fill) { var r = []; for (var i = 0; i < W; i++) r[i] = fill; return r; }
  function fillRange(row, x0, x1, tile) { for (var x = x0; x <= x1; x++) row[x] = tile; }

  /**
   * Place a rectangular building. Walls on perimeter, EMPTY interior.
   * Door on the south face at doorX.
   */
  function placeBuilding(grid, x0, x1, y0, y1, doorX) {
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (y === y0 || y === y1 || x === x0 || x === x1) {
          grid[y][x] = W1; // perimeter wall
        } else {
          grid[y][x] = _; // interior
        }
      }
    }
    // Door on south face
    grid[y1][doorX] = DR;
  }

  /**
   * Place a fenced boardwalk appendage (finger over water).
   * Fence perimeter, PATH interior, WATER everywhere else is untouched.
   */
  function placeAppendage(grid, x0, x1, y0, y1) {
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (y === y1 || x === x0 || x === x1) {
          grid[y][x] = FN; // fence perimeter (bottom + sides)
        } else {
          grid[y][x] = PT; // walkable boardwalk planks
        }
      }
    }
    // Top row: fence sides only, interior is PATH (open to spine above)
    for (var x2 = x0 + 1; x2 < x1; x2++) {
      grid[y0][x2] = PT;
    }
    grid[y0][x0] = FN;
    grid[y0][x1] = FN;
  }

  // ── Build the grid ──

  function buildGrid() {
    var grid = [];
    var y, x;

    // ── Initialize: rows 0–14 = EMPTY, rows 15–20 = WATER, rows 21–35 = WATER ──
    for (y = 0; y < H; y++) {
      grid[y] = makeRow(y >= 15 ? WA : _);
    }

    // ── Row 0: north tree border ──
    grid[0] = makeRow(TR);

    // ── Row 35: south tree border ──
    grid[35] = makeRow(TR);

    // ── West/east tree borders (all rows) ──
    for (y = 0; y < H; y++) {
      grid[y][0] = TR;
      grid[y][W - 1] = TR;
    }

    // ── Row 1: shrub backing behind buildings ──
    fillRange(grid[1], 1, W - 2, SB);

    // ── Rows 2–5: building facades ──
    // Fill base with shrub (green accents between buildings)
    for (y = 2; y <= 5; y++) fillRange(grid[y], 1, W - 2, SB);

    // Place 7 buildings (rows 2–5, doors on row 5 facing south toward road)
    //                      x0  x1  y0 y1  doorX
    placeBuilding(grid,      5, 10,  2, 5,   7);  // 2.1 Dispatcher
    placeBuilding(grid,     12, 17,  2, 5,  14);  // 2.2 Watchman
    placeBuilding(grid,     20, 24,  2, 5,  22);  // 2.3 Armorer
    placeBuilding(grid,     26, 30,  2, 5,  28);  // 2.4 Chandler
    placeBuilding(grid,     32, 36,  2, 5,  34);  // 2.5 Apothecary
    placeBuilding(grid,     38, 42,  2, 5,  40);  // 2.6 Cartographer
    placeBuilding(grid,     44, 48,  2, 5,  46);  // 2.7 Tea House

    // Tree accent cluster at center midpoint between buildings
    grid[2][18] = TR; grid[2][19] = TR;
    grid[3][18] = TR; grid[3][19] = TR;

    // ── Row 6: shrub strip south of buildings ──
    fillRange(grid[6], 1, W - 2, SB);

    // ── Rows 7–9: grass buffer ──
    for (y = 7; y <= 9; y++) fillRange(grid[y], 1, W - 2, GR);

    // ── Row 10: pillar/lantern arcade ──
    // Grass base with pillar pairs at intervals
    fillRange(grid[10], 1, W - 2, GR);
    var pillarCols = [1, 2, 13, 14, 23, 24, 33, 34, 43, 44, 47, 48];
    for (var p = 0; p < pillarCols.length; p++) grid[10][pillarCols[p]] = PL;

    // ── Row 11: path shoulder north ──
    fillRange(grid[11], 1, W - 2, PT);

    // ── Rows 12–13: ROAD spine + gates ──
    for (y = 12; y <= 13; y++) {
      fillRange(grid[y], 1, W - 2, RD);
      grid[y][0] = DX;       // west gate → Floor 1
      grid[y][W - 1] = DR;   // east gate → Floor 3
    }

    // ── Row 14: path shoulder south ──
    fillRange(grid[14], 1, W - 2, PT);

    // ── Row 15: main boardwalk FENCE spine with access gaps ──
    // Start as all FENCE, then punch PATH gaps at appendage entrances
    fillRange(grid[15], 1, W - 2, FN);
    // Gap positions (2-tile wide) aligned with each appendage center
    var gapCols = [
      [5, 6],     // appendage 1 entrance
      [14, 15],   // appendage 2 entrance
      [22, 23],   // appendage 3 entrance
      [32, 35],   // central platform entrance (wider, 4 tiles)
      [43, 44]    // appendage 5 entrance
    ];
    for (var g = 0; g < gapCols.length; g++) {
      fillRange(grid[15], gapCols[g][0], gapCols[g][1], PT);
    }

    // ── Rows 16–20: boardwalk appendages over water ──
    // (Grid was initialized as WATER for rows 15+, appendages overwrite)
    //                       x0  x1  y0  y1
    placeAppendage(grid,      2,  8, 16, 19);  // appendage 1 (narrow finger)
    placeAppendage(grid,     11, 17, 16, 19);  // appendage 2 (narrow finger)
    placeAppendage(grid,     20, 26, 16, 19);  // appendage 3 (narrow finger)
    placeAppendage(grid,     29, 38, 16, 20);  // appendage 4 (central platform, deeper)
    placeAppendage(grid,     41, 47, 16, 19);  // appendage 5 (eastern finger)

    // ── Bonfire on central platform ──
    grid[17][33] = BF;  // bonfire at (33, 17) — central appendage gathering point

    // ── Rows 21–34: open water (already initialized as WATER) ──
    // No changes needed — waterColor from spatial contract renders here.

    return grid;
  }

  // ── Spawn + metadata ──

  var SPAWN = { x: 4, y: 12, dir: 1 }; // facing EAST, on west road approach

  var ROOMS = [
    // North building corridor
    { x: 2, y: 1, w: 46, h: 6, cx: 25, cy: 4 },
    // Road corridor (grass buffer + road + path shoulders)
    { x: 2, y: 7, w: 46, h: 8, cx: 25, cy: 12 },
    // Boardwalk zone (spine + appendages)
    { x: 2, y: 15, w: 46, h: 6, cx: 25, cy: 17 }
  ];

  function build() {
    var grid = buildGrid();
    return {
      grid: grid,
      rooms: ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorExit: { x: 0, y: 12 }  // Primary exit back to Floor 1
      },
      doorTargets: {
        // ── West gates (back to Floor 1) ──
        '0,12': '1',
        '0,13': '1',
        // ── East gates (forward to Floor 3) ──
        '49,12': '3',
        '49,13': '3',
        // ── North building doors (face south, row 5) ──
        '7,5':  '2.1',   // Dispatcher's Office
        '14,5': '2.2',   // Watchman's Post
        '22,5': '2.3',   // Armorer
        '28,5': '2.4',   // Chandler
        '34,5': '2.5',   // Apothecary
        '40,5': '2.6',   // Cartographer
        '46,5': '2.7'    // Tea House
      },
      gridW: W,
      gridH: H,
      biome: 'lantern',
      spawn: SPAWN,
      shops: [
        // Market stalls along N path shoulder (stationary vendor positions)
        { x: 8,  y: 11, faction: 'tide' },
        { x: 15, y: 11, faction: 'foundry' },
        { x: 23, y: 11, faction: 'admiralty' },
        { x: 29, y: 11, faction: 'tide' },
        { x: 35, y: 11, faction: 'foundry' },
        { x: 41, y: 11, faction: 'admiralty' },
        { x: 46, y: 11, faction: 'tide' }
      ]
    };
  }

  FloorManager.registerFloorBuilder('2', build);
})();

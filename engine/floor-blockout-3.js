/**
 * Floor Blockout 3 — The Garrison (depth 1, exterior)
 *
 * 52×52 exterior. Crosshair-shaped militarized port district.
 * Arrived from Floor 2's east gate (Lantern Row). Player enters from the west.
 *
 * Biome: 'frontier' — cool indigo dusk, Vivec city parallax east.
 *
 * Layout (crosshair, from FLOOR3_BLOCKOUT.md):
 *
 *   CENTER (rows 18–33, cols 18–33): Guard tower + retrofuturistic slum ring
 *     - Tower: 6×6 WALL box at (23–28, 23–28) with PILLAR corners
 *     - Slum: scattered WALL shack clusters in surrounding ring
 *     - NPC density: slum dwellers loitering around shacks
 *
 *   WEST ARM (rows 22–29, cols 0–17): Entry from Floor 2
 *     - DOOR_EXIT at (0, 25)/(0, 26) → Floor 2
 *     - PATH corridor through trees, NPC near gate
 *
 *   EAST ARM (rows 19–32, cols 34–51): Highway to Vivec
 *     - 4-wide ROAD highway (rows 23–26)
 *     - Boardwalk strip below (rows 28–29, PATH + FENCE)
 *     - WATER below fence (rows 30–31)
 *     - Grand Arch facade at east end, DOOR at (51, 25) → Floor 4
 *     - NPC on highway approach
 *
 *   NORTH ARM (rows 0–17, cols 18–33): Forest west / Water east split
 *     - West half (cols 18–25): TREE + SHRUB cozy forest, bonfire, shop
 *     - East half (cols 26–33): WATER + boardwalk (PATH) edge
 *     - North facade with DOOR at (~25, 1) → Floor 3.1 (Armory/Barracks)
 *     - NPC in forest clearing
 *
 *   SOUTH ARM (rows 34–51, cols 22–29): Boardwalk pier dead-end
 *     - Narrow fenced boardwalk (6 wide) over WATER
 *     - Crates (BREAKABLE) at terminus
 *     - Fisherman NPCs at end (emotional dead-end, memory space)
 *     - NPC on boardwalk approach
 *
 * Grid: 52 wide × 52 tall
 */
(function () {
  'use strict';

  var W = 52;
  var H = 52;

  // Tile aliases
  var _ = 0;   // EMPTY
  var W1 = 1;  // WALL
  var DR = 2;  // DOOR
  var DX = 4;  // DOOR_EXIT
  var WA = 9;  // WATER
  var PL = 10; // PILLAR
  var BK = 11; // BREAKABLE (crates)
  var BF = 18; // BONFIRE
  var TR = 21; // TREE
  var SB = 22; // SHRUB
  var RD = 32; // ROAD
  var PT = 33; // PATH
  var GR = 34; // GRASS
  var FN = 35; // FENCE

  // ── Helpers ──

  function makeRow(fill) { var r = []; for (var i = 0; i < W; i++) r[i] = fill; return r; }
  function fillRange(row, x0, x1, tile) { for (var x = x0; x <= x1; x++) row[x] = tile; }
  function fillRect(grid, x0, y0, x1, y1, tile) {
    for (var y = y0; y <= y1; y++) fillRange(grid[y], x0, x1, tile);
  }
  function fillBorder(grid, x0, y0, x1, y1, tile) {
    for (var x = x0; x <= x1; x++) { grid[y0][x] = tile; grid[y1][x] = tile; }
    for (var y = y0; y <= y1; y++) { grid[y][x0] = tile; grid[y][x1] = tile; }
  }

  // Place a WALL box with interior EMPTY, optional PILLAR corners
  function placeBox(grid, x0, y0, x1, y1, pillars) {
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        if (y === y0 || y === y1 || x === x0 || x === x1) {
          grid[y][x] = W1;
        } else {
          grid[y][x] = _;
        }
      }
    }
    if (pillars) {
      grid[y0][x0] = PL; grid[y0][x1] = PL;
      grid[y1][x0] = PL; grid[y1][x1] = PL;
    }
  }

  // Place a small shack (2×3 or 3×2 WALL cluster)
  function placeShack(grid, x, y, w, h) {
    for (var dy = 0; dy < h; dy++) {
      for (var dx = 0; dx < w; dx++) {
        if (y + dy >= 0 && y + dy < H && x + dx >= 0 && x + dx < W) {
          grid[y + dy][x + dx] = W1;
        }
      }
    }
  }

  // ── Build the grid ──

  function buildGrid() {
    var grid = [];
    var y;

    // Initialize: TREE everywhere (the negative-space corners are dense forest)
    for (y = 0; y < H; y++) grid[y] = makeRow(TR);

    // ── Coastal water fills (painted FIRST — arms overwrite on top) ──
    // SE corner: coastline extending south and east
    fillRect(grid, 30, 35, 50, 50, WA);
    // NE corner: coastline from north arm water side
    fillRect(grid, 34, 1, 50, 17, WA);

    // ═══════════════════════════════════════════════════════════
    //  CENTER HUB — rows 18–33, cols 18–33 (16×16)
    //  Guard tower + slum ring
    // ═══════════════════════════════════════════════════════════

    // Clear center to PATH (gritty dirt/worn planks)
    fillRect(grid, 18, 18, 33, 33, PT);

    // Shrub border around center (just inside the tree fill)
    fillBorder(grid, 18, 18, 33, 33, SB);

    // Guard Tower — 6×6 WALL box with PILLAR corners, dead center
    placeBox(grid, 23, 23, 28, 28, true);

    // Slum shacks — scattered irregular clusters around tower
    // NW quadrant
    placeShack(grid, 19, 19, 3, 2);
    placeShack(grid, 19, 22, 2, 3);
    // NE quadrant — first shack is the Quartermaster's Shop (3.2)
    placeShack(grid, 30, 19, 3, 2);
    grid[20][31] = 2;  // DOOR south face → Floor 3.2 (Quartermaster's Shop)
    placeShack(grid, 31, 22, 2, 2);
    // SW quadrant
    placeShack(grid, 19, 30, 3, 2);
    placeShack(grid, 20, 32, 2, 2);
    // SE quadrant
    placeShack(grid, 30, 30, 2, 3);
    placeShack(grid, 29, 32, 3, 2);

    // Open path corridors from each arm into center (cut through shrub border)
    // West entrance (cols 18, rows 24–27)
    for (y = 24; y <= 27; y++) grid[y][18] = PT;
    // East entrance (col 33, rows 24–27)
    for (y = 24; y <= 27; y++) grid[y][33] = PT;
    // North entrance (row 18, cols 23–28) — widened for comfortable access
    fillRange(grid[18], 23, 28, PT);
    // South entrance (row 33, cols 24–27)
    fillRange(grid[33], 24, 27, PT);

    // ═══════════════════════════════════════════════════════════
    //  WEST ARM — rows 22–29, cols 0–17
    //  Entry corridor from Floor 2
    // ═══════════════════════════════════════════════════════════

    // Clear corridor
    fillRect(grid, 1, 23, 17, 28, PT);

    // Tree border top and bottom of corridor
    fillRange(grid[22], 1, 17, SB);
    fillRange(grid[29], 1, 17, SB);

    // Gate tiles at western edge
    grid[25][0] = DX;  // DOOR_EXIT → Floor 2
    grid[26][0] = DX;
    // Wall flanks around gate
    grid[24][0] = W1;
    grid[27][0] = W1;
    grid[23][0] = TR;
    grid[28][0] = TR;
    // Open the path from gate into corridor
    grid[25][1] = PT;
    grid[26][1] = PT;

    // Grass accents along corridor
    grid[23][4] = GR; grid[23][8] = GR; grid[23][13] = GR;
    grid[28][6] = GR; grid[28][10] = GR; grid[28][15] = GR;

    // ═══════════════════════════════════════════════════════════
    //  EAST ARM — rows 19–32, cols 34–51
    //  Highway + boardwalk to Vivec (grand arch → Floor 4)
    // ═══════════════════════════════════════════════════════════

    // Clear the full arm area
    fillRect(grid, 34, 20, 50, 31, _);

    // Tree border top and bottom
    fillRange(grid[19], 34, 50, SB);
    fillRange(grid[32], 34, 50, SB);
    // East tree border
    for (y = 19; y <= 32; y++) grid[y][51] = TR;

    // Highway — 4-wide ROAD, rows 23–26
    fillRect(grid, 34, 23, 50, 26, RD);

    // Path shoulders above and below highway
    fillRect(grid, 34, 21, 50, 22, PT);
    fillRect(grid, 34, 27, 50, 27, PT);

    // Boardwalk strip below highway (rows 28–29)
    fillRect(grid, 34, 28, 50, 29, PT);

    // Fence railing south edge of boardwalk (row 30)
    fillRange(grid[30], 34, 50, FN);

    // Water below fence (row 31)
    fillRange(grid[31], 34, 50, WA);

    // Grass fill above highway
    fillRange(grid[20], 34, 50, GR);

    // Grand Arch facade at east end
    // Arch structure: WALL facade rows 22–29 at cols 49–50
    fillRect(grid, 49, 22, 50, 29, W1);
    // Arch opening: DOOR at (51, 25)/(51, 26) → Floor 4
    grid[25][51] = DR;
    grid[26][51] = DR;
    // Clear arch passage
    grid[25][49] = _; grid[25][50] = _;
    grid[26][49] = _; grid[26][50] = _;
    // Pillar accents on arch
    grid[22][49] = PL; grid[22][50] = PL;
    grid[29][49] = PL; grid[29][50] = PL;

    // ═══════════════════════════════════════════════════════════
    //  NORTH ARM — rows 0–17, cols 18–33
    //  Split: cozy forest (west) / water+boardwalk (east)
    // ═══════════════════════════════════════════════════════════

    // West half (cols 18–25): cozy forest clearing
    fillRect(grid, 18, 2, 25, 17, GR);
    // Scatter trees for cozy density
    var nTrees = [[18,2],[19,3],[18,5],[19,7],[18,9],[18,11],[19,13],[18,15],
                  [20,2],[20,5],[20,9],[20,14],[21,3],[21,7],[21,11]];
    for (var t = 0; t < nTrees.length; t++) grid[nTrees[t][1]][nTrees[t][0]] = TR;
    // Shrub accents
    var nShrubs = [[22,4],[23,6],[22,8],[23,10],[22,12],[24,3],[24,9]];
    for (var s = 0; s < nShrubs.length; s++) grid[nShrubs[s][1]][nShrubs[s][0]] = SB;

    // Bonfire in forest clearing
    grid[6][23] = BF;

    // Path from center up through forest to north facade door at (25,1)
    // Extends to row 2 so players have a clear walkable corridor to the door
    for (y = 2; y <= 17; y++) grid[y][24] = PT;
    for (y = 2; y <= 17; y++) grid[y][25] = PT;

    // East half (cols 26–33): water + boardwalk edge
    fillRect(grid, 28, 2, 33, 17, WA);
    // Boardwalk strip (cols 26–27)
    fillRect(grid, 26, 2, 27, 17, PT);
    // Fence between boardwalk and water (col 28 → already WATER, put fence at 27...
    // Actually fence at col 28, boardwalk at 26-27)
    for (y = 2; y <= 17; y++) grid[y][28] = FN;

    // North facade — Armory/Barracks entrance
    fillRange(grid[1], 20, 30, W1);  // facade wall
    fillRange(grid[2], 20, 22, W1);  // facade depth left
    fillRange(grid[2], 28, 30, W1);  // facade depth right  (gap at 26-27 for boardwalk)
    grid[1][25] = DR;                // door → Floor 3.1
    // Tree flanking left side of facade
    grid[0][18] = TR; grid[0][19] = TR; grid[1][18] = TR; grid[1][19] = TR;
    // Row 0 tree border already set

    // ═══════════════════════════════════════════════════════════
    //  SOUTH ARM — rows 34–51, cols 22–29
    //  Boardwalk pier dead-end over water
    // ═══════════════════════════════════════════════════════════

    // Water fill for the south arm zone
    fillRect(grid, 20, 34, 31, 51, WA);

    // Boardwalk pier: cols 23–28, rows 34–47
    // Fence perimeter
    for (y = 34; y <= 47; y++) {
      grid[y][22] = FN;  // west fence
      grid[y][29] = FN;  // east fence
    }
    fillRange(grid[47], 22, 29, FN);  // south fence closure

    // Boardwalk interior (walkable PATH)
    fillRect(grid, 23, 34, 28, 46, PT);

    // Connect pier to center hub (row 33–34, already have center exit)
    fillRange(grid[33], 23, 28, PT);  // overwrite shrub border for pier entrance

    // Crates at terminus
    grid[44][24] = BK; grid[44][25] = BK; grid[44][26] = BK;
    grid[45][25] = BK;

    // Water flanking pier (already set by fillRect above)

    // ═══════════════════════════════════════════════════════════
    //  CORNER FILL — negative space between arms
    //  NW, NE, SW, SE corners stay as TREE (initialized)
    //  Add WATER in SE and parts of NE for coastline feel
    // ═══════════════════════════════════════════════════════════

    // ── Restore edge borders (arms may have overwritten) ──
    fillRange(grid[0], 0, 51, TR);
    fillRange(grid[51], 0, 51, TR);
    for (y = 0; y < H; y++) {
      if (y !== 25 && y !== 26) grid[y][0] = TR;   // preserve gate tiles
      if (y !== 25 && y !== 26) grid[y][51] = TR;   // preserve arch doors
    }

    // NE transition strip
    for (y = 2; y <= 17; y++) grid[y][34] = SB;

    // SW corner: stays TREE (wilderness)

    // NW corner: stays TREE (dense forest)

    return grid;
  }

  // ── Spawn + metadata ──

  var SPAWN = { x: 4, y: 25, dir: 1 }; // facing EAST, on west entry path

  var ROOMS = [
    // Center hub (tower + slum)
    { x: 18, y: 18, w: 16, h: 16, cx: 25, cy: 25 },
    // West arm (entry corridor)
    { x: 1, y: 22, w: 17, h: 8, cx: 9, cy: 25 },
    // East arm (highway to Vivec)
    { x: 34, y: 19, w: 18, h: 14, cx: 42, cy: 25 },
    // North arm (forest + water)
    { x: 18, y: 1, w: 16, h: 17, cx: 25, cy: 9 },
    // South arm (boardwalk pier)
    { x: 22, y: 34, w: 8, h: 14, cx: 25, cy: 41 }
  ];

  function build() {
    var grid = buildGrid();
    return {
      grid: grid,
      rooms: ROOMS.slice(),
      doors: {
        stairsUp: null,
        stairsDn: null,
        doorExit: { x: 0, y: 25 }  // Primary exit back to Floor 2
      },
      doorTargets: {
        // ── West gate (back to Floor 2) ──
        '0,25': '2',
        '0,26': '2',
        // ── North facade (Armory/Barracks interior) ──
        '25,1': '3.1',
        // ── NE shack (Quartermaster's Shop) ──
        '31,20': '3.2',
        // ── East arch (forward to Floor 4 — Vivec) ──
        '51,25': '4',
        '51,26': '4'
      },
      gridW: W,
      gridH: H,
      biome: 'frontier',
      spawn: SPAWN,
      shops: [
        // Single shop near north bonfire clearing
        { x: 22, y: 7, faction: 'admiralty' }
      ]
    };
  }

  FloorManager.registerFloorBuilder('3', build);
})();

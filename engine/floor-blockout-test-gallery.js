/**
 * Floor Blockout — Minigame Tile Test Gallery (floor "1.9", depth 2)
 *
 * 24×20 interior showroom. Every Tier 1 minigame tile + key living-infra
 * props arranged in a grid gallery for rapid visual/interaction iteration.
 * Entered via DOOR_EXIT → Floor 1 (The Promenade).
 *
 * Biome: 'inn' — warm wood interior (good contrast for all prop textures).
 *
 * Layout: 5 alcoves along a central corridor, each showcasing one tile
 * type with space to walk around it and check all faces + round shapes.
 * Two bonus bays at the end for BAR_COUNTER (reference) and HEARTH.
 *
 * Tile legend (living infra):
 *   40=WELL  41=BENCH  42=NOTICE_BOARD  43=ANVIL  44=BARREL
 *   45=CHARGING_CRADLE  46=SWITCHBOARD  47=SOUP_KITCHEN  48=COT
 *   52=FUNGAL_PATCH (walkable floor tile)
 *
 * Standard tiles:
 *   0=EMPTY  1=WALL  4=DOOR_EXIT  10=PILLAR  18=BONFIRE
 *   25=BOOKSHELF  26=BAR_COUNTER  28=TABLE  29=HEARTH  30=TORCH_LIT
 */
(function () {
  'use strict';

  var T = typeof TILES !== 'undefined' ? TILES : {};
  // Tile constants for readability
  var __ = 0;   // EMPTY (walkable)
  var WL = 1;   // WALL
  var DX = 4;   // DOOR_EXIT
  var SD = 5;   // STAIRS_DN (for noticeboard preview test)
  var PL = 10;  // PILLAR
  var BF = 18;  // BONFIRE
  var BK = 25;  // BOOKSHELF
  var BC = 26;  // BAR_COUNTER
  var TB = 28;  // TABLE
  var HT = 29;  // HEARTH
  var TL = 30;  // TORCH_LIT

  // Living infra
  var WE = T.WELL            || 40;
  var BE = T.BENCH           || 41;
  var NB = T.NOTICE_BOARD    || 42;
  var AN = T.ANVIL           || 43;
  var BA = T.BARREL          || 44;
  var CC = T.CHARGING_CRADLE || 45;
  var SB = T.SWITCHBOARD     || 46;
  var SK = T.SOUP_KITCHEN    || 47;
  var CT = T.COT             || 48;
  var FP = T.FUNGAL_PATCH    || 52;

  var W = 24;
  var H = 20;

  // prettier-ignore
  var GRID = [
    //0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23
    [WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL], // 0  north wall
    [WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, WL], // 1
    [WL, __, __, WE, __, WL, __, __, AN, __, WL, __, __, SK, __, WL, __, __, BA, __, WL, __, __, WL], // 2  WELL | ANVIL | SOUP | BARREL
    [WL, __, __, __, __, WL, __, __, __, __, WL, __, __, __, __, WL, __, __, __, __, WL, __, __, WL], // 3
    [WL, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, WL], // 4  corridor
    [WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, __, WL], // 5
    [WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, __, __, WL, __, WL], // 6
    [WL, __, SD, NB, __, WL, __, __, CC, __, WL, __, __, SB, __, WL, __, __, BE, __, WL, __, WL], // 7  NOTICE+STAIRS | CRADLE | SWITCH | BENCH
    [WL, __, __, __, __, WL, __, __, __, __, WL, __, __, __, __, WL, __, __, __, __, WL, __, WL], // 8
    [WL, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, WL], // 9  corridor
    [WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, __, WL], //10
    [WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, __, __, WL, TL, __, __, __, WL, __, WL], //11
    [WL, __, __, CT, __, WL, __, __, BC, __, WL, __, __, HT, __, WL, __, __, TB, __, WL, __, WL], //12  COT | BAR | HEARTH | TABLE
    [WL, __, __, __, __, WL, __, __, __, __, WL, __, __, __, __, WL, __, __, __, __, WL, __, WL], //13
    [WL, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, WL], //14  corridor
    [WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, __, WL], //15
    [WL, TL, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, WL, __, WL], //16
    [WL, __, __, FP, FP, __, FP, __, __, BF, __, __, FP, __, FP, FP, __, __, PL, __, WL, __, WL], //17  FUNGAL_PATCH scatter + BONFIRE + PILLAR
    [WL, __, __, FP, __, __, __, FP, __, __, __, FP, __, __, __, FP, __, __, __, __, WL, __, WL], //18
    [WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, WL, DX, WL]  //19  DOOR_EXIT
  ];

  var SPAWN = { x: 21, y: 18, dir: 3 }; // east corridor, facing NORTH

  var ROOMS = [
    // Row 1 alcoves: WELL, ANVIL, SOUP_KITCHEN, BARREL
    { x: 1,  y: 1, w: 4, h: 3, cx: 3,  cy: 2 },
    { x: 6,  y: 1, w: 4, h: 3, cx: 8,  cy: 2 },
    { x: 11, y: 1, w: 4, h: 3, cx: 13, cy: 2 },
    { x: 16, y: 1, w: 4, h: 3, cx: 18, cy: 2 },
    // Row 2 alcoves: NOTICE_BOARD, CHARGING_CRADLE, SWITCHBOARD, BENCH
    { x: 1,  y: 6, w: 4, h: 3, cx: 3,  cy: 7 },
    { x: 6,  y: 6, w: 4, h: 3, cx: 8,  cy: 7 },
    { x: 11, y: 6, w: 4, h: 3, cx: 13, cy: 7 },
    { x: 16, y: 6, w: 4, h: 3, cx: 18, cy: 7 },
    // Row 3 alcoves: COT, BAR_COUNTER, HEARTH, TABLE
    { x: 1,  y: 11, w: 4, h: 3, cx: 3,  cy: 12 },
    { x: 6,  y: 11, w: 4, h: 3, cx: 8,  cy: 12 },
    { x: 11, y: 11, w: 4, h: 3, cx: 13, cy: 12 },
    { x: 16, y: 11, w: 4, h: 3, cx: 18, cy: 12 },
    // Row 4: FUNGAL_PATCH open hall
    { x: 1,  y: 16, w: 19, h: 3, cx: 10, cy: 17 },
    // East corridor
    { x: 21, y: 1, w: 2, h: 18, cx: 21, cy: 10 }
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
        doorExit: { x: 21, y: 19 }
      },
      doorTargets: { '21,19': '1', '2,7': '1.9.1' },  // DOOR_EXIT → Promenade; STAIRS_DN → test dungeon
      gridW: W,
      gridH: H,
      biome: 'inn',
      shops: [],
      books: []
    };
  }

  if (typeof FloorManager !== 'undefined') {
    FloorManager.registerFloorBuilder('1.9', build);
  }
})();

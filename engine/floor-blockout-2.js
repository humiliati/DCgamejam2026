/**
 * Floor Blockout 2 — Lantern Row (depth 1, exterior)
 *
 * 32×24 exterior. Commercial district — the second major exterior zone.
 * Reached via the south gate of The Promenade (Floor 1). Features a
 * wide main boulevard with building facades on both sides, shrub-lined
 * corridors that funnel toward the critical path, and tree perimeter.
 *
 * Biome: 'lantern' — light brick commercial facades, cobblestone floor,
 * warm amber lantern-lit atmosphere.
 *
 * Buildings (floorN.N entrances):
 *   - Dispatcher's Office (west, 2.1) — employer, mission briefing
 *   - Watchman's Post (east, 2.2)     — dungeon staging, shaken NPC
 *
 * Critical path accentuation:
 *   The boulevard funnels southward toward two key buildings.
 *   Shrub corridors narrow near the Watchman's Post entrance (east),
 *   making it the "loudest" visual destination — the gateway to the
 *   Hero's Wake dungeon (Floor 2.2.1) where the hero reveal occurs.
 *   The Dispatcher's Office is along the way but optional-looking.
 *
 * NPC zones:
 *   - Merchant stalls along boulevard (VENDOR)
 *   - Ambient townsfolk patrol the boulevard
 *   - Dispatcher NPC inside 2.1 (registered by office blockout)
 *   - Shaken watchman inside 2.2 (registered by watchpost blockout)
 *
 * Tile legend:
 *   0=EMPTY  1=WALL  2=DOOR  4=DOOR_EXIT  10=PILLAR
 *   18=BONFIRE  21=TREE  22=SHRUB
 */
(function () {
  'use strict';

  var W = 32;
  var H = 24;

  // prettier-ignore
  var GRID = [
    //0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 0  tree perimeter
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21], // 1  tree perimeter (double for depth)
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], // 2  north walk
    [21,21, 0, 1, 1, 1, 2, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 1, 1, 1, 0,21,21], // 3  Office facade (6,3) + Watchpost facade (25,3)
    [21,21, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0,21,21], // 4  building backs
    [21,21, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0,21,21], // 5  building backs
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], // 6  open corridor (north buildings → boulevard)
    [21,21, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0,21,21], // 7  lantern pillars
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0,21,21], // 8  shrub accents
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0,18, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0,21,21], // 9  BONFIRE (15,9) + shrub borders
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //10  shrub corridor
    [21,21, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0,21,21], //11  lantern pillars
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //12  open boulevard
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22,22,22, 0, 0,22,22,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //13  shrub funnel — narrows toward south
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //14  shrub funnel
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0,22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //15  shrub corridor
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,10, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //16  lantern pillars (inner)
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //17  open approach
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //18  open area
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //19  spawn area
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //20  behind gate
    [21,21, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,21,21], //21  south wall + DOOR_EXIT (15,21) → Floor 1
    [21,21, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,21,21], //22  beyond gate
    [21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21]  //23  tree perimeter
  ];

  var SPAWN = { x: 15, y: 19, dir: 3 }; // facing NORTH

  var ROOMS = [
    // Main boulevard (large open area)
    { x: 2, y: 6, w: 28, h: 8, cx: 15, cy: 10 },
    // South approach (funnel area)
    { x: 2, y: 14, w: 28, h: 7, cx: 15, cy: 17 }
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
        doorExit: { x: 15, y: 21 }
      },
      doorTargets: {
        '6,3':  '2.1',   // Dispatcher's Office
        '25,3': '2.2',   // Watchman's Post
        '15,21': '1'     // DOOR_EXIT → The Promenade
      },
      gridW: W,
      gridH: H,
      biome: 'lantern',
      shops: []
    };
  }

  FloorManager.registerFloorBuilder('2', build);
})();

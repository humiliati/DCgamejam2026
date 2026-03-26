/**
 * FloorManager — floor generation, caching, biome selection, and
 * spatial contract resolution.
 *
 * Owns:
 *   - Floor number tracking and floor ID convention
 *   - GridGen invocation with contract parameters
 *   - Per-floor cache (grid + enemies survive floor revisits)
 *   - Biome color palettes
 *   - SpatialContract selection per floor number
 *
 * Does NOT own:
 *   - Transition animations (see FloorTransition)
 *   - Player state (see Player)
 *   - Minimap fog caching (see Minimap)
 *
 * Floor ID convention (EyesOnly hierarchy):
 *   "N"     = depth 1, exterior/overworld
 *   "N.N"   = depth 2, interior contrived (building)
 *   "N.N.N" = depth 3, nested proc-gen dungeon
 *
 * Current implementation uses depth-3 IDs for dungeon floors:
 *   "1.1.1" = floor 1, "1.1.2" = floor 2, etc.
 *   Ready for overworld + building layers when world designer lands.
 */
var FloorManager = (function () {
  'use strict';

  var MC = MovementController;

  // ── State ──────────────────────────────────────────────────────────

  var _floorNum = 1;
  var _floorData = null;       // Current floor's GridGen output + contract
  var _floorCache = {};        // floorNum → { floorData, enemies }
  var _enemies = [];
  var _currentFloorId = null;

  // ── Floor ID management ────────────────────────────────────────────
  // Until overworld/building layers exist, all dungeon floors are
  // nested dungeon depth: "1.1.N" where N = floorNum.

  function floorId(num) {
    return '1.1.' + (num || _floorNum);
  }

  function getCurrentFloorId() { return _currentFloorId; }
  function getFloorNum()       { return _floorNum; }
  function setFloorNum(n)      { _floorNum = n; _currentFloorId = floorId(n); }
  function getFloorData()      { return _floorData; }
  function getEnemies()        { return _enemies; }
  function setEnemies(e)       { _enemies = e; }

  // ── Biome resolution ───────────────────────────────────────────────

  function getBiome(floor) {
    floor = floor || _floorNum;
    if (floor <= 2) return 'crypt';
    if (floor <= 5) return 'sewer';
    if (floor <= 8) return 'fortress';
    return 'abyss';
  }

  function getBiomeColors(floor) {
    var biomes = {
      crypt:    { wallLight: '#8a7a6a', wallDark: '#6a5a4a', door: '#b08040', doorDark: '#906830', ceil: '#1a1a22', floor: '#3a3a3a' },
      sewer:    { wallLight: '#5a7a5a', wallDark: '#3a5a3a', door: '#8a8a4a', doorDark: '#6a6a3a', ceil: '#1a2a1a', floor: '#2a3a2a' },
      fortress: { wallLight: '#7a7a8a', wallDark: '#5a5a6a', door: '#aa6a3a', doorDark: '#8a5a2a', ceil: '#1a1a2a', floor: '#3a3a4a' },
      abyss:    { wallLight: '#5a4a6a', wallDark: '#3a2a4a', door: '#8a4a8a', doorDark: '#6a3a6a', ceil: '#0a0a1a', floor: '#2a1a2a' }
    };
    return biomes[getBiome(floor)] || biomes.crypt;
  }

  // ── Spatial contract per floor ─────────────────────────────────────

  function getFloorContract(floor) {
    floor = floor || _floorNum;

    if (floor === 1) {
      return SpatialContract.nestedDungeon({
        label: 'Entry Halls',
        wallHeight: 1.2,
        renderDistance: 16,
        fogDistance: 12,
        fogColor: { r: 8, g: 6, b: 10 },
        gridSize: { w: 28, h: 28 },
        roomCount: { min: 5, max: 7 }
      });
    }
    if (floor <= 4) {
      return SpatialContract.PRESETS.DUNGEON({
        gridSize: { w: 30, h: 30 }
      });
    }
    if (floor === 5) {
      return SpatialContract.PRESETS.DUNGEON_WITH_BOSS({
        gridSize: { w: 32, h: 32 },
        chamberOverrides: [
          { roomIndex: -1, wallHeight: 1.8, label: 'Boss Chamber' }
        ]
      });
    }
    if (floor <= 8) {
      return SpatialContract.PRESETS.CRAWLSPACE();
    }
    return SpatialContract.nestedDungeon({
      label: 'Deep Dungeon',
      renderDistance: 12 - Math.min(4, Math.floor(floor / 5)),
      fogDistance: 8 - Math.min(3, Math.floor(floor / 5)),
      fogColor: { r: 0, g: 0, b: 0 },
      gridSize: { w: 32, h: 32 }
    });
  }

  /**
   * Get a human-readable label for a floor number.
   * @param {number} [floor] - defaults to current
   * @returns {string}
   */
  function getFloorLabel(floor) {
    floor = floor || _floorNum;
    var contract = getFloorContract(floor);
    return contract.label || ('Floor ' + floor);
  }

  // ── Floor generation ───────────────────────────────────────────────

  /**
   * Generate (or restore from cache) the current floor.
   * Sets _floorData, _enemies, applies contract to raycaster,
   * spawns the player via DoorContracts, and inits MovementController.
   *
   * @returns {Object} { x, y, dir } — player spawn position
   */
  function generateCurrentFloor() {
    var contract = getFloorContract(_floorNum);
    var label = contract.label || ('Floor ' + _floorNum);

    SeededRNG.seed(_floorNum * 31337 + 42);

    var fromCache = false;

    if (_floorCache[_floorNum]) {
      _floorData = _floorCache[_floorNum].floorData;
      _enemies = _floorCache[_floorNum].enemies;
      fromCache = true;
    } else {
      _floorData = GridGen.generate({
        width: contract.gridSize.w,
        height: contract.gridSize.h,
        biome: getBiome(_floorNum),
        floor: _floorNum,
        placeStairsUp: true,
        placeStairsDn: true,
        roomCount: SeededRNG.randInt(contract.roomCount.min, contract.roomCount.max)
      });

      _floorData.contract = contract;

      // Resolve -1 roomIndex (= last room) for chamber overrides
      if (contract.chamberOverrides) {
        for (var ci = 0; ci < contract.chamberOverrides.length; ci++) {
          if (contract.chamberOverrides[ci].roomIndex === -1) {
            contract.chamberOverrides[ci].roomIndex = _floorData.rooms.length - 1;
          }
        }
      }

      _enemies = EnemyAI.spawnEnemies(_floorData, _floorNum, null);
      _floorCache[_floorNum] = { floorData: _floorData, enemies: _enemies };
    }

    // Apply biome colors + contract to raycaster
    Raycaster.setBiomeColors(getBiomeColors(_floorNum));
    Raycaster.setContract(contract, _floorData.rooms);

    // Resolve player spawn via door contract
    var spawn = DoorContracts.applyContract(_floorData);
    var spawnDir = Player.radianToDir(spawn.dir);

    // Update player position
    Player.setPos(spawn.x, spawn.y);
    Player.setDir(spawnDir);
    Player.resetLookOffset();

    // Exclude spawn from enemy placement on fresh floors
    if (!fromCache) {
      _enemies = EnemyAI.spawnEnemies(_floorData, _floorNum, { x: spawn.x, y: spawn.y });
      _floorCache[_floorNum].enemies = _enemies;
    }

    // Init movement controller at spawn
    MC.init({
      x: spawn.x,
      y: spawn.y,
      dir: spawnDir,
      collisionCheck: _collisionCheck,
      onMoveStart: null,   // Wired by Game orchestrator
      onMoveFinish: null,
      onBump: null,
      onTurnFinish: null
    });

    return { x: spawn.x, y: spawn.y, dir: spawnDir };
  }

  // ── Collision check (used by MovementController) ───────────────────

  function _collisionCheck(fromX, fromY, toX, toY, dir) {
    var grid = _floorData.grid;
    var W = _floorData.gridW;
    var H = _floorData.gridH;

    if (toX < 0 || toX >= W || toY < 0 || toY >= H) {
      return { blocked: true, entity: false };
    }
    if (!TILES.isWalkable(grid[toY][toX])) {
      return { blocked: true, entity: false };
    }
    if (DoorContracts.isProtected(toX, toY)) {
      return { blocked: true, entity: false };
    }
    return { blocked: false, entity: false };
  }

  /** Expose collision check for MC init wiring. */
  function getCollisionCheck() { return _collisionCheck; }

  // ── Cache management ───────────────────────────────────────────────

  function clearCache() {
    _floorCache = {};
  }

  function removeEnemy(enemy) {
    var idx = _enemies.indexOf(enemy);
    if (idx >= 0) _enemies.splice(idx, 1);
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    // Floor ID
    floorId: floorId,
    getCurrentFloorId: getCurrentFloorId,
    getFloorNum: getFloorNum,
    setFloorNum: setFloorNum,

    // Data
    getFloorData: getFloorData,
    getEnemies: getEnemies,
    setEnemies: setEnemies,
    removeEnemy: removeEnemy,

    // Generation
    generateCurrentFloor: generateCurrentFloor,
    getCollisionCheck: getCollisionCheck,

    // Lookups
    getBiome: getBiome,
    getBiomeColors: getBiomeColors,
    getFloorContract: getFloorContract,
    getFloorLabel: getFloorLabel,

    // Cache
    clearCache: clearCache
  };
})();

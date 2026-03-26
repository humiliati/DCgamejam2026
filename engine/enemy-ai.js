/**
 * EnemyAI — patrol movement, awareness, sight cones, LOS.
 * Adapted from EyesOnly's EnemyAISystem.
 *
 * Awareness states: UNAWARE (0-30) → SUSPICIOUS (31-70) → ALERTED (71-100) → ENGAGED (100+)
 */
var EnemyAI = (function () {
  'use strict';

  var AWARENESS = {
    UNAWARE:    { min: 0,   max: 30,  color: '#4a4', label: 'Unaware' },
    SUSPICIOUS: { min: 31,  max: 70,  color: '#cc4', label: 'Suspicious' },
    ALERTED:    { min: 71,  max: 100, color: '#c44', label: 'Alerted' },
    ENGAGED:    { min: 101, max: 999, color: '#c4c', label: 'Engaged' }
  };

  var SIGHT_RANGE = 6;
  var AWARENESS_DECAY = 3;       // pts per tick (100ms)
  var AWARENESS_GAIN_SIGHT = 15; // pts per tick when in sight
  var AWARENESS_GAIN_CLOSE = 25; // pts per tick when adjacent

  var PATH_TYPES = {
    PATROL:     'patrol',
    CIRCULAR:   'circular',
    STATIONARY: 'stationary'
  };

  /**
   * Create an enemy entity.
   */
  function createEnemy(opts) {
    return {
      id: opts.id || ('enemy_' + Math.floor(Math.random() * 99999)),
      x: opts.x,
      y: opts.y,
      name: opts.name || 'Skeleton',
      emoji: opts.emoji || '💀',
      hp: opts.hp || 5,
      maxHp: opts.hp || 5,
      str: opts.str || 2,
      dex: opts.dex || 1,
      awareness: 0,
      facing: opts.facing || 'south', // north, south, east, west
      path: opts.path || null,
      pathIndex: 0,
      pathDirection: 1,
      pathTimer: 0,
      loot: opts.loot || null,
      isElite: opts.isElite || false,
      color: opts.color || '#c44'
    };
  }

  /**
   * Get awareness state from value.
   */
  function getAwarenessState(awareness) {
    if (awareness > 100) return AWARENESS.ENGAGED;
    if (awareness > 70)  return AWARENESS.ALERTED;
    if (awareness > 30)  return AWARENESS.SUSPICIOUS;
    return AWARENESS.UNAWARE;
  }

  /**
   * Update a single enemy for one tick.
   * @param {Object} enemy
   * @param {Object} player - { x, y }
   * @param {Array[]} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {number} deltaMs
   */
  function updateEnemy(enemy, player, grid, gridW, gridH, deltaMs) {
    var state = getAwarenessState(enemy.awareness);

    if (state === AWARENESS.ENGAGED) {
      // Chase player
      _chasePlayer(enemy, player, grid, gridW, gridH, deltaMs);
    } else if (state === AWARENESS.ALERTED) {
      // Move toward last known position
      _chasePlayer(enemy, player, grid, gridW, gridH, deltaMs);
      enemy.awareness -= AWARENESS_DECAY * 0.3; // Slow decay while alerted
    } else {
      // Patrol
      _updatePatrol(enemy, grid, gridW, gridH, deltaMs);
      // Decay awareness
      enemy.awareness = Math.max(0, enemy.awareness - AWARENESS_DECAY);
    }

    // Check sight
    if (_canSee(enemy, player, grid, gridW, gridH)) {
      var dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
      if (dist <= 1) {
        enemy.awareness += AWARENESS_GAIN_CLOSE;
      } else {
        enemy.awareness += AWARENESS_GAIN_SIGHT;
      }
      // Face player
      _faceToward(enemy, player);
    }

    enemy.awareness = Math.max(0, Math.min(200, enemy.awareness));
  }

  /**
   * Check line-of-sight from enemy to player.
   * Uses Bresenham's line with sight range and facing cone.
   */
  function _canSee(enemy, player, grid, gridW, gridH) {
    var dx = player.x - enemy.x;
    var dy = player.y - enemy.y;
    var dist = Math.abs(dx) + Math.abs(dy);

    if (dist > SIGHT_RANGE) return false;
    if (dist === 0) return true;

    // Check facing cone (roughly 180 degrees)
    var facingOk = false;
    switch (enemy.facing) {
      case 'north': facingOk = (dy <= 0); break;
      case 'south': facingOk = (dy >= 0); break;
      case 'east':  facingOk = (dx >= 0); break;
      case 'west':  facingOk = (dx <= 0); break;
      default: facingOk = true;
    }
    if (!facingOk) return false;

    // Bresenham LOS check
    return _lineOfSight(enemy.x, enemy.y, player.x, player.y, grid, gridW, gridH);
  }

  function _lineOfSight(x0, y0, x1, y1, grid, W, H) {
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = (x0 < x1) ? 1 : -1;
    var sy = (y0 < y1) ? 1 : -1;
    var err = dx - dy;

    var cx = x0, cy = y0;
    while (cx !== x1 || cy !== y1) {
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx)  { err += dx; cy += sy; }

      if (cx === x1 && cy === y1) return true; // Reached target

      if (cx < 0 || cx >= W || cy < 0 || cy >= H) return false;
      if (TILES.isOpaque(grid[cy][cx])) return false;
    }
    return true;
  }

  // ── Patrol movement ──

  function _updatePatrol(enemy, grid, W, H, deltaMs) {
    if (!enemy.path) return;

    enemy.pathTimer = (enemy.pathTimer || 0) + deltaMs;
    if (enemy.pathTimer < 500) return;
    enemy.pathTimer = 0;

    if (enemy.path.type === PATH_TYPES.PATROL) {
      if (!enemy.path.points || enemy.path.points.length < 2) return;

      var idx = enemy.pathIndex + enemy.pathDirection;
      if (idx >= enemy.path.points.length) {
        idx = enemy.path.points.length - 2;
        enemy.pathDirection = -1;
      } else if (idx < 0) {
        idx = 1;
        enemy.pathDirection = 1;
      }
      enemy.pathIndex = idx;

      var pt = enemy.path.points[idx];
      _moveToPoint(enemy, pt, grid, W, H);
    } else if (enemy.path.type === PATH_TYPES.CIRCULAR) {
      if (!enemy.path.points || enemy.path.points.length < 2) return;
      enemy.pathIndex = (enemy.pathIndex + 1) % enemy.path.points.length;
      _moveToPoint(enemy, enemy.path.points[enemy.pathIndex], grid, W, H);
    } else if (enemy.path.type === PATH_TYPES.STATIONARY) {
      // Just rotate in place
      var facings = ['north', 'east', 'south', 'west'];
      var fi = facings.indexOf(enemy.facing);
      enemy.facing = facings[(fi + 1) % 4];
    }
  }

  function _moveToPoint(enemy, pt, grid, W, H) {
    if (!pt) return;
    var nx = pt.x;
    var ny = pt.y;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
    if (!TILES.isWalkable(grid[ny][nx])) return;

    // Update facing
    _faceToward(enemy, pt);
    enemy.x = nx;
    enemy.y = ny;
  }

  // ── Chase behavior ──

  function _chasePlayer(enemy, player, grid, W, H, deltaMs) {
    enemy.pathTimer = (enemy.pathTimer || 0) + deltaMs;
    if (enemy.pathTimer < 400) return; // Slightly faster than patrol
    enemy.pathTimer = 0;

    // Simple greedy chase (step toward player)
    var dx = player.x - enemy.x;
    var dy = player.y - enemy.y;
    var stepX = dx !== 0 ? (dx > 0 ? 1 : -1) : 0;
    var stepY = dy !== 0 ? (dy > 0 ? 1 : -1) : 0;

    // Try primary direction first
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (_tryMove(enemy, enemy.x + stepX, enemy.y, grid, W, H)) return;
      if (stepY && _tryMove(enemy, enemy.x, enemy.y + stepY, grid, W, H)) return;
    } else {
      if (_tryMove(enemy, enemy.x, enemy.y + stepY, grid, W, H)) return;
      if (stepX && _tryMove(enemy, enemy.x + stepX, enemy.y, grid, W, H)) return;
    }
  }

  function _tryMove(enemy, nx, ny, grid, W, H) {
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return false;
    if (!TILES.isWalkable(grid[ny][nx])) return false;
    _faceToward(enemy, { x: nx, y: ny });
    enemy.x = nx;
    enemy.y = ny;
    return true;
  }

  function _faceToward(enemy, target) {
    var dx = target.x - enemy.x;
    var dy = target.y - enemy.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      enemy.facing = dx > 0 ? 'east' : 'west';
    } else {
      enemy.facing = dy > 0 ? 'south' : 'north';
    }
  }

  /**
   * Spawn enemies for a floor.
   * @param {Object} floorData - from GridGen
   * @param {number} floorNum
   * @param {Object} playerSpawn - { x, y } to avoid spawning on top of player
   * @returns {Array} Array of enemy objects
   */
  function spawnEnemies(floorData, floorNum, playerSpawn) {
    var grid = floorData.grid;
    var rooms = floorData.rooms;
    var W = floorData.gridW;
    var H = floorData.gridH;

    var count = Math.min(rooms.length - 1, SeededRNG.randInt(2, 3 + Math.floor(floorNum / 2)));
    var enemies = [];

    var ENEMY_TYPES = [
      { name: 'Skeleton',  emoji: '💀', hp: 4,  str: 1, dex: 1 },
      { name: 'Goblin',    emoji: '👺', hp: 3,  str: 1, dex: 3 },
      { name: 'Orc',       emoji: '👹', hp: 8,  str: 3, dex: 1 },
      { name: 'Ghost',     emoji: '👻', hp: 3,  str: 2, dex: 4 },
      { name: 'Slime',     emoji: '🟢', hp: 6,  str: 1, dex: 0 },
      { name: 'Mimic',     emoji: '📦', hp: 5,  str: 3, dex: 2 }
    ];

    // Scale enemies with floor
    var tierBonus = Math.floor(floorNum / 3);

    for (var i = 0; i < count; i++) {
      // Pick a room (skip first room, which has stairs up / player spawn)
      var roomIdx = SeededRNG.randInt(1, rooms.length - 1);
      var room = rooms[roomIdx];
      if (!room) continue;

      // Find empty tile in room
      var ex = room.x + SeededRNG.randInt(1, room.w - 2);
      var ey = room.y + SeededRNG.randInt(1, room.h - 2);

      if (ex < 0 || ex >= W || ey < 0 || ey >= H) continue;
      if (grid[ey][ex] !== TILES.EMPTY) continue;

      // Don't spawn on player
      if (playerSpawn && ex === playerSpawn.x && ey === playerSpawn.y) continue;

      var type = SeededRNG.pick(ENEMY_TYPES);
      var patrol = _generatePatrol(room, grid, W, H);

      enemies.push(createEnemy({
        x: ex,
        y: ey,
        name: type.name,
        emoji: type.emoji,
        hp: type.hp + tierBonus * 2,
        str: type.str + tierBonus,
        dex: type.dex + Math.floor(tierBonus / 2),
        path: patrol,
        facing: SeededRNG.pick(['north', 'south', 'east', 'west'])
      }));
    }

    return enemies;
  }

  function _generatePatrol(room, grid, W, H) {
    // Generate 2-4 patrol points within the room
    var points = [];
    var attempts = 0;
    var count = SeededRNG.randInt(2, 4);

    while (points.length < count && attempts < 20) {
      var px = room.x + SeededRNG.randInt(1, room.w - 2);
      var py = room.y + SeededRNG.randInt(1, room.h - 2);
      if (px > 0 && px < W && py > 0 && py < H && grid[py][px] === TILES.EMPTY) {
        points.push({ x: px, y: py });
      }
      attempts++;
    }

    if (points.length < 2) return null;

    return {
      type: SeededRNG.random() > 0.3 ? PATH_TYPES.PATROL : PATH_TYPES.STATIONARY,
      points: points
    };
  }

  return {
    createEnemy: createEnemy,
    updateEnemy: updateEnemy,
    spawnEnemies: spawnEnemies,
    getAwarenessState: getAwarenessState,
    AWARENESS: AWARENESS,
    PATH_TYPES: PATH_TYPES,
    SIGHT_RANGE: SIGHT_RANGE
  };
})();

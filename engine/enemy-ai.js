/**
 * EnemyAI — patrol movement, awareness, sight cones, LOS.
 * Adapted from EyesOnly's EnemyAISystem.
 *
 * Awareness thresholds and detection tuning now live in AwarenessConfig (Layer 0).
 * Stealth modifiers applied via StealthSystem (Layer 1).
 */
var EnemyAI = (function () {
  'use strict';

  // ── Delegate to AwarenessConfig if available, else inline fallback ──
  var _AC = (typeof AwarenessConfig !== 'undefined') ? AwarenessConfig : null;
  var _DET = _AC ? _AC.DETECTION : null;

  var AWARENESS = _AC ? _AC.STATES : {
    UNAWARE:    { min: 0,   max: 30,  color: '#4a4', label: 'Unaware' },
    SUSPICIOUS: { min: 31,  max: 70,  color: '#cc4', label: 'Suspicious' },
    ALERTED:    { min: 71,  max: 100, color: '#c44', label: 'Alerted' },
    ENGAGED:    { min: 101, max: 999, color: '#c4c', label: 'Engaged' }
  };

  var SIGHT_RANGE        = _DET ? _DET.SIGHT_RANGE         : 6;
  var AWARENESS_DECAY    = _DET ? _DET.AWARENESS_DECAY     : 3;
  var AWARENESS_GAIN_SIGHT = _DET ? _DET.AWARENESS_GAIN_SIGHT : 15;
  var AWARENESS_GAIN_CLOSE = _DET ? _DET.AWARENESS_GAIN_CLOSE : 25;
  var ALERTED_DECAY_MULT = _DET ? _DET.ALERTED_DECAY_MULT : 0.3;

  var PATH_TYPES = {
    PATROL:     'patrol',
    CIRCULAR:   'circular',
    STATIONARY: 'stationary'
  };

  /**
   * Create an enemy entity.
   */
  // Flee immunity — ms before a fled enemy can re-engage the player
  var FLEE_IMMUNITY_MS = 3000;

  function createEnemy(opts) {
    // Derive type key for EnemySprites lookup:
    // Canonical form = lower-case name with spaces → underscores
    var typeName = (opts.type || opts.name || 'skeleton').toLowerCase().replace(/[\s\-]+/g, '_');
    // Strip non-alphanumeric (except underscore) for safety
    typeName = typeName.replace(/[^a-z0-9_]/g, '');

    return {
      id: opts.id || ('enemy_' + Math.floor(Math.random() * 99999)),
      type: typeName,                         // Stack registry key
      x: opts.x,
      y: opts.y,
      name: opts.name || 'Skeleton',
      emoji: opts.emoji || '💀',
      hp: opts.hp || 5,
      maxHp: opts.hp || 5,
      str: opts.str || 2,
      dex: opts.dex || 1,
      stealth: opts.stealth || 0,
      awarenessRange: opts.awarenessRange || 4,
      suit: opts.suit || 'spade',             // RPS suit: spade/club/diamond/heart
      lootProfile: opts.lootProfile || null,
      tags: opts.tags ? opts.tags.slice() : [],
      awareness: 0,
      facing: opts.facing || 'south', // north, south, east, west
      path: opts.path || null,
      pathIndex: 0,
      pathDirection: 1,
      pathTimer: 0,
      loot: opts.loot || null,
      isElite: opts.isElite || false,
      nonLethal: opts.nonLethal || false,   // Training NPC — defeat won't kill
      fleeImmunity: 0,                      // ms remaining before can re-engage
      color: opts.color || '#c44'
    };
  }

  /**
   * Get awareness state from value.
   */
  function getAwarenessState(awareness) {
    if (_AC) return _AC.resolve(awareness);
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
    // Tick flee immunity
    if (enemy.fleeImmunity > 0) {
      enemy.fleeImmunity = Math.max(0, enemy.fleeImmunity - deltaMs);
    }

    var prevAwareness = enemy.awareness;
    var state = getAwarenessState(enemy.awareness);
    if (state === AWARENESS.ENGAGED) {
      // Chase player
      _chasePlayer(enemy, player, grid, gridW, gridH, deltaMs);
    } else if (state === AWARENESS.ALERTED) {
      // Move toward last known position
      _chasePlayer(enemy, player, grid, gridW, gridH, deltaMs);
      enemy.awareness -= AWARENESS_DECAY * ALERTED_DECAY_MULT; // Slow decay while alerted
    } else {
      // Patrol
      _updatePatrol(enemy, grid, gridW, gridH, deltaMs);
      // Decay awareness
      enemy.awareness = Math.max(0, enemy.awareness - AWARENESS_DECAY);
    }

    // Check sight — apply stealth modifier to awareness gain
    if (_canSee(enemy, player, grid, gridW, gridH)) {
      var dist = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
      var baseGain = (dist <= 1) ? AWARENESS_GAIN_CLOSE : AWARENESS_GAIN_SIGHT;

      // Reduce gain by player's stealth bonus
      if (typeof StealthSystem !== 'undefined') {
        var stealthBonus = StealthSystem.getPlayerStealthBonus(
          player.x, player.y, grid, gridW, gridH, player.floorId || ''
        );
        baseGain = StealthSystem.applyBonus(baseGain, stealthBonus);
      }

      enemy.awareness += baseGain;
      // Face player
      _faceToward(enemy, player);
    }

    enemy.awareness = Math.max(0, Math.min(200, enemy.awareness));

    // ── Awareness escalation SFX ──
    // Play a spatial cue when an enemy first becomes ALERTED (heard you)
    // or SUSPICIOUS (noticed something). Conservative: one-shot per transition.
    if (typeof AudioSystem !== 'undefined') {
      var newState = getAwarenessState(enemy.awareness);
      var prevS = getAwarenessState(prevAwareness);
      if (newState === AWARENESS.ALERTED && prevS !== AWARENESS.ALERTED && prevS !== AWARENESS.ENGAGED) {
        AudioSystem.play('enemy-alert', { volume: 0.35 });
      } else if (newState === AWARENESS.SUSPICIOUS && prevS === AWARENESS.UNAWARE) {
        AudioSystem.play('ui-signal', { volume: 0.2 });
      }
    }
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

  // Normal patrol: 1200ms per step (mosey pace)
  // Hero/rush NPCs can override via enemy.rushSpeed flag
  var PATROL_STEP_MS = 1200;
  var RUSH_STEP_MS   = 400;  // Hero pass-through speed

  function _updatePatrol(enemy, grid, W, H, deltaMs) {
    if (!enemy.path) return;

    var stepMs = enemy.rushSpeed ? RUSH_STEP_MS : PATROL_STEP_MS;
    enemy.pathTimer = (enemy.pathTimer || 0) + deltaMs;
    if (enemy.pathTimer < stepMs) return;
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

  // ── Post-move hooks (cobweb destruction, etc.) ──
  // Friendly NPCs (reanimated corpses) respect player cobwebs.
  function _onEnemyArrived(enemy, nx, ny) {
    if (enemy.friendly) return;
    if (typeof CobwebSystem !== 'undefined') {
      var floorId = (typeof FloorManager !== 'undefined')
        ? FloorManager.getCurrentFloorId() : '';
      CobwebSystem.onEntityMove(nx, ny, floorId);
    }
  }

  function _moveToPoint(enemy, pt, grid, W, H) {
    if (!pt) return;
    var nx = pt.x;
    var ny = pt.y;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
    if (!TILES.isWalkable(grid[ny][nx])) return;

    // Store previous position for lerp interpolation
    enemy._prevX = enemy.x;
    enemy._prevY = enemy.y;
    enemy._lerpT = 0;

    // Update facing
    _faceToward(enemy, pt);
    enemy.x = nx;
    enemy.y = ny;
    _onEnemyArrived(enemy, nx, ny);
  }

  // ── Chase behavior ──

  function _chasePlayer(enemy, player, grid, W, H, deltaMs) {
    enemy.pathTimer = (enemy.pathTimer || 0) + deltaMs;
    var chaseMs = enemy.rushSpeed ? 300 : 800; // Chase: faster than patrol but still measured
    if (enemy.pathTimer < chaseMs) return;
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

    // Store previous position for lerp interpolation
    enemy._prevX = enemy.x;
    enemy._prevY = enemy.y;
    enemy._lerpT = 0;

    _faceToward(enemy, { x: nx, y: ny });
    enemy.x = nx;
    enemy.y = ny;
    _onEnemyArrived(enemy, nx, ny);
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

  // ── enemies.json population tables ──────────────────────────────
  // Loaded at init; falls back to hardcoded legacy pool if JSON missing.
  var _populationByBiome = {};   // biome → [entries] (standard only)
  var _elitesByBiome     = {};   // biome → [entries] (elite only)
  var _bossesByBiome     = {};   // biome → [entries] (boss only)
  var _crossBiome        = [];   // special cross-biome enemies
  var _populationReady   = false;

  /**
   * Load the enemies.json population data.
   * Called once from Game.init() via EnemyAI.loadPopulation().
   * Synchronous XHR for jam simplicity (file is local, tiny).
   */
  function loadPopulation() {
    if (_populationReady) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/enemies.json', false); // sync
      xhr.send();
      if (xhr.status === 200 || xhr.status === 0) {
        var raw = JSON.parse(xhr.responseText);
        for (var i = 0; i < raw.length; i++) {
          var e = raw[i];
          if (e._comment || !e.id) continue; // skip comment entries
          // Index by biome
          var biomes = e.biomes || [];
          for (var b = 0; b < biomes.length; b++) {
            var biome = biomes[b];
            if (e.tier === 'boss') {
              if (!_bossesByBiome[biome]) _bossesByBiome[biome] = [];
              _bossesByBiome[biome].push(e);
            } else if (e.tier === 'elite' || e.isElite) {
              if (!_elitesByBiome[biome]) _elitesByBiome[biome] = [];
              _elitesByBiome[biome].push(e);
            } else {
              if (!_populationByBiome[biome]) _populationByBiome[biome] = [];
              _populationByBiome[biome].push(e);
            }
          }
          // Cross-biome enemies (appear in 3+ biomes or special IDs)
          if (biomes.length >= 3 && e.tier !== 'boss') {
            _crossBiome.push(e);
          }
        }
        _populationReady = true;
      }
    } catch (err) {
      // Silently fail — spawnEnemies falls back to legacy pool
    }
  }

  // ── Biome resolution from floor ID ─────────────────────────────
  // Floor hierarchy: "1.1.N" = cellar, "1.1.3+" eventually = foundry, etc.
  // For jam scope: dungeon levels 1-2 = cellar, 3-5 = foundry, 6+ = sealab
  function _resolveBiome(floorId) {
    var parts = String(floorId).split('.');
    var depth = parts.length;
    if (depth < 3) return 'cellar'; // exterior/interior = cellar encounters
    var level = parseInt(parts[parts.length - 1], 10) || 1;
    if (level <= 2) return 'cellar';
    if (level <= 5) return 'foundry';
    return 'sealab';
  }

  // ── Legacy fallback (used if enemies.json fails to load) ───────
  var _LEGACY_TYPES = [
    { name: 'Bone Guard',       emoji: '💀', hp: 4, str: 2, dex: 1, suit: 'spade' },
    { name: 'Soot Imp',         emoji: '👺', hp: 3, str: 1, dex: 3, suit: 'diamond' },
    { name: 'Scrap Brute',      emoji: '🦾', hp: 8, str: 3, dex: 1, suit: 'spade' },
    { name: 'Mold Wraith',      emoji: '👻', hp: 3, str: 2, dex: 4, suit: 'club' },
    { name: 'Bio-Hazard Slime', emoji: '💧', hp: 6, str: 1, dex: 0, suit: 'club' },
    { name: 'Wandering Vendor', emoji: '🛒', hp: 5, str: 3, dex: 2, suit: 'spade' }
  ];

  /**
   * Spawn enemies for a floor.
   * @param {Object} floorData - from GridGen
   * @param {string} floorId - floor ID string
   * @param {Object} playerSpawn - { x, y } to avoid spawning on top of player
   * @returns {Array} Array of enemy objects
   */
  function spawnEnemies(floorData, floorId, playerSpawn) {
    var grid = floorData.grid;
    var rooms = floorData.rooms;
    var W = floorData.gridW;
    var H = floorData.gridH;

    // Calculate depth and dungeon level for scaling
    var parts = String(floorId).split('.');
    var depth = parts.length;
    var dungeonLevel = depth >= 3 ? (parseInt(parts[parts.length - 1], 10) || 1) : 0;

    var count = Math.min(rooms.length - 1, SeededRNG.randInt(2, 3 + Math.floor(dungeonLevel / 2)));
    var enemies = [];

    // Resolve population pool from biome
    var biome = _resolveBiome(floorId);
    var pool = (_populationReady && _populationByBiome[biome])
      ? _populationByBiome[biome]
      : _LEGACY_TYPES;
    var elitePool = (_populationReady && _elitesByBiome[biome])
      ? _elitesByBiome[biome]
      : null;

    // Scale enemies with dungeon level
    var tierBonus = Math.floor(dungeonLevel / 3);

    // Elite spawn chance: 15% base, +5% per dungeon level (max 40%)
    var eliteChance = Math.min(0.40, 0.15 + dungeonLevel * 0.05);

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

      // Roll elite or standard
      var useElite = elitePool && SeededRNG.random() < eliteChance;
      var type = useElite ? SeededRNG.pick(elitePool) : SeededRNG.pick(pool);

      // Rare cross-biome spawn (5% chance, only if population loaded)
      if (_populationReady && _crossBiome.length > 0 && SeededRNG.random() < 0.05) {
        type = SeededRNG.pick(_crossBiome);
      }

      var patrol = _generatePatrol(room, grid, W, H);

      enemies.push(createEnemy({
        x: ex,
        y: ey,
        name: type.name,
        emoji: type.emoji,
        hp: type.hp + tierBonus * 2,
        str: type.str + tierBonus,
        dex: (type.dex || 1) + Math.floor(tierBonus / 2),
        stealth: type.stealth || 0,
        awarenessRange: type.awarenessRange || 4,
        suit: type.suit || 'spade',
        lootProfile: type.lootProfile || null,
        isElite: type.isElite || false,
        nonLethal: type.nonLethal || false,
        tags: type.tags || [],
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

  /** Apply flee immunity to an enemy (blocks re-engagement). */
  function applyFleeImmunity(enemy) {
    enemy.fleeImmunity = FLEE_IMMUNITY_MS;
    enemy.awareness = 50; // Drop to SUSPICIOUS — they know you were here
  }

  /** Can this enemy engage the player right now? */
  function canEngage(enemy) {
    return enemy.hp > 0 && !enemy.friendly && enemy.fleeImmunity <= 0;
  }

  /**
   * Public wrapper for _faceToward — make enemy face a target position.
   * Used by CombatBridge when an ambushed enemy must turn to face the player.
   */
  function faceToward(enemy, target) {
    _faceToward(enemy, target);
  }

  return {
    createEnemy: createEnemy,
    updateEnemy: updateEnemy,
    spawnEnemies: spawnEnemies,
    loadPopulation: loadPopulation,
    getAwarenessState: getAwarenessState,
    applyFleeImmunity: applyFleeImmunity,
    canEngage: canEngage,
    faceToward: faceToward,
    AWARENESS: AWARENESS,
    PATH_TYPES: PATH_TYPES,
    SIGHT_RANGE: SIGHT_RANGE,
    FLEE_IMMUNITY_MS: FLEE_IMMUNITY_MS
  };
})();

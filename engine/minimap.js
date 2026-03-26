/**
 * Minimap — top-down dungeon map overlay with floor cache stack.
 *
 * Shows explored tiles, player position + facing, enemy blips.
 * Supports multi-floor navigation via cached explored state per
 * floor ID, with a breadcrumb stack for tracking the active path.
 *
 * Floor hierarchy (EyesOnly convention):
 *   "1"     = depth 1, exterior/overworld
 *   "1.2"   = depth 2, interior contrived (building)
 *   "1.2.3" = depth 3, nested proc-gen dungeon
 *
 * Transition behavior:
 *   Horizontal (N↔N.N): instant grid swap, no fade
 *   Vertical (N.N↔N.N.N, N.N.N↔N): swap during fade overlay
 */
var Minimap = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _size = 160;
  var _visible = true;

  // ── Floor cache & stack ──────────────────────────────────────────
  // _floorCache: floorId → { explored, lastPlayerPos }
  // Persists explored fog state so returning to a floor restores it.
  var _floorCache = {};

  // _floorStack: ordered array of floorIds representing the path
  // from surface to current depth. E.g. ['1', '1.2', '1.2.1']
  var _floorStack = [];

  // Current floor being displayed
  var _currentFloorId = null;

  // Current explored hash (reference into cache)
  var _explored = {};

  // Floor label (from spatial contract) for overlay
  var _floorLabel = '';

  var COLORS = {
    bg:         'rgba(0,0,0,0.7)',
    wall:       '#555',
    floor:      '#2a2a2a',
    door:       '#b08040',    // Horizontal transition markers (amber)
    stairs:     '#5588ff',    // Vertical transition markers (blue)
    stairsUp:   '#55bbff',    // Stairs up (lighter blue)
    stairsDn:   '#3366cc',    // Stairs down (deeper blue)
    player:     '#0f0',
    enemy:      '#f44',
    enemySus:   '#ff0',
    chest:      '#ff0',
    unexplored: '#000',
    label:      'rgba(255,255,255,0.6)',
    labelBg:    'rgba(0,0,0,0.5)'
  };

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');
    _canvas.width = _size;
    _canvas.height = _size;
  }

  // ── Floor management ─────────────────────────────────────────────

  /**
   * Enter a new floor. Caches current floor state and sets up the
   * new floor's explored hash (from cache if revisiting, empty if new).
   *
   * @param {string} floorId   - e.g. "1", "1.2", "1.2.1"
   * @param {string} [label]   - Floor label from spatial contract
   */
  function enterFloor(floorId, label) {
    // Cache current floor before switching
    if (_currentFloorId) {
      _floorCache[_currentFloorId] = _floorCache[_currentFloorId] || {};
      _floorCache[_currentFloorId].explored = _explored;
    }

    _currentFloorId = floorId;
    _floorLabel = label || floorId;

    // Restore cached explored state or start fresh
    if (_floorCache[floorId] && _floorCache[floorId].explored) {
      _explored = _floorCache[floorId].explored;
    } else {
      _explored = {};
      _floorCache[floorId] = { explored: _explored };
    }
  }

  /**
   * Push a floor onto the breadcrumb stack (going deeper).
   * Call this BEFORE enterFloor when descending/entering.
   *
   * @param {string} floorId
   */
  function pushFloor(floorId) {
    // Don't duplicate the top of stack
    if (_floorStack.length === 0 || _floorStack[_floorStack.length - 1] !== floorId) {
      _floorStack.push(floorId);
    }
  }

  /**
   * Pop floors from the stack back to a target floor (going up/out).
   * Removes everything above the target from the stack.
   *
   * @param {string} targetFloorId - The floor we're returning to
   */
  function popToFloor(targetFloorId) {
    var idx = _floorStack.indexOf(targetFloorId);
    if (idx >= 0) {
      _floorStack.length = idx + 1; // Trim everything after target
    } else {
      // Target not in stack — push it (shouldn't happen in normal flow)
      _floorStack = [targetFloorId];
    }
  }

  /**
   * Get the current breadcrumb stack (for debug/HUD).
   * @returns {Array<string>}
   */
  function getFloorStack() {
    return _floorStack.slice();
  }

  /**
   * Get the current floor ID.
   * @returns {string|null}
   */
  function getCurrentFloorId() {
    return _currentFloorId;
  }

  /**
   * Get depth of current floor (1=exterior, 2=interior, 3=nested).
   * @returns {number}
   */
  function getCurrentDepth() {
    if (!_currentFloorId) return 1;
    return String(_currentFloorId).split('.').length;
  }

  /**
   * Clear explored state for current floor only.
   */
  function clearExplored() {
    _explored = {};
    if (_currentFloorId && _floorCache[_currentFloorId]) {
      _floorCache[_currentFloorId].explored = _explored;
    }
  }

  /**
   * Clear ALL cached floor data. Use on new game / hard reset.
   */
  function clearAllFloors() {
    _floorCache = {};
    _floorStack = [];
    _currentFloorId = null;
    _explored = {};
    _floorLabel = '';
  }

  function toggle() {
    _visible = !_visible;
    _canvas.style.display = _visible ? 'block' : 'none';
  }

  function isVisible() { return _visible; }

  /**
   * Reveal tiles around a position (fog of war).
   * @param {number} px - Player grid X
   * @param {number} py - Player grid Y
   * @param {number} [radius] - Sight radius (default 5)
   */
  function reveal(px, py, radius) {
    radius = radius || 5;
    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          _explored[(px + dx) + ',' + (py + dy)] = true;
        }
      }
    }
  }

  /**
   * Render the minimap.
   * @param {Object} player   - { x, y, dir }
   * @param {Array[]} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {Array}  [enemies] - [{ x, y, awareness }]
   */
  function render(player, grid, gridW, gridH, enemies) {
    if (!_visible || !_ctx) return;
    var ctx = _ctx;
    var tileSize = Math.max(2, Math.floor(_size / Math.max(gridW, gridH)));
    var offsetX = Math.floor((_size - gridW * tileSize) / 2);
    var offsetY = Math.floor((_size - gridH * tileSize) / 2);

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, _size, _size);

    // Draw grid
    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var key = x + ',' + y;
        if (!_explored[key]) continue;

        var tile = grid[y][x];
        var px2 = offsetX + x * tileSize;
        var py2 = offsetY + y * tileSize;

        if (tile === TILES.WALL || tile === TILES.PILLAR) {
          ctx.fillStyle = COLORS.wall;
        } else if (tile === TILES.STAIRS_UP) {
          ctx.fillStyle = COLORS.stairsUp;
        } else if (tile === TILES.STAIRS_DN) {
          ctx.fillStyle = COLORS.stairsDn;
        } else if (TILES.isDoor && TILES.isDoor(tile)) {
          ctx.fillStyle = COLORS.door;
        } else if (tile === TILES.CHEST) {
          ctx.fillStyle = COLORS.chest;
        } else if (tile === TILES.EMPTY || (TILES.isWalkable && TILES.isWalkable(tile))) {
          ctx.fillStyle = COLORS.floor;
        } else {
          ctx.fillStyle = COLORS.unexplored;
        }

        ctx.fillRect(px2, py2, tileSize, tileSize);

        // Draw directional chevrons on stair tiles
        if (tileSize >= 4) {
          if (tile === TILES.STAIRS_DN) {
            _drawChevron(ctx, px2, py2, tileSize, 'down');
          } else if (tile === TILES.STAIRS_UP) {
            _drawChevron(ctx, px2, py2, tileSize, 'up');
          }
        }
      }
    }

    // Draw enemies
    if (enemies) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var ek = e.x + ',' + e.y;
        if (!_explored[ek]) continue;

        var ex = offsetX + e.x * tileSize + tileSize / 2;
        var ey = offsetY + e.y * tileSize + tileSize / 2;
        ctx.fillStyle = (e.awareness > 30) ? COLORS.enemySus : COLORS.enemy;
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(2, tileSize / 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw player
    var ppx = offsetX + player.x * tileSize + tileSize / 2;
    var ppy = offsetY + player.y * tileSize + tileSize / 2;

    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    var triSize = Math.max(3, tileSize);
    var tipX = ppx + Math.cos(player.dir) * triSize;
    var tipY = ppy + Math.sin(player.dir) * triSize;
    var baseAngle = Math.PI * 0.8;
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(ppx + Math.cos(player.dir + baseAngle) * triSize * 0.5,
               ppy + Math.sin(player.dir + baseAngle) * triSize * 0.5);
    ctx.lineTo(ppx + Math.cos(player.dir - baseAngle) * triSize * 0.5,
               ppy + Math.sin(player.dir - baseAngle) * triSize * 0.5);
    ctx.closePath();
    ctx.fill();

    // Draw floor label overlay (bottom-left corner)
    if (_floorLabel) {
      ctx.font = '9px monospace';
      var labelW = ctx.measureText(_floorLabel).width + 6;
      ctx.fillStyle = COLORS.labelBg;
      ctx.fillRect(1, _size - 13, labelW, 12);
      ctx.fillStyle = COLORS.label;
      ctx.fillText(_floorLabel, 4, _size - 3);
    }

    // Draw depth indicator (breadcrumb dots, top-right)
    if (_floorStack.length > 1) {
      _drawBreadcrumbs(ctx);
    }
  }

  /**
   * Draw a small up/down chevron on stair tiles.
   */
  function _drawChevron(ctx, px, py, size, direction) {
    var cx = px + size / 2;
    var cy = py + size / 2;
    var half = size * 0.3;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (direction === 'down') {
      ctx.moveTo(cx - half, cy - half * 0.5);
      ctx.lineTo(cx, cy + half * 0.5);
      ctx.lineTo(cx + half, cy - half * 0.5);
    } else {
      ctx.moveTo(cx - half, cy + half * 0.5);
      ctx.lineTo(cx, cy - half * 0.5);
      ctx.lineTo(cx + half, cy + half * 0.5);
    }
    ctx.stroke();
  }

  /**
   * Draw breadcrumb dots showing depth in floor stack.
   * Current floor = bright dot, parent floors = dim dots.
   */
  function _drawBreadcrumbs(ctx) {
    var count = _floorStack.length;
    var currentIdx = _floorStack.indexOf(_currentFloorId);
    if (currentIdx < 0) currentIdx = count - 1;

    var dotR = 2;
    var gap = 7;
    var startX = _size - (count * gap) - 2;
    var y = 8;

    for (var i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * gap + dotR, y, dotR, 0, Math.PI * 2);
      if (i === currentIdx) {
        ctx.fillStyle = '#fff';
      } else if (i < currentIdx) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
      }
      ctx.fill();
    }
  }

  return {
    init: init,
    render: render,
    reveal: reveal,

    // Floor cache management
    enterFloor: enterFloor,
    pushFloor: pushFloor,
    popToFloor: popToFloor,
    getFloorStack: getFloorStack,
    getCurrentFloorId: getCurrentFloorId,
    getCurrentDepth: getCurrentDepth,
    clearExplored: clearExplored,
    clearAllFloors: clearAllFloors,

    toggle: toggle,
    isVisible: isVisible
  };
})();

/**
 * MinimapNav — click-to-move pathfinding via the minimap.
 *
 * When the player clicks a revealed tile on the minimap (embedded or
 * expanded), this module:
 *   1. Converts pixel coords → grid coords
 *   2. Runs BFS via Pathfind.find()
 *   3. Feeds the resulting path into MovementController one step at a
 *      time (turn → move → turn → move …)
 *   4. Draws the planned path as dots on the minimap canvas
 *   5. Cancels the path on any manual input (WASD/QE/mouse look)
 *
 * The path queue is consumed by _advance(), called from MC.onMoveFinish.
 * This creates smooth, animated traversal — each step lerps like normal
 * WASD movement. Double-time kicks in automatically at queue depth > 3.
 *
 * Layer 3 (after Player, FloorManager, Minimap, Pathfind, MovementController)
 * Depends on: Minimap, Pathfind, MovementController, FloorManager, Player, TILES
 */
var MinimapNav = (function () {
  'use strict';

  var MC = MovementController;

  // ── State ──────────────────────────────────────────────────────────
  var _active   = false;    // Is an auto-path currently executing?
  var _path     = [];       // Remaining [{x,y}] steps (excluding current pos)
  var _fullPath = [];       // Complete path for overlay drawing
  var _targetX  = -1;
  var _targetY  = -1;

  // ── Grid ↔ pixel conversion cache (set per render frame) ──────────
  var _tileSize = 0;
  var _offsetX  = 0;
  var _offsetY  = 0;
  var _gridW    = 0;
  var _gridH    = 0;

  // ── Callbacks (wired by Game orchestrator) ─────────────────────────
  var _onArrived   = null;   // Called when path completes
  var _onCancelled = null;   // Called when path is cancelled

  // ── Init ───────────────────────────────────────────────────────────

  function init(opts) {
    opts = opts || {};
    _onArrived   = opts.onArrived || null;
    _onCancelled = opts.onCancelled || null;

    // Wire click handler on the minimap canvas
    var canvas = document.getElementById('minimap');
    if (canvas) {
      canvas.style.pointerEvents = 'auto';
      canvas.style.cursor = 'crosshair';
      canvas.addEventListener('click', _onClick);
    }
  }

  // ── Click handler ──────────────────────────────────────────────────

  function _onClick(e) {
    // Don't path during transitions, combat, or dialogue
    if (typeof FloorTransition !== 'undefined' && FloorTransition.isTransitioning()) return;
    if (typeof CombatEngine !== 'undefined' && CombatEngine.isActive()) return;
    if (typeof DialogBox !== 'undefined' && DialogBox.isOpen()) return;
    if (typeof ScreenManager !== 'undefined' && !ScreenManager.isPlaying()) return;

    // Convert click pixel → canvas-local coords
    var rect = e.target.getBoundingClientRect();
    var scaleX = e.target.width / rect.width;
    var scaleY = e.target.height / rect.height;
    var px = (e.clientX - rect.left) * scaleX;
    var py = (e.clientY - rect.top) * scaleY;

    // Check compass hit first — toggle expanded mode
    if (Minimap.hitTestCompass(px, py)) {
      if (Minimap.isExpanded()) {
        Minimap.compassCollapse();
      } else {
        Minimap.compassExpand();
      }
      return;
    }

    var gx = Math.floor((px - _offsetX) / _tileSize);
    var gy = Math.floor((py - _offsetY) / _tileSize);

    // Bounds check
    if (gx < 0 || gx >= _gridW || gy < 0 || gy >= _gridH) return;

    // Must be an explored tile
    var explored = Minimap.getExplored ? Minimap.getExplored() : null;
    if (explored && !explored[gx + ',' + gy]) return;

    // Get floor data
    var floorData = FloorManager.getFloorData();
    if (!floorData) return;

    // Must be a walkable destination (or adjacent to a non-walkable for interaction)
    var destTile = floorData.grid[gy][gx];
    var walkable = TILES.isWalkable(destTile);

    // Get player position
    var pos = MC.getGridPos();

    // Already there?
    if (pos.x === gx && pos.y === gy) return;

    // Run pathfinding
    var path = Pathfind.find(
      floorData.grid, floorData.gridW, floorData.gridH,
      pos.x, pos.y, gx, gy,
      { explored: explored }
    );

    if (!path || path.length < 2) return;

    // If destination isn't walkable, trim the last step (path TO it, stop adjacent)
    if (!walkable && path.length > 1) {
      path.pop();
    }

    // Strip the first element (that's current position)
    path.shift();

    // Start the auto-path
    _path = path;
    _fullPath = path.slice();
    _targetX = path[path.length - 1].x;
    _targetY = path[path.length - 1].y;
    _active = true;

    // Cancel any existing queued movement
    MC.cancelQueued();

    // Push tooltip
    if (typeof StatusBar !== 'undefined' && StatusBar.pushTooltip) {
      StatusBar.pushTooltip('Pathing to (' + _targetX + ',' + _targetY + ')…', 'system');
    }

    // Collapse expanded minimap when path starts (return to embedded size)
    if (Minimap.isExpanded()) {
      Minimap.compassCollapse();
    }

    // Start the first step
    _advance();
  }

  // ── Path execution ─────────────────────────────────────────────────

  /**
   * Advance one step along the path.
   * Called initially and then from MC.onMoveFinish after each step completes.
   */
  function _advance() {
    if (!_active || _path.length === 0) {
      _arrive();
      return;
    }

    var next = _path[0];
    var pos = MC.getGridPos();

    // Calculate required direction to reach next step
    var dx = next.x - pos.x;
    var dy = next.y - pos.y;
    var dir = _deltaToDir(dx, dy);

    if (dir === -1) {
      // Non-adjacent step — shouldn't happen with BFS, but cancel safely
      cancel();
      return;
    }

    // Turn to face the direction if needed
    var curDir = MC.effRot();
    if (curDir !== dir) {
      MC.startTurn(dir);
    }

    // Queue the move
    MC.startMove(dir);

    // Consume this step
    _path.shift();
  }

  /**
   * Convert a dx/dy delta to a direction index.
   * Returns -1 if not a cardinal unit step.
   */
  function _deltaToDir(dx, dy) {
    if (dx === 1 && dy === 0) return 0;  // EAST
    if (dx === 0 && dy === 1) return 1;  // SOUTH
    if (dx === -1 && dy === 0) return 2; // WEST
    if (dx === 0 && dy === -1) return 3; // NORTH
    return -1;
  }

  function _arrive() {
    var wasActive = _active;
    _active = false;
    _path = [];
    _fullPath = [];
    if (wasActive && _onArrived) _onArrived();
  }

  // ── Cancellation ───────────────────────────────────────────────────

  /**
   * Cancel the current auto-path.
   * Called on manual input (WASD/QE), combat start, floor transition, etc.
   */
  function cancel() {
    if (!_active) return;
    _active = false;
    _path = [];
    _fullPath = [];
    MC.cancelQueued();
    if (_onCancelled) _onCancelled();
  }

  function isActive() { return _active; }

  // ── MC callback hook ───────────────────────────────────────────────

  /**
   * Call this from MC.onMoveFinish to advance the path.
   * Game orchestrator wires this in its MC init.
   */
  function onMoveFinish() {
    if (_active && _path.length > 0) {
      _advance();
    } else if (_active && _path.length === 0) {
      _arrive();
    }
  }

  /**
   * Call this from MC.onBump to cancel the path on collision.
   */
  function onBump() {
    if (_active) cancel();
  }

  // ── Minimap overlay ────────────────────────────────────────────────

  /**
   * Update the tile↔pixel conversion parameters.
   * Called by Minimap.render() each frame so click coords stay in sync.
   *
   * @param {number} tileSize
   * @param {number} offsetX
   * @param {number} offsetY
   * @param {number} gridW
   * @param {number} gridH
   */
  function setRenderParams(tileSize, offsetX, offsetY, gridW, gridH) {
    _tileSize = tileSize;
    _offsetX  = offsetX;
    _offsetY  = offsetY;
    _gridW    = gridW;
    _gridH    = gridH;
  }

  /**
   * Draw the planned path on the minimap canvas.
   * Called by Minimap.render() after tiles/enemies/player are drawn.
   *
   * @param {CanvasRenderingContext2D} ctx
   */
  function drawOverlay(ctx) {
    if (!_active || _fullPath.length === 0) return;

    var pos = MC.getGridPos();

    for (var i = 0; i < _fullPath.length; i++) {
      var step = _fullPath[i];

      // Skip steps already passed (behind current position)
      var remaining = false;
      for (var j = 0; j < _path.length; j++) {
        if (_path[j].x === step.x && _path[j].y === step.y) {
          remaining = true;
          break;
        }
      }
      if (!remaining && !(step.x === _targetX && step.y === _targetY)) continue;

      var px = _offsetX + step.x * _tileSize + _tileSize / 2;
      var py = _offsetY + step.y * _tileSize + _tileSize / 2;

      // Target gets a larger marker
      var isTarget = (step.x === _targetX && step.y === _targetY);

      ctx.fillStyle = isTarget ? 'rgba(51,255,136,0.7)' : 'rgba(51,255,136,0.35)';
      ctx.beginPath();
      var r = isTarget ? Math.max(2, _tileSize * 0.4) : Math.max(1, _tileSize * 0.2);
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    init:            init,
    cancel:          cancel,
    isActive:        isActive,
    onMoveFinish:    onMoveFinish,
    onBump:          onBump,
    setRenderParams: setRenderParams,
    drawOverlay:     drawOverlay
  };
})();

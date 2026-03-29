/**
 * MovementController — queued lerp grid movement with input buffering.
 * Ported from dcexjam2025's CrawlerControllerQueued pattern.
 *
 * Architecture:
 *   impulse_queue  — raw input buffered immediately (feels instant)
 *   interp_queue   — validated moves being animated (smooth lerp)
 *
 * The render loop interpolates position between grid cells using
 * easeInOut on a 0→1 progress value (move_offs), driven by delta time.
 *
 * Depends on: TILES (for walkability)
 */
var MovementController = (function () {
  'use strict';

  // ── Timing constants (ms) — tuned from dcexjam2025 ──
  var WALK_TIME      = 500;   // ms per grid step
  var ROT_TIME       = 250;   // ms per 90° turn
  var BUMP_TIME      = 250;   // ms for wall-bump feedback
  var KEY_REPEAT_DELAY = 500; // ms before held key starts repeating
  var KEY_REPEAT_RATE  = 200; // ms between repeats once repeating

  // ── Action types ──
  var ACTION_NONE = 0;
  var ACTION_MOVE = 1;
  var ACTION_ROT  = 2;
  var ACTION_BUMP = 3;

  // ── Cardinal direction system ──
  // Direction indices: 0=EAST, 1=SOUTH, 2=WEST, 3=NORTH
  // Grid convention: +X is east, +Y is south (screen down)
  // Angle convention: 0=east, PI/2=south, PI=west, -PI/2=north
  var DX = [1, 0, -1, 0];
  var DY = [0, 1, 0, -1];
  var DIR_ANGLES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  // Direction to radian angle
  function dirToAngle(dir) {
    return DIR_ANGLES[dir];
  }

  // Radian angle to nearest direction index
  function angleToDir(angle) {
    // Normalize to [0, 2π)
    var a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    // 0→EAST(0), π/2→SOUTH(1), π→WEST(2), 3π/2→NORTH(3)
    var best = 0, bestDist = 999;
    for (var i = 0; i < 4; i++) {
      var ca = ((DIR_ANGLES[i] % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      var diff = Math.abs(a - ca);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDist) { bestDist = diff; best = i; }
    }
    return best;
  }

  // ── Easing ──
  function easeInOut(t, power) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < 0.5) {
      return Math.pow(t * 2, power) / 2;
    }
    return 1 - Math.pow((1 - t) * 2, power) / 2;
  }

  function lerp(t, a, b) {
    return a + (b - a) * t;
  }

  // ── MoveState ──
  function MoveState(posX, posY, rot, actionType, actionDir) {
    this.posX = posX;
    this.posY = posY;
    this.rot = rot;             // direction index 0-3
    this.actionType = actionType;
    this.actionDir = actionDir; // for MOVE: direction index; for ROT: -1 or 1
    this.doubleTime = 0;
    // For bump animation
    this.bumpX = 0;
    this.bumpY = 0;
  }

  // ── Controller state ──
  var _interpQueue = [];    // MoveState[] — confirmed, being animated
  var _impulseQueue = [];   // MoveState[] — pending from input
  var _moveOffs = 0;        // 0→1 animation progress

  // Rendered position (interpolated every frame)
  var _renderX = 0;
  var _renderY = 0;
  var _renderAngle = 0;

  // Grid position (snapped — last completed move)
  var _gridX = 0;
  var _gridY = 0;
  var _gridDir = 1; // default: NORTH

  // Collision callback — set by Game
  var _collisionCheck = null; // function(fromX, fromY, toX, toY, dir) → { blocked, entity }

  // Callbacks
  var _onMoveStart = null;    // function(fromX, fromY, toX, toY, dir)
  var _onMoveFinish = null;   // function(x, y, dir)
  var _onBump = null;         // function(dir)
  var _onTurnFinish = null;   // function(dir)

  // Key repeat tracking
  var _lastActionTime = 0;
  var _lastActionHash = -1;
  var _isRepeating = false;

  // ── Init ──
  function init(opts) {
    _gridX = (opts.x != null) ? opts.x : 0;
    _gridY = (opts.y != null) ? opts.y : 0;
    _gridDir = (opts.dir != null) ? opts.dir : 3;  // default NORTH (dir index 3)
    _renderX = _gridX;
    _renderY = _gridY;
    _renderAngle = dirToAngle(_gridDir);

    _collisionCheck = opts.collisionCheck || null;
    _onMoveStart = opts.onMoveStart || null;
    _onMoveFinish = opts.onMoveFinish || null;
    _onBump = opts.onBump || null;
    _onTurnFinish = opts.onTurnFinish || null;

    _interpQueue = [];
    _impulseQueue = [];
    _moveOffs = 0;
    _lastActionTime = 0;
    _lastActionHash = -1;
    _isRepeating = false;

    // Push initial position onto interp queue
    _interpQueue.push(new MoveState(_gridX, _gridY, _gridDir, ACTION_NONE, 0));
  }

  /** Re-initialize position (e.g., after floor change) without full init */
  function setPosition(x, y, dir) {
    _gridX = x;
    _gridY = y;
    _gridDir = dir;
    _renderX = x;
    _renderY = y;
    _renderAngle = dirToAngle(dir);

    _interpQueue = [new MoveState(x, y, dir, ACTION_NONE, 0)];
    _impulseQueue = [];
    _moveOffs = 0;
  }

  // ── Queue helpers ──
  function _queueTail() {
    if (_impulseQueue.length) return _impulseQueue[_impulseQueue.length - 1];
    return _interpQueue[_interpQueue.length - 1];
  }

  function _queueLength() {
    return _interpQueue.length + _impulseQueue.length;
  }

  /** Effective rotation (accounts for queued turns) */
  function effRot() {
    return _queueTail().rot;
  }

  /** Effective position (accounts for queued moves) */
  function effPos() {
    var cur = _interpQueue[_interpQueue.length - 1];
    var x = cur.posX;
    var y = cur.posY;
    for (var i = 0; i < _impulseQueue.length; i++) {
      if (_impulseQueue[i].actionType === ACTION_MOVE) {
        x += _impulseQueue[i].posX;
        y += _impulseQueue[i].posY;
      }
    }
    return { x: x, y: y };
  }

  // ── Public movement API ──

  /** Queue a move in absolute direction (0-3) */
  function startMove(dir) {
    var tail = _queueTail();
    var dx = DX[dir];
    var dy = DY[dir];

    var impulse = new MoveState(dx, dy, tail.rot, ACTION_MOVE, dir);
    _impulseQueue.push(impulse);

    // Double-time: if queue gets deep with same action, speed up
    if (tail.actionType === ACTION_MOVE && tail.actionDir === dir) {
      var ql = _queueLength();
      if (ql > 3 || (ql === 3 && _moveOffs < 0.5)) {
        tail.doubleTime = 1;
      }
    }
  }

  /**
   * Queue a relative move in player's reference frame.
   * @param {string} rel - 'forward', 'back', 'strafe_left', 'strafe_right'
   */
  function startRelativeMove(rel) {
    var baseDir = effRot();
    var moveDir;
    switch (rel) {
      case 'forward':      moveDir = baseDir; break;
      case 'back':         moveDir = (baseDir + 2) % 4; break;
      case 'strafe_left':  moveDir = (baseDir + 3) % 4; break; // CCW in screen coords
      case 'strafe_right': moveDir = (baseDir + 1) % 4; break; // CW in screen coords
      default: return;
    }
    startMove(moveDir);
  }

  /** Queue a turn to target direction */
  function startTurn(targetDir) {
    targetDir = ((targetDir % 4) + 4) % 4;
    var cur = effRot();
    var drot = targetDir - cur;
    if (drot > 2) drot -= 4;
    else if (drot < -2) drot += 4;

    var sign = drot > 0 ? 1 : -1;
    var impulse = new MoveState(0, 0, targetDir, ACTION_ROT, sign);
    _impulseQueue.push(impulse);
  }

  /** Turn left (counter-clockwise in screen coords) */
  function turnLeft() {
    startTurn((effRot() + 3) % 4); // E→N→W→S
  }

  /** Turn right (clockwise in screen coords) */
  function turnRight() {
    startTurn((effRot() + 1) % 4); // E→S→W→N
  }

  // ── Impulse → Interp promotion ──
  function _startQueuedMove() {
    var cur = _interpQueue[0];
    var impulse = _impulseQueue.splice(0, 1)[0];

    if (impulse.actionType === ACTION_MOVE) {
      var newX = cur.posX + impulse.posX;
      var newY = cur.posY + impulse.posY;
      var dir = impulse.actionDir;

      // Collision check
      var blocked = false;
      var blockedEntity = false;
      if (_collisionCheck) {
        var result = _collisionCheck(cur.posX, cur.posY, newX, newY, dir);
        blocked = result.blocked;
        blockedEntity = result.entity || false;
      }

      if (blocked) {
        // Clear queued impulses on bump
        _impulseQueue.length = 0;
        impulse.doubleTime = 0;

        // Push bump state (animates toward wall then back)
        var bump = new MoveState(cur.posX, cur.posY, cur.rot, ACTION_BUMP, dir);
        bump.doubleTime = impulse.doubleTime;
        bump.bumpX = newX;
        bump.bumpY = newY;
        _interpQueue.push(bump);

        if (_onBump) _onBump(dir);
      } else {
        // Valid move
        var ms = new MoveState(newX, newY, impulse.rot, ACTION_MOVE, dir);
        ms.doubleTime = impulse.doubleTime;
        _interpQueue.push(ms);

        if (_onMoveStart) _onMoveStart(cur.posX, cur.posY, newX, newY, dir);
      }
    } else if (impulse.actionType === ACTION_ROT) {
      // Rotation — just apply
      var ms = new MoveState(cur.posX, cur.posY, impulse.rot, ACTION_ROT, impulse.actionDir);
      ms.doubleTime = impulse.doubleTime;
      _interpQueue.push(ms);
    }
  }

  // ── Tick — advances animation, promotes impulses, fires callbacks ──
  function tick(dt) {
    if (_interpQueue.length === 0) return;

    var easing = 2; // quadratic ease-in-out

    var doOnce = true;
    while (_queueLength() > 1 && (dt > 0 || doOnce)) {
      doOnce = false;

      // Promote impulse if needed
      if (_interpQueue.length === 1 && _impulseQueue.length > 0) {
        _startQueuedMove();
      }
      if (_interpQueue.length < 2) break;

      var cur = _interpQueue[0];
      var next = _interpQueue[1];

      // Determine total animation time for this segment
      var totTime = next.actionType === ACTION_MOVE ? WALK_TIME :
                    next.actionType === ACTION_ROT ? ROT_TIME : BUMP_TIME;

      // Double-time acceleration
      if ((next.doubleTime && _moveOffs > 0.5) || (cur.doubleTime && _moveOffs < 0.5)) {
        totTime /= 2;
        easing = _moveOffs > 0.5 ? next.doubleTime : cur.doubleTime;
      }

      var curTime = _moveOffs * totTime;
      if (curTime + dt >= totTime) {
        // Segment complete
        dt -= (totTime - curTime);
        _moveOffs = 0;
        _interpQueue.splice(0, 1);

        // Fire finish callbacks
        var finished = _interpQueue[0];
        if (next.actionType === ACTION_MOVE) {
          _gridX = finished.posX;
          _gridY = finished.posY;
          _gridDir = finished.rot;
          if (_onMoveFinish) _onMoveFinish(_gridX, _gridY, _gridDir);
        } else if (next.actionType === ACTION_ROT) {
          _gridDir = finished.rot;
          if (_onTurnFinish) _onTurnFinish(_gridDir);
        }
        // Bump: no position change, just visual feedback

        dt = 0; // finish one move per frame
      } else {
        _moveOffs = (curTime + dt) / totTime;
        dt = 0;
      }
    }

    // ── Interpolate render position ──
    var cur = _interpQueue[0];
    if (_interpQueue.length > 1) {
      var next = _interpQueue[1];
      var progress = easeInOut(_moveOffs, easing);

      if (next.actionType === ACTION_MOVE) {
        _renderX = lerp(progress, cur.posX, next.posX);
        _renderY = lerp(progress, cur.posY, next.posY);
      } else if (next.actionType === ACTION_BUMP) {
        // Subtle push toward wall then back (peak at 2.4% offset)
        var p = (1 - Math.abs(1 - progress * 2)) * 0.024;
        _renderX = lerp(p, cur.posX, next.bumpX);
        _renderY = lerp(p, cur.posY, next.bumpY);
      } else {
        _renderX = cur.posX;
        _renderY = cur.posY;
      }

      // Angle interpolation (shortest path)
      var curAngle = dirToAngle(cur.rot);
      var nextAngle = dirToAngle(next.rot);
      if (nextAngle - curAngle > Math.PI) nextAngle -= Math.PI * 2;
      else if (curAngle - nextAngle > Math.PI) nextAngle += Math.PI * 2;
      _renderAngle = lerp(progress, curAngle, nextAngle);
    } else {
      _renderX = cur.posX;
      _renderY = cur.posY;
      _renderAngle = dirToAngle(cur.rot);
    }
  }

  // ── Key repeat system ──
  // Called each frame while a movement key is held.
  // The hash identifies which direction is held (from InputPoll, not from
  // internal dx/dy). This prevents the hash mismatch that caused ice-sliding
  // when relative directions mapped to different absolute dx/dy per facing.

  function checkKeyRepeat(actionHash, nowMs) {
    if (actionHash !== _lastActionHash) {
      // New direction — start tracking, but DON'T fire yet.
      // The downEdge already fired a move for this press.
      // We only allow repeats after the initial delay.
      _lastActionHash = actionHash;
      _lastActionTime = nowMs;
      _isRepeating = false;
      return false;
    }
    var elapsed = nowMs - _lastActionTime;
    if (!_isRepeating) {
      if (elapsed >= KEY_REPEAT_DELAY) {
        _isRepeating = true;
        _lastActionTime = nowMs;
        return true;
      }
      return false;
    }
    // Already repeating
    if (elapsed >= KEY_REPEAT_RATE) {
      _lastActionTime = nowMs;
      return true;
    }
    return false;
  }

  /** Call when a held movement key is released */
  function resetRepeat() {
    _isRepeating = false;
    _lastActionHash = -1;
  }

  // ── Queries ──
  function isAnimating() { return _queueLength() > 1; }
  function isMoving() {
    if (_queueLength() <= 1) return false;
    if (_queueLength() === 2 && _interpQueue.length > 1 &&
        _interpQueue[1].actionType === ACTION_BUMP) return false;
    return true;
  }

  function getRenderPos() { return { x: _renderX, y: _renderY, angle: _renderAngle }; }
  function getGridPos() { return { x: _gridX, y: _gridY, dir: _gridDir }; }
  function getRenderAngle() { return _renderAngle; }

  /** Cancel all queued (unstarted) movements */
  function cancelQueued() {
    _impulseQueue.length = 0;
  }

  /** Cancel everything and snap to current grid position */
  function cancelAll() {
    _impulseQueue.length = 0;
    while (_interpQueue.length > 1) {
      _interpQueue.pop();
    }
    _moveOffs = 0;
  }

  // ── Direction helpers (exported for use by Game) ──
  // exposed constants: 0=EAST, 1=SOUTH, 2=WEST, 3=NORTH
  var DIR_EAST = 0;
  var DIR_SOUTH = 1;
  var DIR_WEST = 2;
  var DIR_NORTH = 3;

  return {
    // Timing constants (readable for tuning)
    WALK_TIME: WALK_TIME,
    ROT_TIME: ROT_TIME,
    BUMP_TIME: BUMP_TIME,
    KEY_REPEAT_DELAY: KEY_REPEAT_DELAY,
    KEY_REPEAT_RATE: KEY_REPEAT_RATE,

    // Direction constants & helpers
    DIR_EAST: DIR_EAST,
    DIR_NORTH: DIR_NORTH,
    DIR_WEST: DIR_WEST,
    DIR_SOUTH: DIR_SOUTH,
    DX: DX,
    DY: DY,
    dirToAngle: dirToAngle,
    angleToDir: angleToDir,
    easeInOut: easeInOut,

    // Core API
    init: init,
    setPosition: setPosition,
    tick: tick,
    startMove: startMove,
    startRelativeMove: startRelativeMove,
    startTurn: startTurn,
    turnLeft: turnLeft,
    turnRight: turnRight,

    // Key repeat
    checkKeyRepeat: checkKeyRepeat,
    resetRepeat: resetRepeat,

    // Queries
    isAnimating: isAnimating,
    isMoving: isMoving,
    getRenderPos: getRenderPos,
    getGridPos: getGridPos,
    getRenderAngle: getRenderAngle,
    effRot: effRot,
    effPos: effPos,

    // Control
    cancelQueued: cancelQueued,
    cancelAll: cancelAll
  };
})();

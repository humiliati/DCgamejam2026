/**
 * InputManager — abstracted input layer.
 * Maps raw device events to game actions.
 *
 * Backends:
 *   - Keyboard (jam)
 *   - Magic Remote (post-jam webOS port)
 *
 * Actions: step_forward, step_back, turn_left, turn_right, strafe_left, strafe_right,
 *          interact, inventory, card_0..card_4, map_toggle, pause, flee
 */
var InputManager = (function () {
  'use strict';

  var _bindings = {};   // action → [handler, handler, ...]
  var _keyMap = {};     // keyCode/key → action
  var _keysDown = {};   // currently held keys
  var _downEdge = {};   // action → true (consumed on read)
  var _upEdge = {};     // action → true (consumed on read)

  // Default keyboard mapping
  var DEFAULT_KEYMAP = {
    'KeyW':       'step_forward',
    'ArrowUp':    'step_forward',
    'KeyS':       'step_back',
    'ArrowDown':  'step_back',
    'KeyA':       'turn_left',
    'ArrowLeft':  'turn_left',
    'KeyD':       'turn_right',
    'ArrowRight': 'turn_right',
    'KeyQ':       'strafe_left',
    'KeyE':       'strafe_right',
    'Space':      'interact',
    'Enter':      'interact',
    'KeyI':       'inventory',
    'KeyM':       'map_toggle',
    'Escape':     'pause',
    'Digit1':     'card_0',
    'Digit2':     'card_1',
    'Digit3':     'card_2',
    'Digit4':     'card_3',
    'Digit5':     'card_4',
    'Period':     'descend',
    'Comma':      'ascend',
    'KeyF':       'flee'
  };

  function init(customKeyMap) {
    _keyMap = customKeyMap || DEFAULT_KEYMAP;

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      _keysDown[e.code] = true;

      var action = _keyMap[e.code];
      if (action) {
        e.preventDefault();
        _downEdge[action] = true;
        _fire(action, 'press');
      }
    });

    window.addEventListener('keyup', function (e) {
      delete _keysDown[e.code];
      var action = _keyMap[e.code];
      if (action) {
        _upEdge[action] = true;
        _fire(action, 'release');
      }
    });

    // Clear all held keys when window loses focus.
    // Without this, a key held during alt-tab or mouse-leave stays
    // "stuck" in _keysDown because the keyup event fires in the
    // other window. The player would slide across the floor on return.
    window.addEventListener('blur', function () {
      _keysDown = {};
      _downEdge = {};
      _upEdge = {};
    });
  }

  /** Register a callback for a game action */
  function on(action, callback) {
    if (!_bindings[action]) _bindings[action] = [];
    _bindings[action].push(callback);
  }

  /** Remove a callback */
  function off(action, callback) {
    if (!_bindings[action]) return;
    _bindings[action] = _bindings[action].filter(function (cb) { return cb !== callback; });
  }

  /** Check if a key mapped to an action is currently held */
  function isDown(action) {
    for (var code in _keyMap) {
      if (_keyMap[code] === action && _keysDown[code]) return true;
    }
    return false;
  }

  function _fire(action, type) {
    var handlers = _bindings[action];
    if (!handlers) return;
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](type); } catch (e) {
        console.error('[Input] handler error:', action, e);
      }
    }
  }

  // ── Magic Remote stub ──────────────────────────────────
  // Post-jam: add pointer position, scroll wheel, gyro events.

  /** Pointer position (Magic Remote / mouse). Updated by backend. */
  var _pointer = { x: 0, y: 0, active: false };

  function getPointer() { return _pointer; }

  function _initMousePointer(canvas) {
    canvas.addEventListener('mousemove', function (e) {
      _pointer.x = e.offsetX;
      _pointer.y = e.offsetY;
      _pointer.active = true;
    });
    canvas.addEventListener('mouseleave', function () {
      _pointer.active = false;
    });
    canvas.addEventListener('click', function (e) {
      _fire('pointer_click', 'press');
    });
  }

  /** Consume a down-edge for an action. Returns true once per press. */
  function downEdge(action) {
    if (_downEdge[action]) {
      delete _downEdge[action];
      return true;
    }
    return false;
  }

  /** Consume an up-edge for an action. Returns true once per release. */
  function upEdge(action) {
    if (_upEdge[action]) {
      delete _upEdge[action];
      return true;
    }
    return false;
  }

  /** Clear all edges (call at end of frame if needed) */
  function clearEdges() {
    _downEdge = {};
    _upEdge = {};
  }

  return {
    init: init,
    on: on,
    off: off,
    isDown: isDown,
    downEdge: downEdge,
    upEdge: upEdge,
    clearEdges: clearEdges,
    getPointer: getPointer,
    initPointer: _initMousePointer
  };
})();

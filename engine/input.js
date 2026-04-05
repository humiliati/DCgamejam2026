/**
 * InputManager — abstracted input layer.
 * Maps raw device events to game actions.
 *
 * Backends:
 *   - Keyboard (jam)
 *   - Gamepad (jam — Standard Gamepad API, Xbox/PS/generic HID)
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
    // 'pause' action = "close / back / menu". Backspace is the PRIMARY binding
    // because browsers reserve Escape for exiting fullscreen and pointer-lock
    // (preventDefault can't override that; it's a hardcoded user-safety escape
    // hatch). Escape stays as a secondary binding for muscle memory when the
    // game is windowed. In fullscreen on Chromium/webOS we additionally call
    // navigator.keyboard.lock(['Escape']) — see _initKeyboardLock() below.
    'Backspace':  'pause',
    'Escape':     'pause',
    'Digit1':     'card_0',
    'Digit2':     'card_1',
    'Digit3':     'card_2',
    'Digit4':     'card_3',
    'Digit5':     'card_4',
    'Period':     'descend',
    'Comma':      'ascend',
    'KeyF':       'flee',
    'Tab':        'tab_focus'
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

    // Scroll wheel → scroll_up / scroll_down actions.
    // Used by: Face 3 volume sliders (fine-grained), Face 2 inventory scroll,
    // Magic Remote scroll wheel (webOS). Not edge-triggered — fires on each tick.
    window.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (e.deltaY < 0) {
        _fire('scroll_up', 'press');
      } else if (e.deltaY > 0) {
        _fire('scroll_down', 'press');
      }
    }, { passive: false });

    // Clear all held keys when window loses focus.
    // Without this, a key held during alt-tab or mouse-leave stays
    // "stuck" in _keysDown because the keyup event fires in the
    // other window. The player would slide across the floor on return.
    window.addEventListener('blur', function () {
      _keysDown = {};
      _downEdge = {};
      _upEdge = {};
    });

    _initKeyboardLock();
  }

  // ── Keyboard Lock API ──────────────────────────────────
  // When we enter fullscreen in Chromium-family browsers (Chrome, Edge, Brave,
  // webOS Chromium), request exclusive capture of Escape so the browser stops
  // treating it as "exit fullscreen" and delivers it as a normal keydown.
  // The browser shows a one-time "Press and hold Esc to exit fullscreen" hint —
  // that's the required user-safety tradeoff and cannot be suppressed.
  //
  // Firefox and Safari do not implement navigator.keyboard.lock; on those
  // browsers Escape continues to exit fullscreen, and players should use the
  // Backspace binding instead. The itch.io embed iframe already carries the
  // `allow="fullscreen"` policy; keyboard-lock inherits it automatically.
  function _initKeyboardLock() {
    if (!(navigator.keyboard && typeof navigator.keyboard.lock === 'function')) {
      return; // unsupported — Backspace rebind is the fallback
    }
    document.addEventListener('fullscreenchange', function () {
      if (document.fullscreenElement) {
        navigator.keyboard.lock(['Escape']).then(function () {
          console.log('[Input] Keyboard lock acquired for Escape (fullscreen)');
        }).catch(function (err) {
          console.warn('[Input] Keyboard lock denied:', err);
        });
      } else {
        // Leaving fullscreen releases the lock automatically, but call
        // unlock() defensively in case the browser kept it.
        if (navigator.keyboard.unlock) navigator.keyboard.unlock();
      }
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

  // ── Gamepad backend ─────────────────────────────────────
  // Standard Gamepad API polling. Reads navigator.getGamepads()
  // each frame and injects into the action system. Works with
  // Xbox, PlayStation, and generic HID controllers.

  var _gpPrevButtons = {};   // idx → true (previous frame button state)
  var _gpPrevAxes = {};      // 'axis_dir' → true (previous frame stick zone)
  var _gpConnected = false;

  // Deadzone for analog sticks (0–1 range)
  var GP_DEADZONE = 0.4;

  // Standard Gamepad button → action mapping
  // https://w3c.github.io/gamepad/#remapping
  // Card hand layout on triggers+bumpers (left→right):
  //   LT(card_0) LB(card_1) [interact] RB(card_3) RT(card_4)
  //   Face X = card_2 (center card)
  var GP_BUTTON_MAP = {
    0:  'interact',       // A / Cross
    1:  'flee',           // B / Circle — flee in combat, back out of menus
    2:  'card_2',         // X / Square — center card
    3:  'inventory',      // Y / Triangle — open inventory
    4:  'card_1',         // LB / L1 — second card from left
    5:  'card_3',         // RB / R1 — second card from right
    6:  'card_0',         // LT / L2 — leftmost card
    7:  'card_4',         // RT / R2 — rightmost card
    8:  'map_toggle',     // Back / Select
    9:  'pause',          // Start / Options
    12: 'step_forward',   // D-pad Up
    13: 'step_back',      // D-pad Down
    14: 'turn_left',      // D-pad Left
    15: 'turn_right'      // D-pad Right
  };

  // Left stick axes → grid actions (with deadzone)
  // Right stick (axes 2+3) → free-look, handled in MouseLook
  var GP_AXIS_MAP = {
    'axis0_neg': 'turn_left',     // Left stick left
    'axis0_pos': 'turn_right',    // Left stick right
    'axis1_neg': 'step_forward',  // Left stick up
    'axis1_pos': 'step_back'      // Left stick down
  };

  // Right stick raw values (updated by pollGamepad, consumed by MouseLook)
  var _gpRightStick = { x: 0, y: 0 };

  /** Get right stick raw analog values for free-look. */
  function getGamepadRightStick() { return _gpRightStick; }

  // Strafe via right stick since bumpers are now cards

  /**
   * Poll connected gamepads. Call once per frame BEFORE InputPoll.poll().
   * Injects edges and held state into the existing action system.
   */
  function pollGamepad() {
    if (!navigator.getGamepads) return;

    var gamepads = navigator.getGamepads();
    var gp = null;

    // Find first connected gamepad
    for (var g = 0; g < gamepads.length; g++) {
      if (gamepads[g] && gamepads[g].connected) {
        gp = gamepads[g];
        break;
      }
    }

    if (!gp) {
      if (_gpConnected) {
        _gpConnected = false;
        console.log('[Input] Gamepad disconnected');
      }
      return;
    }

    if (!_gpConnected) {
      _gpConnected = true;
      console.log('[Input] Gamepad connected: ' + gp.id);
    }

    // ── Buttons ──
    for (var btnIdx in GP_BUTTON_MAP) {
      var bi = parseInt(btnIdx, 10);
      if (bi >= gp.buttons.length) continue;

      var pressed = gp.buttons[bi].pressed;
      var action = GP_BUTTON_MAP[btnIdx];
      var wasPressed = !!_gpPrevButtons[bi];

      if (pressed && !wasPressed) {
        // Down edge
        _downEdge[action] = true;
        _fire(action, 'press');
        // Inject into keysDown so isDown() works for held buttons
        _keysDown['gp_btn_' + bi] = true;
        // Inject into keyMap so isDown(action) lookup works
        _keyMap['gp_btn_' + bi] = action;
      } else if (!pressed && wasPressed) {
        // Up edge
        _upEdge[action] = true;
        _fire(action, 'release');
        delete _keysDown['gp_btn_' + bi];
      }

      _gpPrevButtons[bi] = pressed;
    }

    // ── Left stick axes ──
    for (var axisKey in GP_AXIS_MAP) {
      var parts = axisKey.split('_');
      var axisIdx = parseInt(parts[0].replace('axis', ''), 10);
      var isPos = parts[1] === 'pos';

      if (axisIdx >= gp.axes.length) continue;

      var val = gp.axes[axisIdx];
      var inZone = isPos ? (val > GP_DEADZONE) : (val < -GP_DEADZONE);
      var wasInZone = !!_gpPrevAxes[axisKey];
      var axAction = GP_AXIS_MAP[axisKey];

      if (inZone && !wasInZone) {
        // Entered active zone — edge
        _downEdge[axAction] = true;
        _fire(axAction, 'press');
        _keysDown['gp_' + axisKey] = true;
        _keyMap['gp_' + axisKey] = axAction;
      } else if (!inZone && wasInZone) {
        // Left active zone — release
        _upEdge[axAction] = true;
        _fire(axAction, 'release');
        delete _keysDown['gp_' + axisKey];
      }

      _gpPrevAxes[axisKey] = inZone;
    }

    // ── Right stick → raw analog for free-look (consumed by MouseLook) ──
    if (gp.axes.length >= 4) {
      var rsX = gp.axes[2];
      var rsY = gp.axes[3];
      // Apply deadzone
      _gpRightStick.x = Math.abs(rsX) > GP_DEADZONE ? rsX : 0;
      _gpRightStick.y = Math.abs(rsY) > GP_DEADZONE ? rsY : 0;
    } else {
      _gpRightStick.x = 0;
      _gpRightStick.y = 0;
    }
  }

  // Listen for gamepad connect/disconnect for logging
  window.addEventListener('gamepadconnected', function (e) {
    console.log('[Input] Gamepad connected: ' + e.gamepad.id + ' (' + e.gamepad.buttons.length + ' buttons, ' + e.gamepad.axes.length + ' axes)');
    _gpConnected = true;
  });
  window.addEventListener('gamepaddisconnected', function (e) {
    console.log('[Input] Gamepad disconnected: ' + e.gamepad.id);
    _gpConnected = false;
    _gpPrevButtons = {};
    _gpPrevAxes = {};
  });

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
    initPointer: _initMousePointer,
    pollGamepad: pollGamepad,
    isGamepadConnected: function () { return _gpConnected; },
    getGamepadRightStick: getGamepadRightStick
  };
})();

/**
 * DragDrop — unified pointer-based drag-drop infrastructure.
 *
 * Layer 2 (after HUD, before MenuBox). Provides:
 *   - Drop zone registration (named rectangular regions)
 *   - Drag session management (start → move → drop/cancel)
 *   - Ghost rendering (floating emoji/label at pointer)
 *   - Accept/reject visual feedback (glow/shake)
 *   - Hit testing against registered zones
 *
 * Consumers register zones via registerZone() and start drags
 * via beginDrag(). DragDrop owns the pointer capture and ghost
 * rendering; consumers handle the actual data transfer in their
 * onDrop callbacks.
 *
 * Does NOT depend on InputManager pointer — captures its own
 * pointer events on the shared canvas for drag isolation.
 *
 * @module DragDrop
 */
var DragDrop = (function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────
  var DEAD_ZONE     = 4;     // px before drag activates
  var GHOST_ALPHA   = 0.85;
  var GHOST_SCALE   = 1.1;
  var GHOST_FONT    = '28px monospace';
  var FEEDBACK_MS   = 300;   // accept/reject flash duration
  var LONG_PRESS_MS = 300;   // mobile long-press threshold

  // ── State ────────────────────────────────────────────────────────
  var _canvas = null;
  var _ctx    = null;

  /**
   * Registered drop zones.
   * Map<string, { id, x, y, w, h, accepts, onDrop, onHover, onLeave, active }>
   *
   * accepts: function(payload) → boolean
   * onDrop:  function(payload, zone) → boolean (true = accepted)
   * onHover: function(payload, zone) → void (optional)
   * onLeave: function(zone) → void (optional)
   */
  var _zones = {};

  /**
   * Active drag session (null when idle).
   * {
   *   payload:  { type, zone, index, data }  — what's being dragged
   *   startX, startY:  pointer origin
   *   curX, curY:      current pointer
   *   started:         boolean (past dead zone)
   *   pointerId:       for pointer capture
   *   ghostEmoji:      string emoji to render at pointer
   *   ghostLabel:      string label below emoji
   *   ghostColor:      string fill color for label
   *   sourceZone:      string zone ID the item was dragged from
   *   hoverZone:       string zone ID currently hovered (or null)
   *   onCancel:        function() — called if drag cancelled
   * }
   */
  var _drag = null;

  /**
   * Visual feedback flash.
   * { type: 'accept'|'reject', x, y, t0 }
   */
  var _feedback = null;

  /**
   * Transfer log (exposed for testing).
   * Array of { from, to, payload, timestamp, accepted }
   */
  var _transferLog = [];

  /**
   * Timestamp of last pointer-down that hit a drag zone.
   * Used to suppress click handlers that would interfere.
   */
  var _lastPointerSessionEnd = 0;

  // ── Init ─────────────────────────────────────────────────────────

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');

    canvas.addEventListener('pointerdown',   _onPointerDown,   false);
    canvas.addEventListener('pointermove',   _onPointerMove,   false);
    canvas.addEventListener('pointerup',     _onPointerUp,     false);
    canvas.addEventListener('pointercancel', _onPointerCancel, false);

    // Expose test helpers on window
    if (typeof window !== 'undefined') {
      window.__dragDropTransferLog = _transferLog;
      window.__dragDropState = function () {
        return {
          dragging: _drag !== null,
          drag: _drag ? {
            payload: _drag.payload,
            sourceZone: _drag.sourceZone,
            hoverZone: _drag.hoverZone,
            started: _drag.started
          } : null,
          zones: Object.keys(_zones),
          logLength: _transferLog.length
        };
      };
    }
  }

  // ── Zone Management ──────────────────────────────────────────────

  /**
   * Register a named drop zone.
   * @param {string} id       Unique zone identifier
   * @param {object} opts     { x, y, w, h, accepts, onDrop, onHover, onLeave }
   */
  function registerZone(id, opts) {
    _zones[id] = {
      id:      id,
      x:       opts.x || 0,
      y:       opts.y || 0,
      w:       opts.w || 0,
      h:       opts.h || 0,
      accepts: opts.accepts || function () { return true; },
      onDrop:  opts.onDrop  || function () { return false; },
      onHover: opts.onHover || null,
      onLeave: opts.onLeave || null,
      active:  opts.active !== undefined ? opts.active : true
    };
  }

  /**
   * Update zone bounds (call when layout changes).
   */
  function updateZone(id, bounds) {
    if (!_zones[id]) return;
    if (bounds.x !== undefined) _zones[id].x = bounds.x;
    if (bounds.y !== undefined) _zones[id].y = bounds.y;
    if (bounds.w !== undefined) _zones[id].w = bounds.w;
    if (bounds.h !== undefined) _zones[id].h = bounds.h;
  }

  /**
   * Enable or disable a zone.
   */
  function setZoneActive(id, active) {
    if (_zones[id]) _zones[id].active = active;
  }

  /**
   * Remove a registered zone.
   */
  function removeZone(id) {
    // If we're hovering this zone during a drag, clear hover
    if (_drag && _drag.hoverZone === id) {
      _drag.hoverZone = null;
    }
    delete _zones[id];
  }

  /**
   * Remove all zones (call on screen transition).
   */
  function clearZones() {
    _zones = {};
    if (_drag) {
      _drag.hoverZone = null;
    }
  }

  // ── Drag Session ─────────────────────────────────────────────────

  /**
   * Start a drag programmatically from a consumer module.
   *
   * @param {object} payload    { type, zone, index, data }
   * @param {object} opts       { ghostEmoji, ghostLabel, ghostColor, sourceZone, onCancel }
   * @param {number} x          Pointer x at drag start
   * @param {number} y          Pointer y at drag start
   */
  function beginDrag(payload, opts, x, y) {
    if (_drag) cancelDrag();

    _drag = {
      payload:    payload,
      startX:     x,
      startY:     y,
      curX:       x,
      curY:       y,
      started:    true,  // Programmatic drags skip dead zone
      pointerId:  null,
      ghostEmoji: (opts && opts.ghostEmoji) || '📦',
      ghostLabel: (opts && opts.ghostLabel) || '',
      ghostColor: (opts && opts.ghostColor) || '#fff',
      sourceZone: (opts && opts.sourceZone) || '',
      hoverZone:  null,
      onCancel:   (opts && opts.onCancel) || null
    };
  }

  /**
   * Update drag position externally (if not using pointer capture).
   */
  function updateDragPos(x, y) {
    if (!_drag) return;
    _drag.curX = x;
    _drag.curY = y;
    _updateHover(x, y);
  }

  /**
   * Complete drag at current position.
   */
  function completeDrag() {
    if (!_drag || !_drag.started) {
      cancelDrag();
      return;
    }
    _tryDrop(_drag.curX, _drag.curY);
  }

  /**
   * Cancel active drag.
   */
  function cancelDrag() {
    if (!_drag) return;
    if (_drag.hoverZone && _zones[_drag.hoverZone] && _zones[_drag.hoverZone].onLeave) {
      _zones[_drag.hoverZone].onLeave(_zones[_drag.hoverZone]);
    }
    if (_drag.onCancel) _drag.onCancel();
    _drag = null;
  }

  /**
   * Is a drag currently active?
   */
  function isDragging() {
    return _drag !== null && _drag.started;
  }

  /**
   * Get current drag payload (or null).
   */
  function getDragPayload() {
    return _drag ? _drag.payload : null;
  }

  // ── Pointer Event Handlers ───────────────────────────────────────

  function _onPointerDown(e) {
    // Don't start new pointer drags if a programmatic drag is active
    if (_drag && _drag.started) return;

    var rect = _canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (_canvas.width / rect.width);
    var y = (e.clientY - rect.top) * (_canvas.height / rect.height);

    // Check if pointer landed on a source zone (has dragPayload)
    var keys = Object.keys(_zones);
    for (var i = 0; i < keys.length; i++) {
      var z = _zones[keys[i]];
      if (!z.active) continue;
      if (!z.dragPayload) continue;  // Not a drag source
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) {
        var payload = typeof z.dragPayload === 'function' ? z.dragPayload() : z.dragPayload;
        if (!payload) continue;
        _drag = {
          payload:    payload,
          startX:     x,
          startY:     y,
          curX:       x,
          curY:       y,
          started:    false,  // Wait for dead zone
          pointerId:  e.pointerId || null,
          ghostEmoji: payload.emoji || (payload.data && payload.data.emoji) || '\uD83D\uDCE6',
          ghostLabel: payload.label || (payload.data && payload.data.name) || '',
          ghostColor: '#fff',
          sourceZone: z.id,
          hoverZone:  null,
          onCancel:   z.onDragCancel || null
        };
        // Prevent text selection / default pointer behavior during drag
        e.preventDefault();
        return;
      }
    }
  }

  function _onPointerMove(e) {
    if (!_drag) return;

    var rect = _canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (_canvas.width / rect.width);
    var y = (e.clientY - rect.top) * (_canvas.height / rect.height);

    _drag.curX = x;
    _drag.curY = y;

    if (!_drag.started) {
      var dx = x - _drag.startX;
      var dy = y - _drag.startY;
      if (Math.sqrt(dx * dx + dy * dy) >= DEAD_ZONE) {
        _drag.started = true;
      }
      return;
    }

    _updateHover(x, y);
  }

  function _onPointerUp(e) {
    if (!_drag) return;

    var rect = _canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (_canvas.width / rect.width);
    var y = (e.clientY - rect.top) * (_canvas.height / rect.height);

    if (!_drag.started) {
      // Was a tap, not a drag — fire tap callback if zone has one
      _lastPointerSessionEnd = Date.now();
      var tapZone = _drag.sourceZone ? _zones[_drag.sourceZone] : null;
      var tapPayload = _drag.payload;
      _drag = null;
      if (tapZone && tapZone.onTap) {
        tapZone.onTap(tapPayload);
      }
      return;
    }

    _tryDrop(x, y);
  }

  function _onPointerCancel() {
    cancelDrag();
  }

  // ── Hit Testing ──────────────────────────────────────────────────

  function _updateHover(x, y) {
    if (!_drag) return;

    var oldHover = _drag.hoverZone;
    var newHover = _hitTestZone(x, y);

    // Filter: can't drop on own zone, must accept payload
    if (newHover) {
      var zone = _zones[newHover];
      if (!zone.active || !zone.accepts(_drag.payload)) {
        newHover = null;
      }
    }

    if (oldHover !== newHover) {
      // Leave old
      if (oldHover && _zones[oldHover] && _zones[oldHover].onLeave) {
        _zones[oldHover].onLeave(_zones[oldHover]);
      }
      // Enter new
      if (newHover && _zones[newHover] && _zones[newHover].onHover) {
        _zones[newHover].onHover(_drag.payload, _zones[newHover]);
      }
      _drag.hoverZone = newHover;
    }
  }

  /**
   * Find which zone contains (x, y).
   */
  function _hitTestZone(x, y) {
    var keys = Object.keys(_zones);
    for (var i = 0; i < keys.length; i++) {
      var z = _zones[keys[i]];
      if (!z.active) continue;
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) {
        return z.id;
      }
    }
    return null;
  }

  /**
   * Public hit test: which zone is at (x, y)?
   */
  function hitTest(x, y) {
    return _hitTestZone(x, y);
  }

  // ── Drop Resolution ──────────────────────────────────────────────

  function _tryDrop(x, y) {
    if (!_drag) return;

    var zoneId = _drag.hoverZone || _hitTestZone(x, y);
    var accepted = false;

    if (zoneId && _zones[zoneId]) {
      var zone = _zones[zoneId];
      if (zone.active && zone.accepts(_drag.payload)) {
        accepted = zone.onDrop(_drag.payload, zone);
      }
    }

    // Log transfer
    _transferLog.push({
      from:      _drag.sourceZone,
      to:        zoneId || '(none)',
      payload:   _drag.payload,
      timestamp: Date.now(),
      accepted:  accepted
    });

    // Visual feedback
    if (accepted) {
      _feedback = { type: 'accept', x: x, y: y, t0: Date.now() };
    } else if (zoneId) {
      _feedback = { type: 'reject', x: x, y: y, t0: Date.now() };
    }

    // Leave hover zone
    if (_drag.hoverZone && _zones[_drag.hoverZone] && _zones[_drag.hoverZone].onLeave) {
      _zones[_drag.hoverZone].onLeave(_zones[_drag.hoverZone]);
    }

    // If rejected and there's a cancel callback, call it to restore
    if (!accepted && _drag.onCancel) {
      _drag.onCancel();
    }

    _drag = null;
  }

  // ── Rendering ────────────────────────────────────────────────────

  /**
   * Render the drag ghost and feedback effects.
   * Call from the main render loop after all other UI.
   *
   * @param {CanvasRenderingContext2D} ctx
   */
  function render(ctx) {
    var c = ctx || _ctx;
    if (!c) return;

    // ── Ghost ──
    if (_drag && _drag.started) {
      c.save();
      c.globalAlpha = GHOST_ALPHA;
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      // Emoji ghost
      c.font = GHOST_FONT;
      c.fillText(_drag.ghostEmoji, _drag.curX, _drag.curY - 8);

      // Label below
      if (_drag.ghostLabel) {
        c.font = '12px monospace';
        c.fillStyle = _drag.ghostColor;
        c.fillText(_drag.ghostLabel, _drag.curX, _drag.curY + 20);
      }

      // Hover zone highlight
      if (_drag.hoverZone && _zones[_drag.hoverZone]) {
        var hz = _zones[_drag.hoverZone];
        c.globalAlpha = 0.15;
        c.fillStyle = '#0f0';
        c.fillRect(hz.x, hz.y, hz.w, hz.h);
        c.globalAlpha = 0.6;
        c.strokeStyle = '#0f0';
        c.lineWidth = 2;
        c.strokeRect(hz.x, hz.y, hz.w, hz.h);
      }

      c.restore();
    }

    // ── Feedback flash ──
    if (_feedback) {
      var elapsed = Date.now() - _feedback.t0;
      if (elapsed > FEEDBACK_MS) {
        _feedback = null;
      } else {
        var alpha = 1 - (elapsed / FEEDBACK_MS);
        c.save();
        c.globalAlpha = alpha * 0.4;

        if (_feedback.type === 'accept') {
          c.fillStyle = '#0f0';
          c.beginPath();
          c.arc(_feedback.x, _feedback.y, 20 + elapsed * 0.05, 0, Math.PI * 2);
          c.fill();
        } else {
          // Reject shake — red X
          c.fillStyle = '#f00';
          c.font = '24px monospace';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          var shake = Math.sin(elapsed * 0.05) * 4;
          c.fillText('✗', _feedback.x + shake, _feedback.y);
        }

        c.restore();
      }
    }
  }

  /**
   * Render zone debug outlines (for test launcher).
   */
  function renderDebug(ctx) {
    var c = ctx || _ctx;
    if (!c) return;

    c.save();
    c.globalAlpha = 0.3;
    c.lineWidth = 1;
    c.font = '10px monospace';
    c.textAlign = 'left';
    c.textBaseline = 'top';

    var keys = Object.keys(_zones);
    for (var i = 0; i < keys.length; i++) {
      var z = _zones[keys[i]];
      c.strokeStyle = z.active ? '#0ff' : '#666';
      c.strokeRect(z.x, z.y, z.w, z.h);
      c.fillStyle = z.active ? '#0ff' : '#666';
      c.fillText(z.id, z.x + 2, z.y + 2);
    }
    c.restore();
  }

  // ── Utilities ────────────────────────────────────────────────────

  /**
   * Get transfer log (for testing/debugging).
   */
  function getTransferLog() {
    return _transferLog.slice();
  }

  /**
   * Clear transfer log.
   */
  function clearTransferLog() {
    _transferLog.length = 0;
  }

  /**
   * Get all registered zone IDs.
   */
  function getZoneIds() {
    return Object.keys(_zones);
  }

  /**
   * Get zone info by ID.
   */
  function getZone(id) {
    return _zones[id] || null;
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    init:            init,

    // Zone management
    registerZone:    registerZone,
    updateZone:      updateZone,
    setZoneActive:   setZoneActive,
    removeZone:      removeZone,
    clearZones:      clearZones,
    getZoneIds:      getZoneIds,
    getZone:         getZone,

    // Drag session
    beginDrag:       beginDrag,
    updateDragPos:   updateDragPos,
    completeDrag:    completeDrag,
    cancelDrag:      cancelDrag,
    isDragging:      isDragging,
    getDragPayload:  getDragPayload,

    // Hit testing
    hitTest:         hitTest,

    // Rendering
    render:          render,
    renderDebug:     renderDebug,

    // Logging / testing
    getTransferLog:  getTransferLog,
    clearTransferLog: clearTransferLog,

    /**
     * Returns true if a pointer session (drag attempt) ended within
     * the last `ms` milliseconds. Use to suppress click handlers
     * that fire alongside drag events.
     * @param {number} [ms=100]
     */
    wasRecentPointerSession: function (ms) {
      return (Date.now() - _lastPointerSessionEnd) < (ms || 100);
    }
  };
})();

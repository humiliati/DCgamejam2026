/**
 * GameLoop — requestAnimationFrame game loop with fixed-timestep ticks.
 * Extracted from EyesOnly (Phase 26), adapted for dungeon crawler.
 *
 * Separates update (fixed 100ms ticks) from render (every frame).
 */
var GameLoop = (function () {
  'use strict';

  var _active = false;
  var _frameId = null;
  var _lastTime = 0;
  var _tickInterval = 100; // ms between game ticks (10 tps)
  var _accumulator = 0;

  var _onTick = null;   // Called each game tick with deltaMs
  var _onRender = null;  // Called each animation frame with interpolation factor
  var _onStart = null;

  function init(opts) {
    _onTick = opts.onTick || null;
    _onRender = opts.onRender || null;
    _onStart = opts.onStart || null;
    if (opts.tickInterval) _tickInterval = opts.tickInterval;
  }

  function start() {
    if (_active) return;
    _active = true;
    _lastTime = performance.now();
    _accumulator = 0;
    if (_onStart) _onStart();
    _loop(performance.now());
  }

  function stop() {
    _active = false;
    if (_frameId) {
      cancelAnimationFrame(_frameId);
      _frameId = null;
    }
  }

  function isRunning() { return _active; }

  function _loop(now) {
    if (!_active) return;

    var delta = now - _lastTime;
    _lastTime = now;

    // Clamp delta to prevent spiral of death after tab-away
    if (delta > 500) delta = 500;

    _accumulator += delta;

    // Fixed timestep ticks
    while (_accumulator >= _tickInterval) {
      try {
        if (_onTick) _onTick(_tickInterval);
      } catch (e) {
        console.error('[GameLoop] tick error:', e);
      }
      _accumulator -= _tickInterval;
    }

    // Render every frame with interpolation factor (0-1)
    var alpha = _accumulator / _tickInterval;
    try {
      if (_onRender) _onRender(alpha);
    } catch (e) {
      console.error('[GameLoop] render error:', e);
    }

    _frameId = requestAnimationFrame(_loop);
  }

  return { init: init, start: start, stop: stop, isRunning: isRunning };
})();

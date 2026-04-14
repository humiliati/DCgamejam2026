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

    // Per-frame probe handle (cached once; null if perf monitor inactive).
    // Two null checks per phase = microsecond overhead when off.
    var _dpm = (typeof DebugPerfMonitor !== 'undefined')
      ? DebugPerfMonitor.probe : null;

    var delta = now - _lastTime;
    _lastTime = now;

    // Clamp delta to prevent spiral of death after tab-away
    if (delta > 500) delta = 500;

    _accumulator += delta;

    // Fixed timestep ticks (10Hz AI / game logic bucket)
    while (_accumulator >= _tickInterval) {
      try {
        if (_dpm) _dpm.begin('GameLoop.aiTick');
        if (_onTick) _onTick(_tickInterval);
        if (_dpm) _dpm.end('GameLoop.aiTick');
      } catch (e) {
        if (_dpm) _dpm.end('GameLoop.aiTick');
        console.error('[GameLoop] tick error:', e);
      }
      _accumulator -= _tickInterval;
    }

    // Render every frame with interpolation factor (0-1)
    var alpha = _accumulator / _tickInterval;
    try {
      if (_dpm) _dpm.begin('GameLoop.render');
      if (_onRender) _onRender(alpha);
      if (_dpm) _dpm.end('GameLoop.render');
    } catch (e) {
      if (_dpm) _dpm.end('GameLoop.render');
      console.error('[GameLoop] render error:', e);
    }

    _frameId = requestAnimationFrame(_loop);
  }

  return { init: init, start: start, stop: stop, isRunning: isRunning };
})();

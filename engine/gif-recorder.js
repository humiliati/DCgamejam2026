/**
 * GifRecorder — modular GIF capture for debugging/prototyping.
 *
 * Uses gif.js (worker-based encoder) to export a GIF from the current canvas.
 * Supports:
 *  - manual start/stop recording
 *  - rolling buffer ("save last N seconds")
 *
 * Hotkeys (default):
 *  - F8  toggle manual record
 *  - F9  save last N seconds from rolling buffer
 */
var GifRecorder = (function () {
  'use strict';

  var _canvas = null;
  var _enabled = false;

  // Capture settings
  var _fps = 12;
  var _delayMs = 83; // ~12 fps
  var _maxWidth = 480; // downscale for manageable GIFs
  var _quality = 10;
  var _workers = 2;
  var _rollingSeconds = 6;
  var _rollingEnabled = true;

  // Rolling buffer frames: [{ imageData, w, h, t }]
  var _buffer = [];
  var _bufferMaxFrames = 72;

  // Manual recording frames
  var _recording = false;
  var _frames = [];
  var _recordStartT = 0;

  // Console capture (ring buffer)
  var _captureConsole = true;
  var _consoleMaxSeconds = 30;
  var _consoleBuf = []; // [{t, level, argsText}]
  var _consoleInstalled = false;
  var _consoleOrig = null;

  // Internal capture canvas
  var _cap = null;
  var _capCtx = null;

  var _captureTimer = 0;

  // Blob URL for worker script (created lazily). Allows GIF encoding on
  // file:// protocol where new Worker('path.js') throws SecurityError.
  var _workerBlobUrl = null;

  function init(canvas, opts) {
    _canvas = canvas;
    opts = opts || {};

    if (opts.fps) _fps = clamp(opts.fps, 2, 30);
    _delayMs = Math.round(1000 / _fps);

    if (opts.maxWidth) _maxWidth = clamp(opts.maxWidth, 120, 2000);
    if (opts.quality) _quality = clamp(opts.quality, 1, 30);
    if (opts.workers) _workers = clamp(opts.workers, 1, 8);

    if (typeof opts.rollingSeconds === 'number') _rollingSeconds = clamp(opts.rollingSeconds, 1, 30);
    if (typeof opts.rollingEnabled === 'boolean') _rollingEnabled = opts.rollingEnabled;

    if (typeof opts.captureConsole === 'boolean') _captureConsole = opts.captureConsole;
    if (typeof opts.consoleMaxSeconds === 'number') _consoleMaxSeconds = clamp(opts.consoleMaxSeconds, 5, 300);

    _bufferMaxFrames = Math.max(1, Math.round(_rollingSeconds * _fps));

    _cap = document.createElement('canvas');
    _capCtx = _cap.getContext('2d', { willReadFrequently: true });

    _enabled = true;

    if (_captureConsole) _installConsoleCapture();

    // Hotkeys — keep this module self-contained.
    window.addEventListener('keydown', _onKeyDown);

    console.log('[GifRecorder] ready', {
      fps: _fps,
      delayMs: _delayMs,
      maxWidth: _maxWidth,
      rollingSeconds: _rollingSeconds,
      bufferMaxFrames: _bufferMaxFrames,
      captureConsole: _captureConsole,
      consoleMaxSeconds: _consoleMaxSeconds
    });
  }

  function shutdown() {
    if (!_enabled) return;
    window.removeEventListener('keydown', _onKeyDown);
    if (_consoleInstalled) _uninstallConsoleCapture();
    _enabled = false;
    _recording = false;
    _frames = [];
    _buffer = [];
    _consoleBuf = [];
  }

  function isRecording() { return _recording; }

  function setRolling(enabled, seconds) {
    _rollingEnabled = !!enabled;
    if (typeof seconds === 'number') {
      _rollingSeconds = clamp(seconds, 1, 60);
      _bufferMaxFrames = Math.max(1, Math.round(_rollingSeconds * _fps));
    }
  }

  function toggleRecord() {
    if (!_enabled) return;
    if (_recording) stop();
    else start();
  }

  function start() {
    if (!_enabled) return;
    _recording = true;
    _recordStartT = performance.now();
    _frames = [];
    console.log('[GifRecorder] recording started');
  }

  function stop() {
    if (!_enabled) return;
    _recording = false;
    var endT = performance.now();
    if (_frames.length === 0) {
      console.log('[GifRecorder] recording stopped (no frames)');
      return;
    }
    console.log('[GifRecorder] recording stopped; encoding', { frames: _frames.length });
    _encodeFrames(_frames.slice(), 'manual', _recordStartT, endT);
  }

  function saveLast(seconds) {
    if (!_enabled) return;
    seconds = (typeof seconds === 'number') ? seconds : _rollingSeconds;
    var want = Math.max(1, Math.round(seconds * _fps));
    var frames = _buffer.slice(Math.max(0, _buffer.length - want));
    if (frames.length === 0) {
      console.log('[GifRecorder] rolling buffer empty');
      return;
    }
    var endT = performance.now();
    var startT = endT - (seconds * 1000);
    console.log('[GifRecorder] encoding last seconds', { seconds: seconds, frames: frames.length });
    _encodeFrames(frames, 'last' + seconds + 's', startT, endT);
  }

  /** Called from render loop; pass frame delta (ms). */
  function tick(dtMs) {
    if (!_enabled || !_canvas) return;

    _captureTimer += dtMs;
    if (_captureTimer < _delayMs) return;
    _captureTimer -= _delayMs;

    var snap = _snapshot();
    if (!snap) return;

    if (_rollingEnabled) {
      _buffer.push(snap);
      if (_buffer.length > _bufferMaxFrames) {
        _buffer.splice(0, _buffer.length - _bufferMaxFrames);
      }
    }

    if (_recording) {
      _frames.push(snap);
    }
  }

  // --- internals ---

  function _snapshot() {
    try {
      var srcW = _canvas.width;
      var srcH = _canvas.height;
      if (!srcW || !srcH) return null;

      var scale = 1;
      if (srcW > _maxWidth) scale = _maxWidth / srcW;

      var w = Math.max(1, Math.round(srcW * scale));
      var h = Math.max(1, Math.round(srcH * scale));

      if (_cap.width !== w) _cap.width = w;
      if (_cap.height !== h) _cap.height = h;

      _capCtx.clearRect(0, 0, w, h);
      _capCtx.drawImage(_canvas, 0, 0, w, h);

      var imageData = _capCtx.getImageData(0, 0, w, h);
      return { imageData: imageData, w: w, h: h, t: performance.now() };
    } catch (e) {
      // If the canvas becomes tainted (cross-origin draw), getImageData throws.
      // Auto-disable to stop spamming the console every frame.
      if (e.name === 'SecurityError') {
        console.warn('[GifRecorder] Canvas tainted — auto-disabling gif capture.');
        _enabled = false;
      } else {
        console.warn('[GifRecorder] snapshot failed:', e);
      }
      return null;
    }
  }

  function _encodeFrames(frames, tag, logsStartT, logsEndT) {
    if (typeof GIF === 'undefined') {
      console.error('[GifRecorder] GIF library not loaded. Ensure engine/vendor/gif.js is included.');
      return;
    }

    // Find first valid frame
    var first = null;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i] && frames[i].imageData) { first = frames[i]; break; }
    }
    if (!first) {
      console.error('[GifRecorder] no frames to encode');
      return;
    }

    // On file:// protocol, new Worker('path.js') throws SecurityError
    // because file:// URLs don't satisfy same-origin. Work around this by
    // reading the worker script source via sync XHR, wrapping it in a
    // Blob URL, and passing that as workerScript. Blob URLs are always
    // same-origin. The Blob URL is cached — built once, reused forever.
    if (!_workerBlobUrl) {
      try {
        _workerBlobUrl = _buildWorkerBlobUrl();
      } catch (blobErr) {
        console.warn('[GifRecorder] Could not create worker Blob URL:', blobErr);
      }
    }
    var workerScript = _workerBlobUrl || 'engine/vendor/gif.worker.js';

    var gif = new GIF({
      workers: _workers,
      quality: _quality,
      width: first.w,
      height: first.h,
      workerScript: workerScript,
      repeat: 0
    });

    gif.on('progress', function (p) {
      // p is 0..1
      if (p === 0) return;
      if (p === 1) return;
      if (Math.random() < 0.08) console.log('[GifRecorder] encoding…', Math.round(p * 100) + '%');
    });

    gif.on('finished', function (blob) {
      try {
        var baseName = _filenameBase(tag);

        // Save GIF
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = baseName + '.gif';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 15000);

        // Save parallel console log snapshot
        if (_captureConsole) {
          _downloadConsoleLog(baseName + '.console.txt', logsStartT, logsEndT);
        }

        console.log('[GifRecorder] saved', baseName + '.gif', { bytes: blob.size });
      } catch (e) {
        console.error('[GifRecorder] finished handler error:', e);
      }
    });

    // Add frames
    for (var j = 0; j < frames.length; j++) {
      var fr = frames[j];
      if (!fr || !fr.imageData) continue;
      gif.addFrame(fr.imageData, { delay: _delayMs, copy: true });
    }

    gif.render();
  }

  function _filenameBase(tag) {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var ts = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
    return 'dungeon-gleaner_' + tag + '_' + ts;
  }

  function _onKeyDown(e) {
    // Avoid interfering with typing in inputs/textareas
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;

    if (e.code === 'F8') {
      e.preventDefault();
      toggleRecord();
    }

    if (e.code === 'F9') {
      e.preventDefault();
      saveLast(_rollingSeconds);
    }
  }

  function _installConsoleCapture() {
    if (_consoleInstalled) return;
    _consoleInstalled = true;

    _consoleOrig = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    function wrap(level) {
      return function () {
        try {
          _pushConsole(level, arguments);
        } catch (_) {}
        // Call original
        try {
          return _consoleOrig[level].apply(console, arguments);
        } catch (e) {
          // If console method missing, fallback
          return _consoleOrig.log.apply(console, arguments);
        }
      };
    }

    console.log = wrap('log');
    console.info = wrap('info');
    console.warn = wrap('warn');
    console.error = wrap('error');
    console.debug = wrap('debug');
  }

  function _uninstallConsoleCapture() {
    if (!_consoleInstalled || !_consoleOrig) return;
    console.log = _consoleOrig.log;
    console.info = _consoleOrig.info;
    console.warn = _consoleOrig.warn;
    console.error = _consoleOrig.error;
    console.debug = _consoleOrig.debug;
    _consoleInstalled = false;
    _consoleOrig = null;
  }

  function _pushConsole(level, argsLike) {
    var t = performance.now();
    var text = _argsToText(argsLike);
    _consoleBuf.push({ t: t, level: level, text: text });

    // Ring buffer by time window
    var cutoff = t - (_consoleMaxSeconds * 1000);
    while (_consoleBuf.length && _consoleBuf[0].t < cutoff) {
      _consoleBuf.shift();
    }
  }

  function _argsToText(argsLike) {
    var out = [];
    for (var i = 0; i < argsLike.length; i++) {
      var a = argsLike[i];
      if (typeof a === 'string') out.push(a);
      else {
        try {
          out.push(JSON.stringify(a));
        } catch (_) {
          out.push(String(a));
        }
      }
    }
    return out.join(' ');
  }

  function _downloadConsoleLog(filename, startT, endT) {
    try {
      var now = performance.now();
      if (typeof startT !== 'number') startT = now - (_rollingSeconds * 1000);
      if (typeof endT !== 'number') endT = now;

      var lines = [];
      lines.push('Dungeon Gleaner - console snapshot');
      lines.push('window: ' + Math.round(startT) + 'ms .. ' + Math.round(endT) + 'ms (performance.now)');
      lines.push('---');

      for (var i = 0; i < _consoleBuf.length; i++) {
        var e = _consoleBuf[i];
        if (e.t < startT || e.t > endT) continue;
        lines.push('[' + Math.round(e.t) + 'ms] [' + e.level + '] ' + e.text);
      }

      if (lines.length <= 3) {
        lines.push('(no console lines captured in window)');
      }

      var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 15000);
    } catch (e2) {
      // Use original console to avoid infinite recursion
      try {
        if (_consoleOrig && _consoleOrig.error) _consoleOrig.error('[GifRecorder] log download failed:', e2);
      } catch (_) {}
    }
  }

  /**
   * Build a Blob URL containing the gif.worker.js source.
   * Uses synchronous XHR to read the script text, wraps it in a Blob,
   * and returns a URL.createObjectURL. This sidesteps the Worker
   * same-origin restriction on file:// protocol — Blob URLs are always
   * considered same-origin.
   *
   * Synchronous XHR to file:// works in Chromium/Brave (same-origin
   * file access). Workers from file:// paths do not.
   */
  function _buildWorkerBlobUrl() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'engine/vendor/gif.worker.js', false); // synchronous
    xhr.send();
    if (xhr.status !== 200 && xhr.status !== 0) {
      // status 0 is normal for file:// protocol success
      throw new Error('XHR status ' + xhr.status);
    }
    var src = xhr.responseText;
    if (!src || src.length < 100) {
      throw new Error('Worker source too short (' + (src ? src.length : 0) + ')');
    }
    var blob = new Blob([src], { type: 'application/javascript' });
    var url = URL.createObjectURL(blob);
    console.log('[GifRecorder] created worker Blob URL (' + src.length + ' bytes)');
    return url;
  }

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) return lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  return {
    init: init,
    shutdown: shutdown,
    tick: tick,
    isRecording: isRecording,
    toggleRecord: toggleRecord,
    start: start,
    stop: stop,
    saveLast: saveLast,
    setRolling: setRolling
  };
})();

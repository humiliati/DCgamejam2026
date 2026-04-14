/**
 * DebugPerfMonitor — in-game resource tracker for diagnosing FPS drops.
 *
 * Layer 5 (dev-only). Design language matches `tools/boxforge.html`'s
 * Resource Monitor HUD: a compact, corner-pinned panel with cyan/amber/
 * red thresholds and a rolling history window.
 *
 * Activated by DebugBoot when the URL contains `perfMon=1`. Fully inert
 * otherwise — safe to leave loaded in production builds.
 *
 * ── What it tracks ──────────────────────────────────────────────────
 *   Frame:    current fps, 10s rolling avg, 10s rolling min,
 *             frame time ms, worst frame in window, stutter counter
 *             (frames > 33ms in last 10 seconds)
 *   Probes:   per-subsystem wall-clock timing (ms/frame) for every
 *             module's draw/render/tick/update/etc method. Sorted
 *             descending so the hot subsystem bubbles to the top of
 *             the panel. This is how you find the drag.
 *   Events:   mousemove/pointermove/wheel/keydown/touchmove rates —
 *             catches runaway handlers (e.g. free look mousemove).
 *   Scene:    floor id, enemy count, particle count, grid WxH
 *   Deltas:   Δenemies/s, Δparticles/s, Δdom/s — catches leaks that
 *             manifest as "starts at 4fps, smooths to 8fps, 12fps..."
 *   DOM:      element count, active CSS animations, canvas resolution
 *   Heap:     usedJSHeapSize (Chromium only; falls back to "n/a")
 *
 * ── Stutter log ─────────────────────────────────────────────────────
 * Every frame > 33ms (dropped below 30fps) records a timestamped entry
 * with the current floor id and enemy count. The last 8 entries are
 * pinned in the panel so you can correlate stutters to scene changes
 * or specific rooms.
 *
 * ── Entry capture (warmup diagnosis) ────────────────────────────────
 * When the floor id changes, a "first 60 frames" capture window arms.
 * Each frame records per-probe timing. Dumped at the end of
 * copyReport(). This catches the textbook "20 second warmup cliff"
 * pattern where the first few seconds after a floor load are much
 * slower than steady-state — you can see exactly which subsystem is
 * heavy during that window vs after.
 *
 * ── How subsystems get instrumented ─────────────────────────────────
 * instrumentEngine() walks a known list of module globals and wraps
 * their hot methods. For unfrozen modules it monkey-patches in place.
 * For frozen modules (IIFE Object.freeze) it builds an unfrozen shim
 * copy and replaces the global reference — call sites that look up
 * ModuleName.method() at call time hit the shim and get timed.
 *
 * ── Why update cadences differ ──────────────────────────────────────
 * The panel itself must not cause the FPS drops it's measuring. Frame
 * accounting runs every rAF (cheap — just counters). FPS display,
 * event rates, and probe sorting refresh at 500ms. Heavy DOM
 * introspection (full querySelectorAll + getComputedStyle) runs every
 * 2000ms.
 *
 * ── Usage from console ──────────────────────────────────────────────
 *   DebugPerfMonitor.show()             // mount overlay + auto-instrument
 *   DebugPerfMonitor.hide()
 *   DebugPerfMonitor.toggle()
 *   DebugPerfMonitor.reset()            // clear rolling history + probes
 *   DebugPerfMonitor.snapshot()         // returns current metrics as obj
 *   DebugPerfMonitor.copyReport()       // copies a shareable text report
 *   DebugPerfMonitor.instrumentEngine() // re-scan for new modules
 *   DebugPerfMonitor.reinstrument()     // force re-scan
 *   DebugPerfMonitor.uninstrument()     // restore originals
 *   DebugPerfMonitor.instrument(Obj, 'method', 'label')  // manual wrap
 */
var DebugPerfMonitor = (function () {
  'use strict';

  // ── Frame timing state ──────────────────────────────────────────────

  var _running = false;
  var _rafHandle = 0;

  var _lastFrameTime = 0;
  var _frameCount = 0;

  // Rolling window: last N frames of (ts, frameMs)
  var _frames = [];           // { t, ms }
  var _frameWindowMs = 10000; // 10 second history

  // Display values (recomputed at display cadence)
  var _fpsNow = 60;
  var _fpsAvg = 60;
  var _fpsMin = 60;
  var _frameMsEwm = 16.67;
  var _worstMs = 0;
  var _stutterCount = 0;

  var STUTTER_MS = 33;        // below ~30fps = stutter
  var DANGER_MS = 50;         // below 20fps = danger

  // Stutter log (timestamped when detected)
  var _stutterLog = [];       // { t, ms, floor, enemies }
  var STUTTER_LOG_MAX = 8;

  var _startTime = 0;

  // ── DOM refs ────────────────────────────────────────────────────────

  var _panel = null;
  var _collapsed = false;
  var _refs = {};             // field → DOM element cache

  // Display refresh intervals
  var _displayTimer = 0;
  var _heavyTimer = 0;

  var _lastDisplayTick = 0;
  var _lastHeavyTick = 0;
  var DISPLAY_INTERVAL = 500;   // ms
  var HEAVY_INTERVAL = 2000;    // ms

  // Cached heavy stats (refreshed every HEAVY_INTERVAL)
  var _domCount = 0;
  var _animCount = 0;

  // ── Probe system (engine subsystem timing) ──────────────────────────
  //
  // Each probe wraps a method and measures its wall time. Per-call cost
  // is accumulated into a per-frame bucket, then flushed into a rolling
  // window when the rAF tick closes. The display tick computes ms/frame
  // averages from the window so the panel can sort subsystems by drag.
  //
  //   _probes[label] = {
  //     calls,         lifetime total
  //     totalMs,       lifetime total
  //     maxMs,         lifetime peak
  //     pendingCalls,  this frame, reset at _rafTick end
  //     pendingMs,     this frame, reset at _rafTick end
  //     history,       rolling array of { calls, ms } per frame
  //   }
  //
  var _probes = {};
  var _probeHistoryMax = 180; // ~3s at 60fps, ~45s at 4fps — enough to see warmup
  var _instrumented = false;

  // Event handler counters (mousemove, pointermove, keydown, wheel, etc.).
  // Incremented inside capture-phase listeners attached once at show().
  var _eventCounts = {
    mousemove: 0, pointermove: 0, mousedown: 0, mouseup: 0,
    keydown: 0, keyup: 0, wheel: 0, touchmove: 0
  };
  var _eventRates = {}; // last-window rates (per second)
  var _lastEventSnap = 0;

  // Entity growth tracking (catches "4 → 8 → 12 fps smooths out" leaks).
  var _prevCounts = null;
  var _countDeltas = { enemies: 0, particles: 0, dom: 0 };

  // Floor-entry capture: first N frames after floor change get deep logged.
  var _entryCapture = null;  // { floor, started, frames: [...], budget }
  var ENTRY_CAPTURE_FRAMES = 60;
  var _lastKnownFloor = null;

  // ── Styles (injected once) ──────────────────────────────────────────

  function _injectStyles() {
    if (document.getElementById('dpm-styles')) return;
    var css = [
      '#debug-perf-monitor {',
      '  position:fixed; top:8px; left:8px; z-index:99998;',
      '  background:rgba(12,6,25,0.92);',
      '  border:1px solid #2afce0;',
      '  border-radius:4px;',
      '  padding:6px 10px 8px;',
      '  font-family:"Courier New", monospace;',
      '  font-size:10px; line-height:1.5;',
      '  color:#b7a8e0;',
      '  min-width:220px;',
      '  box-shadow:0 0 16px rgba(42,252,224,0.25);',
      '  user-select:none;',
      '  pointer-events:auto;',
      '}',
      '#debug-perf-monitor.collapsed {',
      '  min-width:0;',
      '}',
      '#debug-perf-monitor.collapsed .dpm-body { display:none; }',
      '#debug-perf-monitor .dpm-hdr {',
      '  display:flex; align-items:center; justify-content:space-between;',
      '  font-size:9px; color:#fcff1a;',
      '  letter-spacing:1.5px; text-transform:uppercase;',
      '  border-bottom:1px dashed rgba(42,252,224,0.3);',
      '  padding-bottom:3px; margin-bottom:4px;',
      '}',
      '#debug-perf-monitor .dpm-hdr .dpm-title { color:#fcff1a; }',
      '#debug-perf-monitor .dpm-btns { display:flex; gap:2px; }',
      '#debug-perf-monitor .dpm-btn {',
      '  background:rgba(42,252,224,0.1);',
      '  border:1px solid rgba(42,252,224,0.5);',
      '  color:#2afce0;',
      '  font-family:inherit; font-size:9px;',
      '  padding:1px 5px; cursor:pointer;',
      '  line-height:1;',
      '}',
      '#debug-perf-monitor .dpm-btn:hover {',
      '  background:rgba(252,80,198,0.25);',
      '  border-color:#fc50c6; color:#fff;',
      '}',
      '#debug-perf-monitor .dpm-row {',
      '  display:flex; justify-content:space-between; gap:10px;',
      '}',
      '#debug-perf-monitor .dpm-label { color:#6e6490; }',
      '#debug-perf-monitor .dpm-val {',
      '  color:#2afce0; text-align:right;',
      '  font-variant-numeric:tabular-nums;',
      '}',
      '#debug-perf-monitor .dpm-val.warn { color:#fcff1a; }',
      '#debug-perf-monitor .dpm-val.danger { color:#fc50c6; }',
      '#debug-perf-monitor .dpm-bar {',
      '  height:3px; background:rgba(255,255,255,0.08);',
      '  margin:2px 0 4px; border-radius:2px; overflow:hidden;',
      '}',
      '#debug-perf-monitor .dpm-bar-fill {',
      '  height:100%; background:#2afce0;',
      '  transition:width 0.25s, background 0.25s;',
      '}',
      '#debug-perf-monitor .dpm-sep {',
      '  height:1px; background:rgba(42,252,224,0.2);',
      '  margin:4px -4px;',
      '}',
      '#debug-perf-monitor .dpm-section {',
      '  font-size:8px; color:#fcff1a;',
      '  letter-spacing:1.5px; text-transform:uppercase;',
      '  margin:3px 0 2px;',
      '}',
      '#debug-perf-monitor .dpm-stutter-log {',
      '  max-height:88px; overflow-y:auto;',
      '  font-size:9px; color:#88a;',
      '  background:rgba(0,0,0,0.4);',
      '  padding:3px 5px; border-left:2px solid #fc50c6;',
      '  margin-top:2px;',
      '}',
      '#debug-perf-monitor .dpm-stutter-log div { white-space:nowrap; }',
      '#debug-perf-monitor .dpm-stutter-log .empty { color:#4c4670; font-style:italic; }',
      '#debug-perf-monitor .dpm-stutter-log::-webkit-scrollbar { width:4px; }',
      '#debug-perf-monitor .dpm-stutter-log::-webkit-scrollbar-thumb {',
      '  background:rgba(42,252,224,0.4);',
      '}',
      '#debug-perf-monitor .dpm-probes,',
      '#debug-perf-monitor .dpm-events {',
      '  font-size:9px; color:#88a;',
      '  max-height:140px; overflow-y:auto;',
      '  background:rgba(0,0,0,0.4);',
      '  border-left:2px solid #fcff1a;',
      '  padding:3px 5px;',
      '}',
      '#debug-perf-monitor .dpm-events { border-left-color:#fc50c6; max-height:90px; }',
      '#debug-perf-monitor .dpm-probe {',
      '  display:grid;',
      '  grid-template-columns: 1fr 38px 38px 38px;',
      '  gap:4px; white-space:nowrap;',
      '  font-variant-numeric:tabular-nums;',
      '}',
      '#debug-perf-monitor .dpm-probe .pname { color:#b7a8e0; overflow:hidden; text-overflow:ellipsis; }',
      '#debug-perf-monitor .dpm-probe .pval { color:#2afce0; text-align:right; }',
      '#debug-perf-monitor .dpm-probe.warn .pval { color:#fcff1a; }',
      '#debug-perf-monitor .dpm-probe.danger .pval { color:#fc50c6; }',
      '#debug-perf-monitor .dpm-probe.danger .pname { color:#fc50c6; }',
      '#debug-perf-monitor .dpm-probe-head {',
      '  display:grid;',
      '  grid-template-columns: 1fr 38px 38px 38px;',
      '  gap:4px;',
      '  color:#4c4670; font-size:8px; letter-spacing:1px;',
      '  border-bottom:1px dotted rgba(42,252,224,0.2);',
      '  padding-bottom:1px; margin-bottom:1px;',
      '}',
      '#debug-perf-monitor .dpm-probe-head span { text-align:right; }',
      '#debug-perf-monitor .dpm-probe-head span:first-child { text-align:left; }',
      '#debug-perf-monitor .dpm-probe-empty {',
      '  color:#4c4670; font-style:italic; font-size:9px;',
      '}',
      '#debug-perf-monitor .dpm-event {',
      '  display:flex; justify-content:space-between; gap:10px;',
      '}',
      '#debug-perf-monitor .dpm-event .ename { color:#b7a8e0; }',
      '#debug-perf-monitor .dpm-event .eval { color:#2afce0; text-align:right; font-variant-numeric:tabular-nums; }',
      '#debug-perf-monitor .dpm-event.warn .eval { color:#fcff1a; }',
      '#debug-perf-monitor .dpm-event.danger .eval { color:#fc50c6; }',
      '#debug-perf-monitor .dpm-probes::-webkit-scrollbar,',
      '#debug-perf-monitor .dpm-events::-webkit-scrollbar { width:4px; }',
      '#debug-perf-monitor .dpm-probes::-webkit-scrollbar-thumb,',
      '#debug-perf-monitor .dpm-events::-webkit-scrollbar-thumb {',
      '  background:rgba(252,255,26,0.3);',
      '}'
    ].join('\n');
    var tag = document.createElement('style');
    tag.id = 'dpm-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ── Panel construction ──────────────────────────────────────────────

  function _buildPanel() {
    _panel = document.createElement('div');
    _panel.id = 'debug-perf-monitor';
    _panel.innerHTML = [
      '<div class="dpm-hdr">',
      '  <span class="dpm-title">◆ PERF MONITOR</span>',
      '  <span class="dpm-btns">',
      '    <button class="dpm-btn" data-act="reset" title="Reset rolling history">⟲</button>',
      '    <button class="dpm-btn" data-act="copy" title="Copy report to clipboard">⎘</button>',
      '    <button class="dpm-btn" data-act="collapse" title="Collapse">─</button>',
      '  </span>',
      '</div>',
      '<div class="dpm-body">',
      '  <div class="dpm-section">Frame</div>',
      '  <div class="dpm-row"><span class="dpm-label">fps</span><span class="dpm-val" data-f="fps">--</span></div>',
      '  <div class="dpm-bar"><div class="dpm-bar-fill" data-f="fpsBar" style="width:100%"></div></div>',
      '  <div class="dpm-row"><span class="dpm-label">frame ms</span><span class="dpm-val" data-f="frameMs">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">worst</span><span class="dpm-val" data-f="worst">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">stutters /10s</span><span class="dpm-val" data-f="stutter">0</span></div>',
      '  <div class="dpm-sep"></div>',
      '  <div class="dpm-section">Scene</div>',
      '  <div class="dpm-row"><span class="dpm-label">floor</span><span class="dpm-val" data-f="floor">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">enemies</span><span class="dpm-val" data-f="enemies">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">particles</span><span class="dpm-val" data-f="particles">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">grid</span><span class="dpm-val" data-f="grid">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">canvas</span><span class="dpm-val" data-f="canvas">--</span></div>',
      '  <div class="dpm-sep"></div>',
      '  <div class="dpm-section">DOM / Heap</div>',
      '  <div class="dpm-row"><span class="dpm-label">elements</span><span class="dpm-val" data-f="dom">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">animations</span><span class="dpm-val" data-f="anim">--</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">heap MB</span><span class="dpm-val" data-f="heap">n/a</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">Δ enemies/s</span><span class="dpm-val" data-f="deltaEnemies">0</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">Δ particles/s</span><span class="dpm-val" data-f="deltaParticles">0</span></div>',
      '  <div class="dpm-row"><span class="dpm-label">Δ dom/s</span><span class="dpm-val" data-f="deltaDom">0</span></div>',
      '  <div class="dpm-sep"></div>',
      '  <div class="dpm-section">Hot Subsystems (ms/frame)</div>',
      '  <div class="dpm-probes" data-f="probes">',
      '    <div class="dpm-probe-empty">instrument engine → top probes list</div>',
      '  </div>',
      '  <div class="dpm-sep"></div>',
      '  <div class="dpm-section">Event Rates (/sec)</div>',
      '  <div class="dpm-events" data-f="events">',
      '    <div class="dpm-probe-empty">--</div>',
      '  </div>',
      '  <div class="dpm-sep"></div>',
      '  <div class="dpm-section">Stutter Log</div>',
      '  <div class="dpm-stutter-log" data-f="stutterLog">',
      '    <div class="empty">No stutters recorded</div>',
      '  </div>',
      '</div>'
    ].join('\n');

    // Cache field refs
    var fields = _panel.querySelectorAll('[data-f]');
    for (var i = 0; i < fields.length; i++) {
      _refs[fields[i].getAttribute('data-f')] = fields[i];
    }

    // Wire buttons
    _panel.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'reset')    reset();
      if (act === 'copy')     copyReport();
      if (act === 'collapse') toggleCollapsed();
    });

    // Make the panel draggable by its header so it never blocks a peek.
    var hdr = _panel.querySelector('.dpm-hdr');
    var drag = null;
    hdr.addEventListener('mousedown', function (ev) {
      if (ev.target.closest('[data-act]')) return;
      var rect = _panel.getBoundingClientRect();
      drag = { ox: ev.clientX - rect.left, oy: ev.clientY - rect.top };
      ev.preventDefault();
    });
    window.addEventListener('mousemove', function (ev) {
      if (!drag) return;
      _panel.style.left = Math.max(0, ev.clientX - drag.ox) + 'px';
      _panel.style.top  = Math.max(0, ev.clientY - drag.oy) + 'px';
    });
    window.addEventListener('mouseup', function () { drag = null; });

    (document.body || document.documentElement).appendChild(_panel);
  }

  function toggleCollapsed() {
    _collapsed = !_collapsed;
    if (_panel) _panel.classList.toggle('collapsed', _collapsed);
  }

  // ── Scene probes ────────────────────────────────────────────────────
  //
  // Each probe is wrapped in a typeof guard so the monitor degrades
  // gracefully if a module is missing or hasn't been initialized yet.

  function _getFloorId() {
    if (typeof FloorManager !== 'undefined' && FloorManager.getFloor) {
      return FloorManager.getFloor();
    }
    return '?';
  }

  function _getEnemyCount() {
    if (typeof FloorManager !== 'undefined' && FloorManager.getEnemies) {
      var e = FloorManager.getEnemies();
      return (e && e.length) || 0;
    }
    return 0;
  }

  function _getParticleCount() {
    if (typeof ParticleFX !== 'undefined' && ParticleFX.count) {
      return ParticleFX.count();
    }
    return 0;
  }

  function _getGridDims() {
    if (typeof FloorManager !== 'undefined' && FloorManager.getFloorData) {
      var fd = FloorManager.getFloorData();
      if (fd && fd.grid && fd.grid.length) {
        return fd.grid[0].length + 'x' + fd.grid.length;
      }
    }
    return '?';
  }

  function _getCanvasDims() {
    var c = document.getElementById('view-canvas');
    if (c) return c.width + 'x' + c.height;
    return '?';
  }

  function _getHeapMB() {
    if (window.performance && performance.memory && performance.memory.usedJSHeapSize) {
      return (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
    }
    return null;
  }

  // ── Heavy refresh (DOM scan) ────────────────────────────────────────

  function _refreshHeavy() {
    var all = document.body ? document.body.querySelectorAll('*') : [];
    _domCount = all.length;
    var anim = 0;
    // getComputedStyle on every element is the hotspot here — only run
    // at HEAVY_INTERVAL cadence.
    for (var i = 0; i < all.length; i++) {
      var n = getComputedStyle(all[i]).animationName;
      if (n && n !== 'none') anim++;
    }
    _animCount = anim;
  }

  // ── Frame accounting (rAF) ──────────────────────────────────────────

  function _rafTick(now) {
    if (!_running) return;
    if (_lastFrameTime) {
      var dt = now - _lastFrameTime;
      _frameCount++;
      _frames.push({ t: now, ms: dt });

      // Drop frames older than the window
      var cutoff = now - _frameWindowMs;
      while (_frames.length && _frames[0].t < cutoff) _frames.shift();

      // EWM frame time for a smoother single-value readout
      _frameMsEwm = _frameMsEwm * 0.9 + dt * 0.1;

      if (dt > STUTTER_MS) {
        _stutterLog.push({
          t: now,
          ms: dt,
          floor: _getFloorId(),
          enemies: _getEnemyCount()
        });
        if (_stutterLog.length > STUTTER_LOG_MAX) _stutterLog.shift();
      }
    }
    _lastFrameTime = now;

    // Per-frame probe bookkeeping. Must run every frame so rates
    // reflect the actual render cadence, not the display cadence.
    _checkFloorEntry(now);
    _closeProbeFrame();

    // Display refresh cadence
    if (now - _lastDisplayTick >= DISPLAY_INTERVAL) {
      _lastDisplayTick = now;
      _recomputeRolling();
      _snapshotEventRates(now);
      _updateCountDeltas();
      _renderFields();
      _renderProbes();
      _renderEvents();
    }
    if (now - _lastHeavyTick >= HEAVY_INTERVAL) {
      _lastHeavyTick = now;
      _refreshHeavy();
    }

    _rafHandle = requestAnimationFrame(_rafTick);
  }

  // ── Floor-entry capture ────────────────────────────────────────────
  //
  // When the floor id changes, arm a 60-frame capture window. Every frame
  // during the window records per-probe timing so we can forensically
  // diagnose warmup cliffs (the "4→8→12 fps smooths out" pattern).

  function _checkFloorEntry(now) {
    var f = _getFloorId();
    if (f !== _lastKnownFloor) {
      _lastKnownFloor = f;
      _entryCapture = {
        floor: f,
        started: now,
        frames: [],
        budget: ENTRY_CAPTURE_FRAMES
      };
    }
  }

  // Flush this frame's pending probe data into the rolling window.
  // Also snapshot entry-capture frame if the window is still armed.
  function _closeProbeFrame() {
    var snap = null;
    for (var label in _probes) {
      if (!_probes.hasOwnProperty(label)) continue;
      var pr = _probes[label];
      pr.history.push({ calls: pr.pendingCalls, ms: pr.pendingMs });
      if (pr.history.length > _probeHistoryMax) pr.history.shift();
      if (_entryCapture && _entryCapture.budget > 0) {
        if (!snap) snap = {};
        if (pr.pendingCalls || pr.pendingMs) {
          snap[label] = { c: pr.pendingCalls, ms: pr.pendingMs };
        }
      }
      pr.pendingCalls = 0;
      pr.pendingMs = 0;
    }
    if (_entryCapture && _entryCapture.budget > 0) {
      _entryCapture.frames.push(snap || {});
      _entryCapture.budget--;
    }
  }

  function _updateCountDeltas() {
    var cur = {
      enemies: _getEnemyCount(),
      particles: _getParticleCount(),
      dom: _domCount
    };
    if (_prevCounts) {
      _countDeltas.enemies   = cur.enemies   - _prevCounts.enemies;
      _countDeltas.particles = cur.particles - _prevCounts.particles;
      _countDeltas.dom       = cur.dom       - _prevCounts.dom;
    }
    _prevCounts = cur;
  }

  function _snapshotEventRates(now) {
    var span = (now - _lastEventSnap) || 1;
    _lastEventSnap = now;
    var perSec = 1000 / span;
    for (var k in _eventCounts) {
      if (!_eventCounts.hasOwnProperty(k)) continue;
      _eventRates[k] = Math.round(_eventCounts[k] * perSec);
      _eventCounts[k] = 0;
    }
  }

  function _bindEventCounters() {
    if (_bindEventCounters._bound) return;
    _bindEventCounters._bound = true;
    var types = ['mousemove','pointermove','mousedown','mouseup',
                 'keydown','keyup','wheel','touchmove'];
    types.forEach(function (t) {
      window.addEventListener(t, function () { _eventCounts[t]++; }, true);
    });
    _lastEventSnap = performance.now();
  }

  // ── Rolling frame window stats ─────────────────────────────────────

  function _recomputeRolling() {
    if (!_frames.length) {
      _fpsNow = _fpsAvg = _fpsMin = 0;
      _worstMs = 0;
      _stutterCount = 0;
      return;
    }
    var span = (_frames[_frames.length - 1].t - _frames[0].t) || 1;
    _fpsAvg = Math.round((_frames.length / span) * 1000);
    _fpsNow = Math.round(1000 / Math.max(1, _frameMsEwm));
    var worst = 0;
    var stutters = 0;
    for (var i = 0; i < _frames.length; i++) {
      if (_frames[i].ms > worst) worst = _frames[i].ms;
      if (_frames[i].ms > STUTTER_MS) stutters++;
    }
    _worstMs = worst;
    _fpsMin = Math.round(1000 / Math.max(1, worst));
    _stutterCount = stutters;
  }

  function _cls(fps) {
    if (fps < 24) return 'danger';
    if (fps < 45) return 'warn';
    return '';
  }
  function _clsMs(ms) {
    if (ms > DANGER_MS) return 'danger';
    if (ms > STUTTER_MS) return 'warn';
    return '';
  }

  // ── Field rendering ────────────────────────────────────────────────

  function _renderFields() {
    if (!_panel) return;
    _refs.fps.textContent = _fpsNow + ' (avg ' + _fpsAvg + ', lo ' + _fpsMin + ')';
    _refs.fps.className = 'dpm-val ' + _cls(_fpsNow);
    var pct = Math.min(100, Math.round((_fpsNow / 60) * 100));
    _refs.fpsBar.style.width = pct + '%';
    _refs.fpsBar.style.background =
      _fpsNow < 24 ? '#fc50c6' : _fpsNow < 45 ? '#fcff1a' : '#2afce0';

    _refs.frameMs.textContent = _frameMsEwm.toFixed(1) + ' ms';
    _refs.frameMs.className = 'dpm-val ' + _clsMs(_frameMsEwm);
    _refs.worst.textContent = _worstMs.toFixed(0) + ' ms';
    _refs.worst.className = 'dpm-val ' + _clsMs(_worstMs);
    _refs.stutter.textContent = _stutterCount;
    _refs.stutter.className = 'dpm-val ' +
      (_stutterCount > 5 ? 'danger' : _stutterCount > 0 ? 'warn' : '');

    _refs.floor.textContent = _getFloorId();
    var enemies = _getEnemyCount();
    _refs.enemies.textContent = enemies;
    _refs.enemies.className = 'dpm-val ' + (enemies > 15 ? 'warn' : '');
    var particles = _getParticleCount();
    _refs.particles.textContent = particles;
    _refs.particles.className = 'dpm-val ' + (particles > 60 ? 'warn' : '');
    _refs.grid.textContent = _getGridDims();
    _refs.canvas.textContent = _getCanvasDims();

    _refs.dom.textContent = _domCount;
    _refs.dom.className = 'dpm-val ' +
      (_domCount > 1200 ? 'danger' : _domCount > 700 ? 'warn' : '');
    _refs.anim.textContent = _animCount;
    _refs.anim.className = 'dpm-val ' + (_animCount > 40 ? 'warn' : '');

    var heap = _getHeapMB();
    _refs.heap.textContent = heap === null ? 'n/a' : (heap + ' MB');

    var dE = _countDeltas.enemies, dP = _countDeltas.particles, dD = _countDeltas.dom;
    if (_refs.deltaEnemies) {
      _refs.deltaEnemies.textContent   = (dE >= 0 ? '+' : '') + dE;
      _refs.deltaEnemies.className     = 'dpm-val ' + (dE > 2 ? 'warn' : '');
    }
    if (_refs.deltaParticles) {
      _refs.deltaParticles.textContent = (dP >= 0 ? '+' : '') + dP;
      _refs.deltaParticles.className   = 'dpm-val ' +
        (dP > 10 ? 'danger' : dP > 3 ? 'warn' : '');
    }
    if (_refs.deltaDom) {
      _refs.deltaDom.textContent       = (dD >= 0 ? '+' : '') + dD;
      _refs.deltaDom.className         = 'dpm-val ' +
        (dD > 20 ? 'danger' : dD > 5 ? 'warn' : '');
    }

    if (_stutterLog.length === 0) {
      _refs.stutterLog.innerHTML = '<div class="empty">No stutters recorded</div>';
    } else {
      var html = '';
      for (var i = _stutterLog.length - 1; i >= 0; i--) {
        var s = _stutterLog[i];
        var rel = ((s.t - _startTime) / 1000).toFixed(1) + 's';
        html += '<div>+' + rel + '  ' + s.ms.toFixed(0) +
          'ms  f=' + s.floor + ' e=' + s.enemies + '</div>';
      }
      _refs.stutterLog.innerHTML = html;
    }
  }

  function _renderProbes() {
    if (!_panel || !_refs.probes) return;
    var rows = _probeSummary();
    if (rows.length === 0) {
      _refs.probes.innerHTML =
        '<div class="dpm-probe-empty">no probes wired — call DebugPerfMonitor.instrumentEngine()</div>';
      return;
    }
    var TOP = 14;
    var html = '<div class="dpm-probe-head">' +
      '<span>subsystem</span><span>ms/f</span><span>c/f</span><span>peak</span></div>';
    for (var i = 0; i < Math.min(rows.length, TOP); i++) {
      var r = rows[i];
      var cls = '';
      if (r.msPerFrame > 8)      cls = 'danger';
      else if (r.msPerFrame > 3) cls = 'warn';
      html += '<div class="dpm-probe ' + cls + '">' +
        '<span class="pname">' + r.label + '</span>' +
        '<span class="pval">' + r.msPerFrame.toFixed(2) + '</span>' +
        '<span class="pval">' + r.callsPerFrame.toFixed(1) + '</span>' +
        '<span class="pval">' + r.peakFrameMs.toFixed(1) + '</span>' +
      '</div>';
    }
    if (rows.length > TOP) {
      html += '<div class="dpm-probe-empty">+' + (rows.length - TOP) +
        ' more (see copied report)</div>';
    }
    _refs.probes.innerHTML = html;
  }

  function _renderEvents() {
    if (!_panel || !_refs.events) return;
    var keys = ['mousemove','pointermove','wheel','keydown','mousedown','touchmove'];
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var rate = _eventRates[k] || 0;
      var cls = '';
      if (rate > 120)     cls = 'danger';
      else if (rate > 40) cls = 'warn';
      html += '<div class="dpm-event ' + cls + '">' +
        '<span class="ename">' + k + '</span>' +
        '<span class="eval">' + rate + '/s</span>' +
      '</div>';
    }
    _refs.events.innerHTML = html;
  }


  // ── Probe machinery ────────────────────────────────────────────────

  function _ensureProbe(label) {
    var pr = _probes[label];
    if (pr) return pr;
    pr = _probes[label] = {
      calls: 0, totalMs: 0, maxMs: 0,
      pendingCalls: 0, pendingMs: 0,
      history: []
    };
    return pr;
  }

  // Build a wrapped version of `original` that times its wall clock and
  // folds the cost into the named probe. The wrapper is marked with
  // __dpm_wrapped so we can detect and unwind it later.
  function _wrapFn(original, label) {
    var probe = _ensureProbe(label);
    var wrapped = function () {
      var t0 = performance.now();
      try {
        return original.apply(this, arguments);
      } finally {
        var dt = performance.now() - t0;
        probe.calls++;
        probe.totalMs += dt;
        probe.pendingCalls++;
        probe.pendingMs += dt;
        if (dt > probe.maxMs) probe.maxMs = dt;
      }
    };
    wrapped.__dpm_wrapped = true;
    wrapped.__dpm_original = original;
    wrapped.__dpm_label = label;
    return wrapped;
  }

  // ── Manual span probe API (P1) ──────────────────────────────────────
  //
  // For hotpath call sites that can't be shim-wrapped — e.g. raycaster.js
  // core captures sub-module aliases at IIFE-parse time, so swapping
  // window.RaycasterSprites doesn't rewire the alias. Instead, call sites
  // gate timing around themselves:
  //
  //     var _probe = (typeof DebugPerfMonitor !== 'undefined')
  //         ? DebugPerfMonitor.probe : null;
  //     if (_probe) _probe.begin('Raycaster.floorPhase');
  //     _renderFloor(ctx);
  //     if (_probe) _probe.end('Raycaster.floorPhase');
  //
  // Inactive mode: `_probe` is still defined (the module is always loaded)
  // but `_running === false`, so begin/end short-circuit on the very first
  // branch. Overhead when monitor is off: ~5 null checks + one boolean
  // read per gate. When on: one performance.now() pair per gate.
  //
  // Stack-based to support nested spans on the same frame. If end() is
  // called with a mismatched label the sample is discarded and a one-shot
  // warning logged (prevents silent accounting drift from a missing gate).

  var _spanStack = [];
  var _spanWarned = false;

  function _probeBegin(label) {
    if (!_running) return;
    _spanStack.push({ label: label, t0: performance.now() });
  }

  function _probeEnd(label) {
    if (!_running) return;
    if (_spanStack.length === 0) return;
    var top = _spanStack[_spanStack.length - 1];
    if (top.label !== label) {
      if (!_spanWarned) {
        console.warn('[DebugPerfMonitor] probe.end("' + label +
          '") did not match top of stack ("' + top.label +
          '") — check for a missing probe.end call. Further mismatches ' +
          'will be silenced.');
        _spanWarned = true;
      }
      return;
    }
    _spanStack.pop();
    var dt = performance.now() - top.t0;
    var probe = _ensureProbe(label);
    probe.calls++;
    probe.totalMs += dt;
    probe.pendingCalls++;
    probe.pendingMs += dt;
    if (dt > probe.maxMs) probe.maxMs = dt;
  }

  function _probeCount(label, n) {
    if (!_running) return;
    var probe = _ensureProbe(label);
    var inc = (typeof n === 'number') ? n : 1;
    probe.calls += inc;
    probe.pendingCalls += inc;
  }

  // Convenience: wrap a fn invocation in begin/end. Useful when the call
  // site is a single expression; otherwise prefer begin/end around blocks.
  function _probeSpan(label, fn) {
    if (!_running) return fn();
    _probeBegin(label);
    try { return fn(); }
    finally { _probeEnd(label); }
  }

  var _probeApi = {
    begin: _probeBegin,
    end:   _probeEnd,
    count: _probeCount,
    span:  _probeSpan
  };

  // Monkey patch a method on an object in place. Returns true on success,
  // false if the target object is frozen (TypeError swallowed).
  function instrument(obj, method, label) {
    if (!obj || typeof obj[method] !== 'function') return false;
    if (obj[method].__dpm_wrapped) return true; // already done
    var wrapped = _wrapFn(obj[method], label || method);
    try {
      obj[method] = wrapped;
      return true;
    } catch (e) {
      // Object.freeze — caller should try shim path
      return false;
    }
  }

  // For Object.freeze'd modules, build an unfrozen copy of the public API
  // with the listed hot methods wrapped, and swap the global reference.
  // This works because game.js calls like `Raycaster.render(...)` resolve
  // `Raycaster` via global lookup at call time, not a cached reference.
  function _buildShim(frozenMod, moduleName, hotMethods) {
    if (!frozenMod || typeof frozenMod !== 'object') return null;
    var shim = {};
    for (var k in frozenMod) {
      shim[k] = frozenMod[k];
    }
    var wired = 0;
    for (var i = 0; i < hotMethods.length; i++) {
      var m = hotMethods[i];
      if (typeof shim[m] === 'function' && !shim[m].__dpm_wrapped) {
        shim[m] = _wrapFn(frozenMod[m], moduleName + '.' + m);
        wired++;
      }
    }
    shim.__dpm_shim = true;
    shim.__dpm_original = frozenMod;
    shim.__dpm_moduleName = moduleName;
    if (wired === 0) return null;
    return shim;
  }

  // Known modules + hot method names. Anything not present at call time
  // is silently skipped; reinstrument() picks up late-loaded modules.
  var _TARGETS = [
    { name: 'Raycaster',          methods: ['render','draw','cast','castFrame','drawFrame'] },
    // Raycaster sub-modules (post Phase 1–3 split).
    // CAVEAT: raycaster.js core captures aliases at IIFE-parse time
    // (e.g. `var _renderSprites = RaycasterSprites.renderSprites`), so
    // shim-replacing the global here does NOT rewire the core's hotpath
    // calls — only EXTERNAL callers get probed. For true per-subsystem
    // timing from within the render() hotpath, in-module instrumentation
    // gates are needed (see docs/TEST_HARNESS_ROADMAP.md §2).
    { name: 'RaycasterFloor',     methods: ['renderFloor','renderParallax','renderWeatherVeil'] },
    { name: 'RaycasterSprites',   methods: ['renderSprites','renderWallDecor','updateAndRenderParticles'] },
    // RaycasterWalls.drawTiledColumn is called ~960×/frame — wrapping adds
    // meaningful overhead. Left out intentionally; wall phase is probed
    // coarsely via Raycaster.render above. Phase 4 may add a column-batch
    // probe.
    // RaycasterLighting/Textures/Projection are cold (init / tool / registry
    // helpers), not per-frame hotpath — not instrumented.
    { name: 'Skybox',             methods: ['draw','render','tick','update'] },
    { name: 'Minimap',            methods: ['draw','render','refresh','paint','update'] },
    { name: 'HUD',                methods: ['draw','render','refresh','paint','update','tick'] },
    { name: 'MouseLook',          methods: ['tick','update'] },
    { name: 'MovementController', methods: ['tick','update','step'] },
    { name: 'FloorManager',       methods: ['tick','update','draw'] },
    { name: 'EnemyAI',            methods: ['tick','update','step'] },
    { name: 'CombatEngine',       methods: ['tick','update'] },
    { name: 'HazardSystem',       methods: ['tick','update','draw'] },
    { name: 'CardFan',            methods: ['draw','render','tick','update','refresh'] },
    { name: 'DialogBox',          methods: ['draw','render','tick','refresh'] },
    { name: 'Toast',              methods: ['draw','render','tick','refresh'] },
    { name: 'MenuBox',            methods: ['draw','render','tick','refresh'] },
    { name: 'TransitionFX',       methods: ['draw','render','tick','update'] },
    { name: 'InteractPrompt',     methods: ['draw','render','tick','update'] },
    { name: 'QuestWaypoint',      methods: ['draw','render','tick','update'] },
    { name: 'GameLoop',           methods: ['tick','step'] },
    { name: 'Lighting',           methods: ['tick','update','draw'] },
    { name: 'WorldItems',         methods: ['tick','update','draw','render'] },
    { name: 'BreakableSpawner',   methods: ['tick','update','draw'] },
    { name: 'Salvage',            methods: ['tick','update','draw'] },
    { name: 'UISprites',          methods: ['draw','render','tick','paint'] },
    { name: 'DoorAnimator',       methods: ['tick','update','draw'] },
    { name: 'InputPoll',          methods: ['tick','update','poll'] },
    { name: 'GrimeGrid',          methods: ['draw','render','tick','update','paint'] },
    { name: 'CobwebSystem',       methods: ['draw','render','tick','update'] },
    { name: 'CleaningSystem',     methods: ['tick','update','draw'] },
    { name: 'DetritusSprites',    methods: ['draw','render','tick','update'] },
    { name: 'TorchSystem',        methods: ['draw','render','tick','update'] }
  ];

  // Walk _TARGETS and wrap each present module's hot methods. For frozen
  // modules, install an unfrozen shim at window[name]. Safe to call
  // multiple times — already-wrapped methods are skipped.
  function instrumentEngine() {
    var wired = 0, frozen = 0, skipped = 0;
    for (var i = 0; i < _TARGETS.length; i++) {
      var t = _TARGETS[i];
      var mod = window[t.name];
      if (!mod) { skipped++; continue; }
      if (mod.__dpm_shim) { wired++; continue; }
      if (Object.isFrozen(mod)) {
        var shim = _buildShim(mod, t.name, t.methods);
        if (shim) {
          try {
            window[t.name] = shim;
            frozen++;
            wired++;
          } catch (e) {
            skipped++;
          }
        } else {
          skipped++;
        }
      } else {
        var any = false;
        for (var j = 0; j < t.methods.length; j++) {
          if (typeof mod[t.methods[j]] === 'function') {
            if (instrument(mod, t.methods[j], t.name + '.' + t.methods[j])) any = true;
          }
        }
        if (any) wired++; else skipped++;
      }
    }
    _instrumented = true;
    console.log('[DebugPerfMonitor] instrumentEngine: wired=' + wired +
      ' (frozen shimmed=' + frozen + ') skipped=' + skipped);
    return { wired: wired, frozen: frozen, skipped: skipped };
  }

  // Re-scan for modules that loaded after the first call (e.g. Layer 3.5).
  function reinstrument() {
    return instrumentEngine();
  }

  // Restore every wrapped method to its original. Handles both in-place
  // wraps (direct __dpm_wrapped method) and shim swaps (whole module
  // replaced). Errors on individual properties are swallowed so one
  // frozen descendant doesn't break the whole walk.
  function uninstrument() {
    // 1. Restore shims
    for (var i = 0; i < _TARGETS.length; i++) {
      var t = _TARGETS[i];
      var mod = window[t.name];
      if (mod && mod.__dpm_shim && mod.__dpm_original) {
        try { window[t.name] = mod.__dpm_original; } catch (e) {}
      }
    }
    // 2. Restore in-place wraps
    for (var i2 = 0; i2 < _TARGETS.length; i2++) {
      var t2 = _TARGETS[i2];
      var mod2 = window[t2.name];
      if (!mod2 || Object.isFrozen(mod2)) continue;
      for (var j = 0; j < t2.methods.length; j++) {
        var m = t2.methods[j];
        var fn = mod2[m];
        if (fn && fn.__dpm_wrapped && fn.__dpm_original) {
          try { mod2[m] = fn.__dpm_original; } catch (e) {}
        }
      }
    }
    _instrumented = false;
    console.log('[DebugPerfMonitor] uninstrument complete');
  }

  // Compute ms/frame, calls/frame, peak per probe. Sorted descending
  // by ms/frame so heaviest subsystems bubble to the top.
  function _probeSummary() {
    var rows = [];
    for (var label in _probes) {
      if (!_probes.hasOwnProperty(label)) continue;
      var pr = _probes[label];
      var hist = pr.history;
      if (!hist.length) continue;
      var sumMs = 0, sumCalls = 0, peakMs = 0;
      for (var i = 0; i < hist.length; i++) {
        sumMs    += hist[i].ms;
        sumCalls += hist[i].calls;
        if (hist[i].ms > peakMs) peakMs = hist[i].ms;
      }
      var n = hist.length;
      rows.push({
        label: label,
        msPerFrame: sumMs / n,
        callsPerFrame: sumCalls / n,
        peakFrameMs: peakMs,
        lifetimeCalls: pr.calls,
        lifetimeMs: pr.totalMs,
        lifetimeMaxMs: pr.maxMs
      });
    }
    rows.sort(function (a, b) { return b.msPerFrame - a.msPerFrame; });
    return rows;
  }


  // ── Lifecycle ──────────────────────────────────────────────────────

  function show() {
    _injectStyles();
    if (!_panel) _buildPanel();
    _panel.style.display = '';
    start();
    _bindEventCounters();
    // Instrument immediately so probes start filling on the first frame.
    instrumentEngine();
    // Second pass after 2s for any late-loaded Layer 3.5 modules.
    setTimeout(function () {
      if (_running) instrumentEngine();
    }, 2000);
  }

  function hide() {
    if (_panel) _panel.style.display = 'none';
    stop();
  }

  function toggle() {
    if (_panel && _panel.style.display !== 'none') hide();
    else show();
  }

  function start() {
    if (_running) return;
    _running = true;
    _startTime = performance.now();
    _lastFrameTime = 0;
    _lastDisplayTick = 0;
    _lastHeavyTick = 0;
    _lastEventSnap = performance.now();
    _rafHandle = requestAnimationFrame(_rafTick);
  }

  function stop() {
    _running = false;
    if (_rafHandle) cancelAnimationFrame(_rafHandle);
    _rafHandle = 0;
    _spanStack.length = 0;
  }

  function reset() {
    _frames.length = 0;
    _frameCount = 0;
    _stutterLog.length = 0;
    _stutterCount = 0;
    _worstMs = 0;
    _frameMsEwm = 16.67;
    _startTime = performance.now();
    // Reset probe rolling history (keep wraps in place)
    for (var label in _probes) {
      if (!_probes.hasOwnProperty(label)) continue;
      var pr = _probes[label];
      pr.calls = 0; pr.totalMs = 0; pr.maxMs = 0;
      pr.pendingCalls = 0; pr.pendingMs = 0;
      pr.history.length = 0;
    }
    _entryCapture = null;
    _lastKnownFloor = null;
    _prevCounts = null;
    _countDeltas = { enemies: 0, particles: 0, dom: 0 };
    _spanStack.length = 0;
    _spanWarned = false;
    for (var k in _eventCounts) {
      if (_eventCounts.hasOwnProperty(k)) _eventCounts[k] = 0;
    }
    _eventRates = {};
    _lastEventSnap = performance.now();
    if (_panel) _renderFields();
    console.log('[DebugPerfMonitor] reset');
  }

  function snapshot() {
    return {
      fps: _fpsNow,
      fpsAvg: _fpsAvg,
      fpsMin: _fpsMin,
      frameMs: +_frameMsEwm.toFixed(2),
      worstMs: _worstMs,
      stutterCount: _stutterCount,
      floor: _getFloorId(),
      enemies: _getEnemyCount(),
      particles: _getParticleCount(),
      grid: _getGridDims(),
      canvas: _getCanvasDims(),
      dom: _domCount,
      animations: _animCount,
      heapMB: _getHeapMB(),
      deltas: {
        enemies: _countDeltas.enemies,
        particles: _countDeltas.particles,
        dom: _countDeltas.dom
      },
      probes: _probeSummary(),
      events: (function () {
        var out = {};
        for (var k in _eventRates) out[k] = _eventRates[k];
        return out;
      })(),
      stutters: _stutterLog.slice(),
      entryCapture: _entryCapture ? {
        floor: _entryCapture.floor,
        framesCaptured: _entryCapture.frames.length,
        budgetRemaining: _entryCapture.budget,
        frames: _entryCapture.frames.slice()
      } : null
    };
  }

  function copyReport() {
    var s = snapshot();
    var lines = [];
    lines.push('[DebugPerfMonitor Report]');
    lines.push('Elapsed: ' + ((performance.now() - _startTime) / 1000).toFixed(1) + 's');
    lines.push('');
    lines.push('── Frame ──');
    lines.push('fps: ' + s.fps + ' (avg ' + s.fpsAvg + ', lo ' + s.fpsMin + ')');
    lines.push('frame ms: ' + s.frameMs);
    lines.push('worst: ' + s.worstMs + 'ms');
    lines.push('stutters (>33ms in last 10s): ' + s.stutterCount);
    lines.push('');
    lines.push('── Scene ──');
    lines.push('floor: ' + s.floor);
    lines.push('enemies: ' + s.enemies + '  (Δ ' + s.deltas.enemies + ')');
    lines.push('particles: ' + s.particles + '  (Δ ' + s.deltas.particles + ')');
    lines.push('grid: ' + s.grid);
    lines.push('canvas: ' + s.canvas);
    lines.push('');
    lines.push('── DOM / Heap ──');
    lines.push('elements: ' + s.dom + '  (Δ ' + s.deltas.dom + ')');
    lines.push('animations: ' + s.animations);
    lines.push('heap MB: ' + (s.heapMB === null ? 'n/a' : s.heapMB));
    lines.push('');
    lines.push('── Hot Subsystems (ms/frame, sorted desc) ──');
    if (s.probes.length === 0) {
      lines.push('(no probes wired)');
    } else {
      lines.push('label                             ms/f   c/f    peak    lifetimeMs  lifetimeMax');
      for (var i = 0; i < s.probes.length; i++) {
        var r = s.probes[i];
        var name = (r.label + '                                  ').slice(0, 34);
        var msF  = r.msPerFrame.toFixed(2);
        var cF   = r.callsPerFrame.toFixed(1);
        var pk   = r.peakFrameMs.toFixed(1);
        var lt   = r.lifetimeMs.toFixed(0);
        var ltMx = r.lifetimeMaxMs.toFixed(1);
        lines.push(name + ' ' +
          (msF + '     ').slice(0, 6) + ' ' +
          (cF  + '     ').slice(0, 6) + ' ' +
          (pk  + '       ').slice(0, 7) + ' ' +
          (lt  + '          ').slice(0, 10) + ' ' +
          ltMx);
      }
    }
    lines.push('');
    lines.push('── Event Rates (/sec) ──');
    for (var ek in s.events) {
      lines.push(ek + ': ' + s.events[ek]);
    }
    lines.push('');
    lines.push('── Stutter Log (last 8) ──');
    if (s.stutters.length === 0) {
      lines.push('(none)');
    } else {
      for (var j = 0; j < s.stutters.length; j++) {
        var st = s.stutters[j];
        var rel = ((st.t - _startTime) / 1000).toFixed(1);
        lines.push('+' + rel + 's  ' + st.ms.toFixed(0) + 'ms  floor=' +
          st.floor + '  enemies=' + st.enemies);
      }
    }
    if (s.entryCapture) {
      lines.push('');
      lines.push('── Entry Capture (first ' +
        (ENTRY_CAPTURE_FRAMES - s.entryCapture.budgetRemaining) +
        ' frames after entering floor ' + s.entryCapture.floor + ') ──');
      var frames = s.entryCapture.frames;
      // Per-frame list is too noisy for clipboard — summarize by label
      var agg = {};
      for (var fi = 0; fi < frames.length; fi++) {
        var fr = frames[fi];
        for (var lbl in fr) {
          if (!fr.hasOwnProperty(lbl)) continue;
          if (!agg[lbl]) agg[lbl] = { ms: 0, c: 0, n: 0, peak: 0 };
          agg[lbl].ms += fr[lbl].ms || 0;
          agg[lbl].c  += fr[lbl].c  || 0;
          agg[lbl].n++;
          if ((fr[lbl].ms || 0) > agg[lbl].peak) agg[lbl].peak = fr[lbl].ms;
        }
      }
      var aggRows = [];
      for (var al in agg) aggRows.push({ label: al,
        msPerFrame: agg[al].ms / Math.max(1, agg[al].n),
        peak: agg[al].peak, total: agg[al].ms });
      aggRows.sort(function (a, b) { return b.msPerFrame - a.msPerFrame; });
      lines.push('label                             ms/f      peak      totalMs');
      for (var ai = 0; ai < aggRows.length; ai++) {
        var ar = aggRows[ai];
        var nm = (ar.label + '                                  ').slice(0, 34);
        lines.push(nm + ' ' +
          (ar.msPerFrame.toFixed(2) + '       ').slice(0, 8) + ' ' +
          (ar.peak.toFixed(1) + '       ').slice(0, 8) + ' ' +
          ar.total.toFixed(0));
      }
    }

    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        console.log('[DebugPerfMonitor] report copied to clipboard');
      }, function (err) {
        console.warn('[DebugPerfMonitor] clipboard failed:', err);
        console.log(text);
      });
    } else {
      console.log(text);
    }
    return text;
  }

  // ── Public API ─────────────────────────────────────────────────────

  return {
    show:             show,
    hide:             hide,
    toggle:           toggle,
    toggleCollapsed:  toggleCollapsed,
    start:            start,
    stop:             stop,
    reset:            reset,
    snapshot:         snapshot,
    copyReport:       copyReport,
    instrument:       instrument,
    instrumentEngine: instrumentEngine,
    reinstrument:     reinstrument,
    uninstrument:     uninstrument,
    probeSummary:     _probeSummary,
    getProbes:        function () { return _probes; },
    probe:            _probeApi
  };
})();

// ═══════════════════════════════════════════════════════════════
//  tools/js/wd-bo-bridge.js — World Designer ↔ Blockout-Visualizer bridge
//  Phase 5b.2
//
//  Embeds blockout-visualizer.html in a hidden iframe and exposes a
//  promise-based wrapper around BO.run(). The iframe's bv-bo-router.js
//  listens for postMessage { _bo:true, id, cmd } and replies with
//  { _bo:true, id, result }.
//
//  Usage:
//    WDBridge.init()                      → creates iframe, waits for load
//    WDBridge.run({action:'listFloors'})  → Promise<{ok, result}>
//    WDBridge.validate('all')             → Promise<[issues]>
//    WDBridge.reload()                    → destroys + recreates iframe
//    WDBridge.ready                       → boolean
//
//  Depends on: nothing (standalone IIFE). Used by world-designer.js.
// ═══════════════════════════════════════════════════════════════
var WDBridge = (function() {
  'use strict';

  var BOV_URL  = 'blockout-visualizer.html';
  var _iframe  = null;
  var _ready   = false;
  var _pending = {};   // id → { resolve, reject, timer }
  var _idSeq   = 0;
  var _readyCallbacks = [];
  var TIMEOUT_MS = 10000;

  // ── Response handler ──────────────────────────────────────
  function _onMessage(ev) {
    if (!ev.data || ev.data._bo !== true || ev.data.id == null) return;
    var entry = _pending[ev.data.id];
    if (!entry) return;
    clearTimeout(entry.timer);
    delete _pending[ev.data.id];
    entry.resolve(ev.data.result);
  }

  // ── Init: create hidden iframe + wait for load ────────────
  function init(containerEl) {
    if (_iframe) return; // already initialized

    window.addEventListener('message', _onMessage);

    _iframe = document.createElement('iframe');
    _iframe.id = 'bov-bridge-frame';
    _iframe.src = BOV_URL;
    _iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;visibility:hidden;border:none;';
    _iframe.setAttribute('aria-hidden', 'true');

    // Append to provided container or body
    (containerEl || document.body).appendChild(_iframe);

    _iframe.addEventListener('load', function() {
      _ready = true;
      console.log('[wd-bo-bridge] iframe loaded');
      _readyCallbacks.forEach(function(fn) { fn(); });
      _readyCallbacks = [];
    });
  }

  // ── Send a command to the iframe BO.run() ─────────────────
  function run(cmd) {
    if (!_iframe || !_ready) {
      return Promise.reject(new Error('Bridge not ready — call WDBridge.init() first'));
    }
    var id = ++_idSeq;
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() {
        delete _pending[id];
        reject(new Error('Bridge timeout (' + TIMEOUT_MS + 'ms) for action: ' + (cmd && cmd.action)));
      }, TIMEOUT_MS);

      _pending[id] = { resolve: resolve, reject: reject, timer: timer };
      _iframe.contentWindow.postMessage({ _bo: true, id: id, cmd: cmd }, '*');
    });
  }

  // ── Convenience: validate all floors ──────────────────────
  function validate(scope) {
    return run({ action: 'validate', scope: scope || 'all' }).then(function(res) {
      if (!res || !res.ok) return [];
      return res.result && res.result.issues ? res.result.issues : [];
    });
  }

  // ── Convenience: list all floors ──────────────────────────
  function listFloors() {
    return run({ action: 'listFloors' }).then(function(res) {
      if (!res || !res.ok) return [];
      return res.result || [];
    });
  }

  // ── Convenience: get single floor data ────────────────────
  function getFloor(floorId) {
    return run({ action: 'getFloor', floor: floorId });
  }

  // ── Reload: destroy iframe + recreate ─────────────────────
  function reload() {
    // Reject all pending
    Object.keys(_pending).forEach(function(id) {
      clearTimeout(_pending[id].timer);
      _pending[id].reject(new Error('Bridge reloading'));
    });
    _pending = {};
    _ready = false;

    if (_iframe && _iframe.parentNode) {
      var parent = _iframe.parentNode;
      parent.removeChild(_iframe);
      _iframe = null;
      init(parent);
    }
  }

  // ── Wait for ready ────────────────────────────────────────
  function onReady(fn) {
    if (_ready) { fn(); return; }
    _readyCallbacks.push(fn);
  }

  // ── Public API ────────────────────────────────────────────
  return Object.freeze({
    init:       init,
    run:        run,
    validate:   validate,
    listFloors: listFloors,
    getFloor:   getFloor,
    reload:     reload,
    onReady:    onReady,
    get ready() { return _ready; }
  });
})();

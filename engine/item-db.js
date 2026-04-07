/**
 * ItemDB — READ-ONLY item definition registry.
 *
 * Loads data/items.json via synchronous XHR and provides O(1) lookup by
 * item ID. Same loading pattern as CardSystem and LootTables — sync XHR
 * avoids async cascade on webOS startup.
 *
 * Used by:
 *   - game-actions.js: resolve full item def when picking up supply drops
 *   - SpraySystem._resolveNozzle(): (indirect) equipped items need correct
 *     subtype field, which ItemDB ensures at pickup time
 *   - Future: any system that needs item metadata by ID
 *
 * Public API:
 *   ItemDB.init()      — load JSON, build index
 *   ItemDB.get(id)     — return deep clone of item def, or null
 *   ItemDB.has(id)     — true if id exists
 *   ItemDB.getAll()    — full registry array (read-only reference)
 *
 * Layer 0 — depends on: nothing (pure data loader)
 */
var ItemDB = (function () {
  'use strict';

  var _registry = [];
  var _byId     = {};
  var _loaded   = false;

  // ── Loading ──────────────────────────────────────────────────────

  function init() {
    if (_loaded) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'data/items.json', false);
      xhr.send();
      if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
        var parsed = JSON.parse(xhr.responseText);
        _registry = Array.isArray(parsed) ? parsed : [];
        _buildIndex();
        _loaded = true;
        if (typeof console !== 'undefined') {
          console.log('[ItemDB] Loaded ' + Object.keys(_byId).length + ' items');
        }
      }
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[ItemDB] Load failed:', e);
      }
    }
    if (!_loaded) {
      _registry = [];
      _byId = {};
      _loaded = true;
    }
  }

  function _buildIndex() {
    _byId = {};
    for (var i = 0; i < _registry.length; i++) {
      var item = _registry[i];
      if (item && item.id) {
        _byId[item.id] = item;
      }
    }
  }

  // ── Queries ──────────────────────────────────────────────────────

  /**
   * Look up an item by ID. Returns a deep clone so callers can't
   * mutate the registry. Returns null if not found.
   */
  function get(id) {
    if (!_loaded) init();
    var def = _byId[id];
    if (!def) return null;
    return JSON.parse(JSON.stringify(def));
  }

  /** Check if an item ID exists in the registry. */
  function has(id) {
    if (!_loaded) init();
    return !!_byId[id];
  }

  /** Return the full registry array (reference — do not mutate). */
  function getAll() {
    if (!_loaded) init();
    return _registry;
  }

  // ── Public API ─────────────────────────────────────────────────

  return Object.freeze({
    init:   init,
    get:    get,
    has:    has,
    getAll: getAll
  });
})();

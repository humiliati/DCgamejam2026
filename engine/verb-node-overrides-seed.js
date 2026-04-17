/**
 * VerbNodeOverrides — Per-floor override merge for procgen dungeon nodes.
 *
 * DOC-110 P3 Ch.2 stretch (2026-04-17). Consumes
 * data/verb-node-overrides.js (bundle of tools/verb-node-overrides/*.json
 * authored files) and exposes `apply(floorId, nodes) → nodes'` so
 * engine/dungeon-verb-nodes.js can patch its auto-derived node list
 * before registering with VerbNodes.
 *
 * Op semantics (in application order):
 *   1. replace — mutate fields (type/faction/contested) on nodes matching an id
 *   2. remove  — drop nodes whose id is in the remove[] list
 *   3. add     — append custom nodes (ids must not collide with survivors)
 *
 * Hand-authored floors (depth 1-2, loaded by VerbNodeSeed) are
 * intentionally NOT patched by this module. Those floors should be
 * edited via the BO-V verb-node layer or data/verb-nodes.json directly.
 *
 * Runtime failure-mode: if the sidecar didn't load (missing file,
 * network error under file://, etc.) VerbNodeOverrides.apply() is an
 * identity function — no crash, no log spam, DungeonVerbNodes registers
 * its auto-derived list unchanged.
 *
 * Layer 1 — zero-dep IIFE. Must load AFTER data/verb-node-overrides.js
 *           (the sidecar that populates window.VERB_NODE_OVERRIDES_DATA)
 *           and BEFORE engine/dungeon-verb-nodes.js.
 */
var VerbNodeOverrides = (function () {
  'use strict';

  var _byFloor = null;   // { floorId → { add, remove, replace } }
  var _loaded  = false;

  function _boot() {
    if (_loaded) return;
    _loaded = true;
    if (typeof window === 'undefined') return;

    var data = window.VERB_NODE_OVERRIDES_DATA;
    if (!data || !data.byFloor) return;

    // Deep copy to isolate our copy from any later edits. Shallow-copy
    // each op array (the node objects are immutable from our POV).
    _byFloor = {};
    var keys = Object.keys(data.byFloor);
    for (var i = 0; i < keys.length; i++) {
      var src = data.byFloor[keys[i]];
      _byFloor[keys[i]] = {
        floorId: keys[i],
        add:     (src.add     || []).slice(),
        remove:  (src.remove  || []).slice(),
        replace: (src.replace || []).slice()
      };
    }
  }

  /**
   * Apply the per-floor override set to an auto-derived node list.
   * Returns a NEW array (does not mutate `nodes` in place) so callers
   * can safely pass the DungeonVerbNodes internal buffer.
   *
   * If no overrides exist for floorId, returns `nodes` verbatim.
   *
   * @param {string} floorId
   * @param {Array}  nodes    — auto-derived nodes from DungeonVerbNodes
   * @returns {Array}
   */
  function apply(floorId, nodes) {
    _boot();
    if (!_byFloor) return nodes;
    var ops = _byFloor[floorId];
    if (!ops) return nodes;

    var working = nodes.slice();

    // 1. replace — mutate matching entries
    if (ops.replace && ops.replace.length) {
      for (var i = 0; i < working.length; i++) {
        var n = working[i];
        for (var j = 0; j < ops.replace.length; j++) {
          var rep = ops.replace[j];
          if (rep.id === n.id) {
            var patched = {
              id:   n.id,
              type: (rep.patch.type   != null) ? rep.patch.type   : n.type,
              x:    n.x,
              y:    n.y
            };
            if (rep.patch.faction   !== undefined) patched.faction   = rep.patch.faction;
            else if (n.faction     != null)        patched.faction   = n.faction;
            if (rep.patch.contested !== undefined) patched.contested = rep.patch.contested;
            else if (n.contested   === true)       patched.contested = true;
            working[i] = patched;
            break;
          }
        }
      }
    }

    // 2. remove — filter out matching ids
    if (ops.remove && ops.remove.length) {
      var removeSet = Object.create(null);
      for (var ri = 0; ri < ops.remove.length; ri++) removeSet[ops.remove[ri]] = true;
      var filtered = [];
      for (var k = 0; k < working.length; k++) {
        if (!removeSet[working[k].id]) filtered.push(working[k]);
      }
      working = filtered;
    }

    // 3. add — append unless the id already exists in the surviving set
    if (ops.add && ops.add.length) {
      var seenIds = Object.create(null);
      for (var si = 0; si < working.length; si++) seenIds[working[si].id] = true;
      for (var ai = 0; ai < ops.add.length; ai++) {
        var add = ops.add[ai];
        if (seenIds[add.id]) {
          // Duplicate id — validator should have caught this but defend
          // anyway so we don't silently let the override re-add a node
          // the auto-scan also produced.
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[VerbNodeOverrides] ' + floorId + ': add id "' + add.id +
              '" collides with an existing node — skipping.');
          }
          continue;
        }
        var cleanAdd = { id: add.id, type: add.type, x: add.x, y: add.y };
        if (add.faction != null)   cleanAdd.faction   = add.faction;
        if (add.contested === true) cleanAdd.contested = true;
        working.push(cleanAdd);
        seenIds[add.id] = true;
      }
    }

    return working;
  }

  /**
   * Peek at the ops for a floor (for debugging / tooling). Returns
   * null if no overrides are registered for this floor.
   */
  function getOps(floorId) {
    _boot();
    if (!_byFloor) return null;
    return _byFloor[floorId] || null;
  }

  /**
   * How many floors have non-empty override ops. Used in boot log.
   */
  function floorCount() {
    _boot();
    return _byFloor ? Object.keys(_byFloor).length : 0;
  }

  /**
   * Reset — exposed for test harnesses only. Clears the cached bundle
   * so a new window.VERB_NODE_OVERRIDES_DATA can be injected.
   */
  function reset() { _byFloor = null; _loaded = false; }

  // Boot-time banner — tells authors whether any overrides were loaded.
  // Gated on actual presence so a clean-repo install stays silent.
  (function _banner() {
    _boot();
    if (_byFloor && typeof console !== 'undefined' && console.log) {
      var n = Object.keys(_byFloor).length;
      if (n > 0) {
        console.log('[VerbNodeOverrides] ' + n + ' floor override(s) loaded from data/verb-node-overrides.js');
      }
    }
  })();

  return Object.freeze({
    apply:      apply,
    getOps:     getOps,
    floorCount: floorCount,
    reset:      reset
  });
})();

/**
 * QuestRegistry — canonical read-only registry of quest definitions.
 *
 * Layer 1 (core). Depends on QuestTypes (Layer 0). Loaded before
 * QuestChain, ReputationBar, menu-faces journal.
 *
 * Responsibility: own the parsed contents of data/quests.json plus any
 * per-floor quest sidecars that extract-floors.js merged into
 * tools/floor-data.json (see Phase 0b). All mutation happens through
 * `init(payload)`; the public getters return frozen snapshots so
 * downstream modules cannot accidentally corrupt shared state.
 *
 * Phase 1 additions (DOC-107 §5 step 3):
 *   - named anchors from quests.json.anchors  →  `_namedAnchors`
 *   - runtime anchor resolvers (5 types)      →  `resolveAnchor`
 *   - resolver wiring                         →  `setResolvers`
 *
 * Anchor spec shapes (used by quests[].steps[].target, or by name):
 *   { type: 'literal',    floorId, x, y }
 *   { type: 'floor-data', floorId, path:'doors.stairsUp' }
 *   { type: 'entity',     module:'DispatcherChoreography', method:'getEntity' }
 *   { type: 'npc',        floorId, npcId }
 *   { type: 'dump-truck', floorId }        // uses DumpTruckSpawner.getDeployment()
 *   { type: 'door-to',    floorId, targetFloorId }
 *
 * Resolvers are injected at Game init (Layer 4) via setResolvers() so
 * QuestRegistry stays Layer-1 and doesn't need hard deps on FloorManager,
 * DumpTruckSpawner, DispatcherChoreography, etc.
 */
var QuestRegistry = (function () {
  'use strict';

  var _initialized      = false;
  var _quests           = Object.freeze({});   // { questId: frozen quest def }
  var _namedAnchors     = Object.freeze({});   // { anchorId: frozen spec }
  var _floorQuestIndex  = Object.freeze({});   // { floorId: [questId, ...] }
  var _version          = 0;
  var _templates        = Object.freeze({});   // _templates key from quests.json
  var _source           = null;                // 'quests.json' | 'inline' | null
  var _lastError        = null;

  // Runtime resolvers (wired by Game at Layer 4 boot; see setResolvers).
  // Left null in Phase 0 tests so resolveAnchor returns null cleanly.
  var _resolvers = {
    getFloorData:      null,
    getEntity:         null,
    getNpcById:        null,
    getDumpTruck:      null,
    getCurrentFloorId: null
  };

  function _freezeDeep(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    Object.keys(obj).forEach(function (k) { _freezeDeep(obj[k]); });
    return Object.freeze(obj);
  }

  // Walk a dotted path on a plain object. Returns undefined on miss.
  // Example: _pluckPath({doors:{stairsUp:{x:3,y:4}}}, 'doors.stairsUp') → {x:3,y:4}
  function _pluckPath(obj, path) {
    if (!obj || typeof path !== 'string' || !path) return undefined;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  // ── Init ─────────────────────────────────────────────────────────
  // Accepts the parsed quests.json payload plus (optionally) a map of
  // floor-anchored quests harvested from floor-data.json. Phase 1 now
  // also ingests named anchors from payload.anchors.
  function init(payload, floorAnchors) {
    _lastError = null;
    _initialized = true;

    if (!payload || typeof payload !== 'object') {
      _version          = 0;
      _quests           = Object.freeze({});
      _namedAnchors     = Object.freeze({});
      _floorQuestIndex  = Object.freeze({});
      _templates        = Object.freeze({});
      _source           = null;
      return true;
    }

    _version   = (payload.version | 0) || 1;
    _templates = _freezeDeep(payload._templates || {});
    _source    = payload._source || 'quests.json';

    // Phase 0: accept `quests` as either [] or {}. Freeze whatever we got
    // so downstream reads are safe, but do not yet validate shape.
    var questsIn = payload.quests;
    var qOut = {};
    if (Array.isArray(questsIn)) {
      questsIn.forEach(function (q) {
        if (q && typeof q === 'object' && typeof q.id === 'string') qOut[q.id] = q;
      });
    } else if (questsIn && typeof questsIn === 'object') {
      Object.keys(questsIn).forEach(function (k) { qOut[k] = questsIn[k]; });
    }
    _quests = _freezeDeep(qOut);

    // Named anchors: { anchorId: spec }. Phase 1.
    // Tolerates missing/malformed — missing reduces to {} not a throw.
    var namedIn = (payload.anchors && typeof payload.anchors === 'object' &&
                   !Array.isArray(payload.anchors)) ? payload.anchors : {};
    var naOut = {};
    Object.keys(namedIn).forEach(function (id) {
      var spec = namedIn[id];
      // An anchor spec must be an object with a `type` string. A bare
      // {floorId, x, y} without a type is treated as an implicit literal.
      if (!spec || typeof spec !== 'object') return;
      if (typeof spec.type !== 'string') {
        if (typeof spec.floorId === 'string' &&
            typeof spec.x === 'number' && typeof spec.y === 'number') {
          naOut[id] = { type: 'literal', floorId: spec.floorId, x: spec.x, y: spec.y };
        }
        return;
      }
      // Shallow copy so freezeDeep doesn't mutate the payload the caller kept.
      var copy = {};
      Object.keys(spec).forEach(function (k) { copy[k] = spec[k]; });
      naOut[id] = copy;
    });
    _namedAnchors = _freezeDeep(naOut);

    // Floor → [questId] index. Comes from the sidecar merge via
    // FloorManager.getQuestAnchors() at Game boot. In Phase 0/1 this is
    // a simple {floorId: [id,...]} map.
    var aOut = {};
    if (floorAnchors && typeof floorAnchors === 'object') {
      Object.keys(floorAnchors).forEach(function (fid) {
        var list = floorAnchors[fid];
        if (!Array.isArray(list)) return;
        aOut[fid] = list.slice();
      });
    }
    _floorQuestIndex = _freezeDeep(aOut);

    return true;
  }

  // ── Runtime resolver wiring (Layer 4 Game.init calls this) ───────
  function setResolvers(res) {
    if (!res || typeof res !== 'object') return false;
    _resolvers = {
      getFloorData:      typeof res.getFloorData      === 'function' ? res.getFloorData      : null,
      getEntity:         typeof res.getEntity         === 'function' ? res.getEntity         : null,
      getNpcById:        typeof res.getNpcById        === 'function' ? res.getNpcById        : null,
      getDumpTruck:      typeof res.getDumpTruck      === 'function' ? res.getDumpTruck      : null,
      getCurrentFloorId: typeof res.getCurrentFloorId === 'function' ? res.getCurrentFloorId : null
    };
    return true;
  }

  // ── Anchor resolution ────────────────────────────────────────────
  // Accepts either a raw spec object or a named-anchor id string.
  // Returns { floorId, x, y } on success, null on failure.
  function resolveAnchor(specOrId) {
    var spec = null;
    if (typeof specOrId === 'string') {
      spec = _namedAnchors[specOrId] || null;
    } else if (specOrId && typeof specOrId === 'object') {
      spec = specOrId;
    }
    if (!spec || typeof spec !== 'object') return null;

    switch (spec.type) {
      case 'literal':      return _resolveLiteral(spec);
      case 'floor-data':   return _resolveFloorData(spec);
      case 'entity':       return _resolveEntity(spec);
      case 'npc':          return _resolveNpc(spec);
      case 'dump-truck':   return _resolveDumpTruck(spec);
      case 'door-to':      return _resolveDoorTo(spec);
      default:             return null;
    }
  }

  function _resolveLiteral(spec) {
    if (typeof spec.floorId !== 'string') return null;
    if (typeof spec.x !== 'number' || typeof spec.y !== 'number') return null;
    return { floorId: spec.floorId, x: spec.x | 0, y: spec.y | 0 };
  }

  // floor-data: look up a coord object at spec.path on the floor's data.
  // Examples: path='doors.doorExit', 'doors.stairsUp', 'doors.stairsDn'.
  // Uses the runtime resolver `getFloorData(floorId)` (populated by Game).
  function _resolveFloorData(spec) {
    if (typeof spec.floorId !== 'string' || typeof spec.path !== 'string') return null;
    if (!_resolvers.getFloorData) return null;
    var fd = null;
    try { fd = _resolvers.getFloorData(spec.floorId); } catch (e) { return null; }
    if (!fd) return null;
    var hit = _pluckPath(fd, spec.path);
    if (!hit || typeof hit !== 'object') return null;
    if (typeof hit.x !== 'number' || typeof hit.y !== 'number') return null;
    return { floorId: spec.floorId, x: hit.x | 0, y: hit.y | 0 };
  }

  // entity: invoke a live getter like DispatcherChoreography.getEntity()
  // and lift its { x, y } plus the current floor id.
  function _resolveEntity(spec) {
    if (typeof spec.module !== 'string' || typeof spec.method !== 'string') return null;
    if (!_resolvers.getEntity) return null;
    var ent = null;
    try { ent = _resolvers.getEntity(spec.module, spec.method); } catch (e) { return null; }
    if (!ent || ent._hidden) return null;
    if (typeof ent.x !== 'number' || typeof ent.y !== 'number') return null;
    var fid = (typeof spec.floorId === 'string' && spec.floorId) ? spec.floorId :
              (_resolvers.getCurrentFloorId ? _resolvers.getCurrentFloorId() : null);
    if (typeof fid !== 'string') return null;
    return { floorId: fid, x: ent.x | 0, y: ent.y | 0 };
  }

  // npc: an NPC id anchored to a specific floor. Delegates to a wired
  // getter so QuestRegistry never imports the NPC system directly.
  function _resolveNpc(spec) {
    if (typeof spec.floorId !== 'string' || typeof spec.npcId !== 'string') return null;
    if (!_resolvers.getNpcById) return null;
    var npc = null;
    try { npc = _resolvers.getNpcById(spec.floorId, spec.npcId); } catch (e) { return null; }
    if (!npc) return null;
    if (typeof npc.x !== 'number' || typeof npc.y !== 'number') return null;
    return { floorId: spec.floorId, x: npc.x | 0, y: npc.y | 0 };
  }

  // dump-truck: resolve to the current DumpTruckSpawner deployment tile.
  // If the deployment is on another floor, returns null (caller falls
  // back to its own strategy).
  function _resolveDumpTruck(spec) {
    if (!_resolvers.getDumpTruck) return null;
    var dep = null;
    try { dep = _resolvers.getDumpTruck(); } catch (e) { return null; }
    if (!dep || !dep.tiles || dep.tiles.length === 0) return null;
    if (typeof spec.floorId === 'string' && dep.floorId !== spec.floorId) return null;
    var t = dep.tiles[0];
    if (!t || t.length < 2) return null;
    return { floorId: dep.floorId, x: t[0] | 0, y: t[1] | 0 };
  }

  // door-to: find the tile on `floorId` whose doorTargets entry equals
  // `targetFloorId`. Needs the floor data, so routes through getFloorData.
  function _resolveDoorTo(spec) {
    if (typeof spec.floorId !== 'string' || typeof spec.targetFloorId !== 'string') return null;
    if (!_resolvers.getFloorData) return null;
    var fd = null;
    try { fd = _resolvers.getFloorData(spec.floorId); } catch (e) { return null; }
    if (!fd || !fd.doorTargets) return null;
    for (var key in fd.doorTargets) {
      if (fd.doorTargets[key] === spec.targetFloorId) {
        var parts = key.split(',');
        var x = parseInt(parts[0], 10);
        var y = parseInt(parts[1], 10);
        if (!isFinite(x) || !isFinite(y)) return null;
        return { floorId: spec.floorId, x: x, y: y };
      }
    }
    return null;
  }

  // ── Getters ──────────────────────────────────────────────────────
  function getQuest(id)        { return _quests[id] || null; }
  function listQuests()        { return Object.keys(_quests); }
  function listByKind(kind) {
    var out = [];
    Object.keys(_quests).forEach(function (id) {
      if (_quests[id] && _quests[id].kind === kind) out.push(id);
    });
    return out;
  }
  function anchorsFor(floorId) { return (_floorQuestIndex[floorId] || []).slice(); }
  function getAnchor(id)       { return _namedAnchors[id] || null; }
  function listAnchors()       { return Object.keys(_namedAnchors); }
  function getVersion()        { return _version; }
  function getTemplates()      { return _templates; }
  function getSource()         { return _source; }
  function getLastError()      { return _lastError; }

  // ── Phase 0 introspection ────────────────────────────────────────
  function summary() {
    return {
      initialized:     _initialized,
      version:         _version,
      source:          _source,
      questCount:      Object.keys(_quests).length,
      anchorCount:     Object.keys(_namedAnchors).length,
      floorIndexCount: Object.keys(_floorQuestIndex).length,
      resolversWired:  !!(_resolvers.getFloorData || _resolvers.getEntity ||
                          _resolvers.getNpcById    || _resolvers.getDumpTruck)
    };
  }

  return Object.freeze({
    init:          init,
    setResolvers:  setResolvers,
    resolveAnchor: resolveAnchor,
    getQuest:      getQuest,
    listQuests:    listQuests,
    listByKind:    listByKind,
    anchorsFor:    anchorsFor,
    getAnchor:     getAnchor,
    listAnchors:   listAnchors,
    getVersion:    getVersion,
    getTemplates:  getTemplates,
    getSource:     getSource,
    getLastError:  getLastError,
    summary:       summary,
    get initialized() { return _initialized; }
  });
})();

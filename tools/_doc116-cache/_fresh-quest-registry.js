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
  var _anchorSources    = Object.freeze({});   // { anchorId: 'central' | <sidecar filename> } — Phase 6
  var _floorQuestIndex  = Object.freeze({});   // { floorId: [questId, ...] }
  var _version          = 0;
  var _templates        = Object.freeze({});   // _templates key from quests.json
  var _source           = null;                // 'quests.json' | 'inline' | null
  var _lastError        = null;
  var _initErrors       = [];                  // Phase 6 fail-fast log (unresolved anchor refs, etc.)

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

  // Normalize one anchor spec object. Returns {normalized, ok, reason}.
  function _normalizeAnchorSpec(spec) {
    if (!spec || typeof spec !== 'object') {
      return { ok: false, reason: 'not-an-object' };
    }
    if (typeof spec.type !== 'string') {
      if (typeof spec.floorId === 'string' &&
          typeof spec.x === 'number' && typeof spec.y === 'number') {
        return {
          ok: true,
          normalized: { type: 'literal', floorId: spec.floorId, x: spec.x, y: spec.y }
        };
      }
      return { ok: false, reason: 'missing-type' };
    }
    var copy = {};
    Object.keys(spec).forEach(function (k) { copy[k] = spec[k]; });
    return { ok: true, normalized: copy };
  }

  function init(payload, floorAnchors, distributedAnchors) {
    _lastError = null;
    _initErrors = [];
    _initialized = true;

    if (!payload || typeof payload !== 'object') {
      _version          = 0;
      _quests           = Object.freeze({});
      _namedAnchors     = Object.freeze({});
      _anchorSources    = Object.freeze({});
      _floorQuestIndex  = Object.freeze({});
      _templates        = Object.freeze({});
      _source           = null;
      return true;
    }

    _version   = (payload.version | 0) || 1;
    _templates = _freezeDeep(payload._templates || {});
    _source    = payload._source || 'quests.json';

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

    var naOut     = {};
    var srcOut    = {};

    var namedIn = (payload.anchors && typeof payload.anchors === 'object' &&
                   !Array.isArray(payload.anchors)) ? payload.anchors : {};
    Object.keys(namedIn).forEach(function (id) {
      var r = _normalizeAnchorSpec(namedIn[id]);
      if (!r.ok) return;
      naOut[id]  = r.normalized;
      srcOut[id] = 'central';
    });

    if (distributedAnchors && typeof distributedAnchors === 'object' &&
        !Array.isArray(distributedAnchors)) {
      Object.keys(distributedAnchors).forEach(function (id) {
        if (Object.prototype.hasOwnProperty.call(naOut, id)) {
          _initErrors.push({
            kind:   'anchor-collision',
            anchor: id,
            sources: ['central', 'distributed'],
            msg:    'Distributed anchor "' + id + '" collides with central registry — central wins.'
          });
          return;
        }
        var r = _normalizeAnchorSpec(distributedAnchors[id]);
        if (!r.ok) {
          _initErrors.push({
            kind:   'anchor-malformed',
            anchor: id,
            source: 'distributed',
            reason: r.reason,
            msg:    'Distributed anchor "' + id + '" rejected: ' + r.reason
          });
          return;
        }
        naOut[id]  = r.normalized;
        srcOut[id] = 'distributed';
      });
    }
    _namedAnchors  = _freezeDeep(naOut);
    _anchorSources = _freezeDeep(srcOut);

    var aOut = {};
    if (floorAnchors && typeof floorAnchors === 'object') {
      Object.keys(floorAnchors).forEach(function (fid) {
        var list = floorAnchors[fid];
        if (!Array.isArray(list)) return;
        aOut[fid] = list.map(function (q) {
          if (typeof q === 'string') return q;
          if (q && typeof q === 'object' && typeof q.id === 'string') return q.id;
          return null;
        }).filter(function (id) { return !!id; });
      });
    }
    _floorQuestIndex = _freezeDeep(aOut);

    _validateQuestAnchors();

    if (_initErrors.length > 0) {
      _lastError = _initErrors[0].msg;
      return false;
    }
    return true;
  }

  function _validateQuestAnchors() {
    Object.keys(_quests).forEach(function (qid) {
      var q = _quests[qid];
      if (!q || !Array.isArray(q.steps)) return;
      q.steps.forEach(function (step, sIdx) {
        if (!step || typeof step !== 'object') return;
        var probes = [];
        if (step.target) probes.push({ obj: step.target, path: 'target' });
        if (step.advanceWhen) probes.push({ obj: step.advanceWhen, path: 'advanceWhen' });
        probes.forEach(function (p) {
          var a = p.obj.anchor;
          if (typeof a === 'string' && a.length > 0) {
            if (!Object.prototype.hasOwnProperty.call(_namedAnchors, a)) {
              _initErrors.push({
                kind:   'unresolved-anchor',
                quest:  qid,
                stepId: step.id || ('step[' + sIdx + ']'),
                path:   p.path + '.anchor',
                anchor: a,
                msg:    'Quest "' + qid + '" step "' + (step.id || sIdx) +
                        '" references unknown anchor "' + a + '" at ' + p.path + '.anchor'
              });
            }
          }
        });
      });
    });
  }

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

  function resolveAnchor(specOrId) {
    var spec = null;
    if (typeof specOrId === 'string') {
      spec = _namedAnchors[specOrId] || null;
    } else if (specOrId && typeof specOrId === 'object') {
      spec = specOrId;
    }
    if (!spec || typeof spec !== 'object') return null;
    switch (spec.type) {
      case 'literal':
        if (typeof spec.floorId !== 'string') return null;
        if (typeof spec.x !== 'number' || typeof spec.y !== 'number') return null;
        return { floorId: spec.floorId, x: spec.x | 0, y: spec.y | 0 };
      default: return null;
    }
  }

  function getQuest(id)        { return _quests[id] || null; }
  function listQuests()        { return Object.keys(_quests); }
  function listByKind(kind) {
    var out = [];
    Object.keys(_quests).forEach(function (id) {
      if (_quests[id] && _quests[id].kind === kind) out.push(id);
    });
    return out;
  }
  function anchorsFor(floorId)   { return (_floorQuestIndex[floorId] || []).slice(); }
  function getAnchor(id)         { return _namedAnchors[id] || null; }
  function getAnchorSource(id)   { return _anchorSources[id] || null; }
  function listAnchors()         { return Object.keys(_namedAnchors); }
  function listCentralAnchors()  {
    return Object.keys(_anchorSources).filter(function (id) { return _anchorSources[id] === 'central'; });
  }
  function listDistributedAnchors() {
    return Object.keys(_anchorSources).filter(function (id) { return _anchorSources[id] === 'distributed'; });
  }
  function getVersion()        { return _version; }
  function getTemplates()      { return _templates; }
  function getSource()         { return _source; }
  function getLastError()      { return _lastError; }
  function getInitErrors()     { return _initErrors.slice(); }

  // ── DOC-116 gate-taxonomy coordination query API ─────────────────
  function flagReferenced(flag) {
    if (typeof flag !== 'string' || !flag) return false;
    var ids = Object.keys(_quests);
    for (var i = 0; i < ids.length; i++) {
      var q = _quests[ids[i]];
      if (!q || !Array.isArray(q.steps)) continue;
      for (var s = 0; s < q.steps.length; s++) {
        var step = q.steps[s];
        if (!step || !step.advanceWhen) continue;
        if (step.advanceWhen.kind === 'flag' && step.advanceWhen.flag === flag) return true;
      }
    }
    return false;
  }

  function hasStep(questId, stepIdxOrId) {
    if (typeof questId !== 'string' || !questId) return false;
    var q = _quests[questId];
    if (!q || !Array.isArray(q.steps) || q.steps.length === 0) return false;
    if (typeof stepIdxOrId === 'number' && isFinite(stepIdxOrId)) {
      var idx = stepIdxOrId | 0;
      return idx >= 0 && idx < q.steps.length;
    }
    if (typeof stepIdxOrId === 'string' && stepIdxOrId.length > 0) {
      for (var i = 0; i < q.steps.length; i++) {
        var s = q.steps[i];
        if (s && s.id === stepIdxOrId) return true;
      }
    }
    return false;
  }

  function summary() {
    return {
      initialized:         _initialized,
      version:             _version,
      source:              _source,
      questCount:          Object.keys(_quests).length,
      anchorCount:         Object.keys(_namedAnchors).length,
      initErrorCount:      _initErrors.length
    };
  }

  return Object.freeze({
    init:                    init,
    setResolvers:            setResolvers,
    resolveAnchor:           resolveAnchor,
    getQuest:                getQuest,
    listQuests:              listQuests,
    listByKind:              listByKind,
    anchorsFor:              anchorsFor,
    getAnchor:               getAnchor,
    getAnchorSource:         getAnchorSource,
    listAnchors:             listAnchors,
    listCentralAnchors:      listCentralAnchors,
    listDistributedAnchors:  listDistributedAnchors,
    getVersion:              getVersion,
    getTemplates:            getTemplates,
    getSource:               getSource,
    getLastError:            getLastError,
    getInitErrors:           getInitErrors,
    flagReferenced:          flagReferenced,
    hasStep:                 hasStep,
    summary:                 summary,
    get initialized() { return _initialized; }
  });
})();

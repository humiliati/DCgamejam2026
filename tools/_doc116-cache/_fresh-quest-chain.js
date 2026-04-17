/**
 * QuestChain — DOC-116 slice harness mirror.
 *
 * Stripped-down copy of engine/quest-chain.js focused on the surface
 * the DOC-116 gate-coord verification harness exercises:
 *   - state machine: init, setActive, advance, complete, listActive
 *   - predicate engine: _matches (via advance)
 *   - external events: onGateOpened (new), onItemAcquired (sanity)
 *   - new public getter: isStepComplete(questId, stepIdxOrId)
 *
 * Matches the public API of the production module 1:1 for the
 * functions exercised by the harness. Marker/timer/waypoint logic is
 * intentionally omitted — those are tested by their own DOC-107/113
 * harnesses.
 */
var QuestChain = (function () {
  'use strict';

  var _initialized = false;
  var _active      = {};
  var _listeners   = {
    'state-change':  [],
    'waypoint':      [],
    'completed':     [],
    'marker-change': [],
    'prefs-change':  [],
    'timer-start':   [],
    'timer-tick':    [],
    'timer-zone':    [],
    'timer-expired': [],
    'timer-cancel':  []
  };

  function _emit(name) {
    var arr = _listeners[name];
    if (!arr || !arr.length) return;
    var args = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < arr.length; i++) {
      try { arr[i].apply(null, args); } catch (e) {}
    }
  }
  function on(name, fn)  { if (_listeners[name] && typeof fn === 'function') _listeners[name].push(fn); }
  function off(name, fn) {
    var arr = _listeners[name]; if (!arr) return;
    var idx = arr.indexOf(fn); if (idx >= 0) arr.splice(idx, 1);
  }

  function init() {
    _initialized = true;
    _active = {};
    return true;
  }

  function setActive(questId) {
    if (typeof questId !== 'string' || !questId) return false;
    var def = (typeof QuestRegistry !== 'undefined') ? QuestRegistry.getQuest(questId) : null;
    if (!def) return false;
    var prev = _active[questId] ? _active[questId].state : null;
    _active[questId] = {
      state:        QuestTypes.STATE.ACTIVE,
      stepIndex:    0,
      startedTick:  0,
      stepProgress: {}
    };
    _emit('state-change', questId, prev, QuestTypes.STATE.ACTIVE);
    return true;
  }

  function _matches(predicate, event) {
    if (!predicate || !event) return false;
    if (predicate.kind !== event.kind) return false;
    switch (predicate.kind) {
      case 'floor':
        if (predicate.floorId && predicate.floorId !== event.floorId) return false;
        if (typeof predicate.x === 'number' && typeof predicate.y === 'number') {
          var r = (typeof predicate.radius === 'number') ? predicate.radius : 0;
          var dx = (event.x | 0) - predicate.x;
          var dy = (event.y | 0) - predicate.y;
          return (dx * dx + dy * dy) <= (r * r);
        }
        return true;
      case 'item':
        return predicate.itemId === event.itemId;
      case 'flag':
        if (predicate.flag !== event.flag) return false;
        if (typeof predicate.value === 'undefined') return !!event.value;
        return predicate.value === event.value;
      case 'gate-opened':
        if (predicate.floorId && predicate.floorId !== event.floorId) return false;
        if (typeof predicate.x === 'number' && typeof predicate.y === 'number') {
          if ((event.x | 0) !== predicate.x || (event.y | 0) !== predicate.y) return false;
        }
        if (predicate.gateType && predicate.gateType !== event.gateType) return false;
        return true;
      default:
        return false;
    }
  }

  function advance(questId, waypoint) {
    var rec = _active[questId];
    if (!rec || rec.state !== QuestTypes.STATE.ACTIVE) return false;
    if (waypoint == null) {
      rec.stepIndex += 1;
      _emit('waypoint', questId, null);
      _maybeComplete(questId);
      return true;
    }
    var def = QuestRegistry.getQuest(questId);
    if (!def || !Array.isArray(def.steps) || rec.stepIndex >= def.steps.length) return false;
    var step = def.steps[rec.stepIndex];
    if (!step || !_matches(step.advanceWhen, waypoint)) return false;
    var needed = (step.advanceWhen && +step.advanceWhen.count) | 0;
    if (needed >= 2) {
      if (!rec.stepProgress) rec.stepProgress = {};
      var prog = (rec.stepProgress[rec.stepIndex] | 0) + 1;
      rec.stepProgress[rec.stepIndex] = prog;
      if (prog < needed) {
        _emit('waypoint', questId, {
          kind: waypoint.kind, partial: true, progress: prog, of: needed, event: waypoint
        });
        return true;
      }
      delete rec.stepProgress[rec.stepIndex];
    }
    rec.stepIndex += 1;
    _emit('waypoint', questId, waypoint);
    _maybeComplete(questId);
    return true;
  }

  function _maybeComplete(questId) {
    var rec = _active[questId];
    if (!rec || rec.state !== QuestTypes.STATE.ACTIVE) return;
    var def = (typeof QuestRegistry !== 'undefined') ? QuestRegistry.getQuest(questId) : null;
    var totalSteps = (def && Array.isArray(def.steps)) ? def.steps.length : 0;
    if (totalSteps > 0 && rec.stepIndex >= totalSteps) {
      complete(questId);
    }
  }

  function complete(questId) {
    var rec = _active[questId];
    if (!rec) return false;
    var prev = rec.state;
    rec.state = QuestTypes.STATE.COMPLETED;
    _emit('state-change', questId, prev, QuestTypes.STATE.COMPLETED);
    _emit('completed', questId);
    return true;
  }

  function listActive() {
    var out = [];
    Object.keys(_active).forEach(function (id) {
      if (_active[id].state === QuestTypes.STATE.ACTIVE) out.push(id);
    });
    return out;
  }

  function _dispatch(event) {
    var ids = listActive();
    var advanced = false;
    for (var i = 0; i < ids.length; i++) {
      if (advance(ids[i], event)) advanced = true;
    }
    return advanced;
  }

  function onItemAcquired(itemId) {
    if (typeof itemId !== 'string' || !itemId) return false;
    return _dispatch({ kind: 'item', itemId: itemId });
  }
  function onFlagChanged(flag, value) {
    if (typeof flag !== 'string' || !flag) return false;
    return _dispatch({ kind: 'flag', flag: flag, value: value });
  }

  // DOC-116 — gate-opened fan-out
  function onGateOpened(floorId, x, y, gateType) {
    if (typeof floorId !== 'string' || !floorId) return false;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    var gt = (typeof gateType === 'string' && gateType) ? gateType : null;
    return _dispatch({
      kind:     'gate-opened',
      floorId:  floorId,
      x:        x | 0,
      y:        y | 0,
      gateType: gt
    });
  }

  function getState(questId) {
    return _active[questId] ? _active[questId].state : null;
  }
  function getStepIndex(questId) {
    return _active[questId] ? _active[questId].stepIndex : -1;
  }

  // DOC-116 — isStepComplete
  function isStepComplete(questId, stepIdxOrId) {
    var rec = _active[questId];
    if (!rec) return false;
    var def = (typeof QuestRegistry !== 'undefined') ? QuestRegistry.getQuest(questId) : null;
    if (!def || !Array.isArray(def.steps) || def.steps.length === 0) return false;
    var idx = -1;
    if (typeof stepIdxOrId === 'number' && isFinite(stepIdxOrId)) {
      idx = stepIdxOrId | 0;
    } else if (typeof stepIdxOrId === 'string' && stepIdxOrId.length > 0) {
      for (var i = 0; i < def.steps.length; i++) {
        var s = def.steps[i];
        if (s && s.id === stepIdxOrId) { idx = i; break; }
      }
    }
    if (idx < 0 || idx >= def.steps.length) return false;
    if (rec.state === QuestTypes.STATE.COMPLETED) return true;
    if (rec.state === QuestTypes.STATE.ACTIVE)    return idx < rec.stepIndex;
    return false;
  }

  return Object.freeze({
    init:            init,
    on:              on,
    off:             off,
    setActive:       setActive,
    advance:         advance,
    complete:        complete,
    onItemAcquired:  onItemAcquired,
    onFlagChanged:   onFlagChanged,
    onGateOpened:    onGateOpened,
    listActive:      listActive,
    getState:        getState,
    getStepIndex:    getStepIndex,
    isStepComplete:  isStepComplete,
    get initialized() { return _initialized; }
  });
})();

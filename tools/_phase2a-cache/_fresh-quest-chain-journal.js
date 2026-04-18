/**
 * QuestChain.getJournalEntries — Phase 2.1a harness mirror.
 *
 * Verbatim copy of the projection function from engine/quest-chain.js.
 * Exposes _seedActive(map) so the harness can inject fixture quest
 * records covering ACTIVE/COMPLETED/FAILED/EXPIRED states.
 *
 * Depends on QuestTypes (loaded in the same vm context).
 * Reads QuestRegistry.getQuest(id) when present.
 */
'use strict';

var QuestChainJournal = (function () {
  var _active = {};

  var _KIND_ORDER = { main: 0, side: 1, contract: 2 };
  function getJournalEntries(filter) {
    filter = filter || {};
    var wantActive    = !!filter.active;
    var wantCompleted = !!filter.completed;
    var wantFailed    = !!filter.failed;
    var wantExpired   = !!filter.expired;
    var hasAnyFilter  = wantActive || wantCompleted || wantFailed || wantExpired;
    var out = [];
    var ids = Object.keys(_active);
    for (var i = 0; i < ids.length; i++) {
      var rec = _active[ids[i]];
      if (!rec) continue;
      var st = rec.state;
      if (hasAnyFilter) {
        var keep = (wantActive    && st === QuestTypes.STATE.ACTIVE)    ||
                   (wantCompleted && st === QuestTypes.STATE.COMPLETED) ||
                   (wantFailed    && st === QuestTypes.STATE.FAILED)    ||
                   (wantExpired   && st === QuestTypes.STATE.EXPIRED);
        if (!keep) continue;
      }
      var def = (typeof QuestRegistry !== 'undefined') ? QuestRegistry.getQuest(ids[i]) : null;
      var steps = def ? (def.steps || []) : [];
      var totalSteps = steps.length;
      var stepObj = (rec.stepIndex >= 0 && rec.stepIndex < totalSteps) ? steps[rec.stepIndex] : null;
      var progressCurrent = (st === QuestTypes.STATE.COMPLETED) ? totalSteps : rec.stepIndex;
      var breadcrumb = '';
      if (def && def.giver && def.giver.floorId) {
        breadcrumb = 'floor.' + def.giver.floorId + '.name';
      }
      out.push({
        id:          ids[i],
        state:       st,
        stepIndex:   rec.stepIndex,
        totalSteps:  totalSteps,
        progress:    { current: progressCurrent, total: totalSteps },
        kind:        def ? def.kind : null,
        act:         def ? (def.act || null) : null,
        title:       def ? (def.title || ids[i]) : ids[i],
        summary:     def ? (def.summary || '') : '',
        stepLabel:   stepObj ? (stepObj.label || '') : '',
        stepId:      stepObj ? (stepObj.id || '') : '',
        stepKind:    stepObj ? (stepObj.kind || '') : '',
        markerColor: def ? (def.markerColor || null) : null,
        giver:       def ? (def.giver || null) : null,
        breadcrumb:  breadcrumb,
        rewards:     def ? (def.rewards || null) : null,
        failReason:  rec.failReason || null,
        startedTick: rec.startedTick || 0,
        label:       def ? (def.label || def.title || ids[i]) : ids[i],
        steps:       steps
      });
    }
    out.sort(function (a, b) {
      var ao = (_KIND_ORDER[a.kind] !== undefined) ? _KIND_ORDER[a.kind] : 99;
      var bo = (_KIND_ORDER[b.kind] !== undefined) ? _KIND_ORDER[b.kind] : 99;
      if (ao !== bo) return ao - bo;
      return (a.startedTick || 0) - (b.startedTick || 0);
    });
    return out;
  }

  function _seedActive(map) {
    _active = {};
    if (!map) return;
    Object.keys(map).forEach(function (id) { _active[id] = map[id]; });
  }
  function _clear() { _active = {}; }

  return {
    getJournalEntries: getJournalEntries,
    _seedActive:       _seedActive,
    _clear:            _clear
  };
})();

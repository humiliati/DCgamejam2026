/**
 * QuestChain — runtime state machine for in-progress quests.
 *
 * Layer 3.5 (extracted game helper). Loaded after QuestRegistry (L1),
 * FloorManager / Player / DungeonSchedule / ReadinessCalc (L3), and
 * DispatcherChoreography (L3.5). Loaded BEFORE quest-waypoint.js —
 * which is now a thin shim whose state-machine logic lives here.
 *
 * DOC-107 Phase 1 responsibilities:
 *   1. Track active quests + current step index (Phase 0 already)
 *   2. Predicate engine for advanceWhen: floor/item/npc/flag/readiness/combat
 *   3. External event ingestion: onItemAcquired, onFlagChanged,
 *      onReadinessChange, onFloorArrive, onNpcTalk, onCombatKill
 *   4. getCurrentMarker(floorId) for Minimap per-frame pulls.
 *      Falls back to the DOC-66 §2 navigation-hint state machine
 *      (ported verbatim from engine/quest-waypoint.js) when no active
 *      quest owns a marker for the requested floor.
 *
 * Event bus (same model as HUD.setOnTierCross + CardAuthority.on/off):
 *   QuestChain.on('state-change',  fn)  — (questId, prev, next) => void
 *   QuestChain.on('waypoint',      fn)  — (questId, waypoint)   => void
 *   QuestChain.on('completed',     fn)  — (questId)             => void
 *   QuestChain.on('marker-change', fn)  — (floorId, marker)     => void
 */
var QuestChain = (function () {
  'use strict';

  var _initialized = false;
  var _active      = {};   // { questId: { state, stepIndex, startedTick, flags } }
  var _listeners   = {
    'state-change':  [],
    'waypoint':      [],
    'completed':     [],
    'marker-change': []
  };
  var _tickCount   = 0;    // monotonic counter for start/update ordering

  // Sticky marker cache: last good { floorId, x, y } per floor.
  // Ported from QuestWaypoint._lastQuestTarget so the marker doesn't
  // flicker when a transient resolver fails.
  var _sticky = {};        // { floorId: { x, y } }

  // Injected callbacks (set via init(opts)) — kept in the same shape
  // QuestWaypoint used so the Game.init wiring carries over unchanged.
  var _opts = {
    getDispatcherPhase:  null,
    getDispatcherEntity: null,
    findGateDoorPos:     null
  };

  // Exterior floor chain — used by findProgressionDoorForward.
  // Mirrors quest-waypoint.js:_EXTERIOR_CHAIN. Kept as a local so
  // QuestChain stays authoritative after quest-waypoint is retired.
  var _EXTERIOR_CHAIN = ['0', '1', '2', '3'];

  function _emit(event, a, b, c) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](a, b, c); } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[QuestChain] ' + event + ' listener threw:', e);
        }
      }
    }
  }

  // ── Init ─────────────────────────────────────────────────────────
  // Absorbs QuestWaypoint's old init opts so Game only has to wire
  // callbacks once. opts is optional — backwards compatible with the
  // Phase 0 `QuestChain.init()` call with no args.
  function init(opts) {
    _initialized = true;
    _active      = {};
    _tickCount   = 0;
    _sticky      = {};
    if (opts && typeof opts === 'object') {
      if (typeof opts.getDispatcherPhase  === 'function') _opts.getDispatcherPhase  = opts.getDispatcherPhase;
      if (typeof opts.getDispatcherEntity === 'function') _opts.getDispatcherEntity = opts.getDispatcherEntity;
      if (typeof opts.findGateDoorPos     === 'function') _opts.findGateDoorPos     = opts.findGateDoorPos;
    }
    return true;
  }

  // ── Event bus ────────────────────────────────────────────────────
  function on(event, fn)  {
    if (!_listeners[event] || typeof fn !== 'function') return false;
    _listeners[event].push(fn);
    return true;
  }
  function off(event, fn) {
    if (!_listeners[event]) return false;
    var i = _listeners[event].indexOf(fn);
    if (i !== -1) { _listeners[event].splice(i, 1); return true; }
    return false;
  }

  // ── State mutation ───────────────────────────────────────────────
  function setActive(questId) {
    if (typeof QuestTypes === 'undefined' || !QuestTypes.isValidId(questId)) return false;
    if (typeof QuestRegistry === 'undefined') return false;

    var prev = _active[questId] ? _active[questId].state : QuestTypes.STATE.LOCKED;
    _active[questId] = {
      state:       QuestTypes.STATE.ACTIVE,
      stepIndex:   0,
      startedTick: ++_tickCount,
      flags:       {}
    };
    _emit('state-change', questId, prev, QuestTypes.STATE.ACTIVE);
    return true;
  }

  // Phase 1 advance: if a waypoint object is passed and its predicate
  // matches the current step's advanceWhen, increment stepIndex. If the
  // quest runs out of steps, transition to COMPLETED. Callers that want
  // the Phase 0 "just bump the step" behavior can pass no waypoint —
  // the index increments unconditionally and no predicate is checked.
  function advance(questId, waypoint) {
    var rec = _active[questId];
    if (!rec || rec.state !== QuestTypes.STATE.ACTIVE) return false;

    // Unconditional bump if no waypoint supplied (back-compat).
    if (waypoint == null) {
      rec.stepIndex += 1;
      _emit('waypoint', questId, null);
      _maybeComplete(questId);
      return true;
    }

    // Predicated advance: only move forward if the current step's
    // advanceWhen predicate is satisfied by the supplied waypoint event.
    var def = QuestRegistry.getQuest(questId);
    if (!def || !Array.isArray(def.steps) || rec.stepIndex >= def.steps.length) return false;
    var step = def.steps[rec.stepIndex];
    if (!step || !_matches(step.advanceWhen, waypoint)) return false;

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
    _emit('completed',    questId);
    return true;
  }

  function fail(questId, reason) {
    var rec = _active[questId];
    if (!rec) return false;
    var prev = rec.state;
    rec.state = QuestTypes.STATE.FAILED;
    rec.failReason = reason || null;
    _emit('state-change', questId, prev, QuestTypes.STATE.FAILED);
    return true;
  }
  function expire(questId) {
    var rec = _active[questId];
    if (!rec) return false;
    var prev = rec.state;
    rec.state = QuestTypes.STATE.EXPIRED;
    _emit('state-change', questId, prev, QuestTypes.STATE.EXPIRED);
    return true;
  }

  // ── Predicate engine ─────────────────────────────────────────────
  // Checks whether `event` satisfies `predicate` (the step.advanceWhen
  // object from quests.json). Returns boolean.
  //
  // Predicate shapes map 1:1 to QuestTypes.WAYPOINT_KIND values:
  //   { kind:'floor',     floorId, x, y, radius? }
  //   { kind:'item',      itemId }
  //   { kind:'npc',       npcId, branch? }
  //   { kind:'flag',      flag, value? }       // value undefined → truthy
  //   { kind:'readiness', floorId, threshold } // crosses threshold
  //   { kind:'combat',    archetype }
  //
  // `event` is a plain object mirroring the fired event:
  //   { kind:'floor',     floorId, x, y }       from onFloorArrive
  //   { kind:'item',      itemId }              from onItemAcquired
  //   { kind:'npc',       npcId, branch }       from onNpcTalk
  //   { kind:'flag',      flag, value }         from onFlagChanged
  //   { kind:'readiness', floorId, score }      from onReadinessChange
  //   { kind:'combat',    archetype }           from onCombatKill
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

      case 'npc':
        if (predicate.npcId !== event.npcId) return false;
        if (predicate.branch && predicate.branch !== event.branch) return false;
        return true;

      case 'flag':
        if (predicate.flag !== event.flag) return false;
        if (typeof predicate.value === 'undefined') return !!event.value;
        return predicate.value === event.value;

      case 'readiness':
        if (predicate.floorId && predicate.floorId !== event.floorId) return false;
        return (+event.score || 0) >= (+predicate.threshold || 0);

      case 'combat':
        return predicate.archetype === event.archetype;

      default:
        return false;
    }
  }

  // Walk all active quests, evaluate against the incoming event, and
  // advance any whose current step's advanceWhen matches. Emits
  // 'marker-change' if the current-floor marker changed.
  function _dispatch(event) {
    var ids = listActive();
    var advanced = false;
    for (var i = 0; i < ids.length; i++) {
      if (advance(ids[i], event)) advanced = true;
    }
    if (advanced && typeof FloorManager !== 'undefined') {
      var fid = FloorManager.getFloor ? FloorManager.getFloor() : null;
      if (fid) _emit('marker-change', fid, getCurrentMarker(fid));
    }
    return advanced;
  }

  // ── External event ingestion ─────────────────────────────────────
  // Called from Game (and CardAuthority / ReadinessCalc / etc.) when a
  // relevant event fires. These are pure fan-out wrappers around
  // _dispatch; keeping them named lets call sites stay self-documenting.

  function onItemAcquired(itemId) {
    if (typeof itemId !== 'string' || !itemId) return false;
    return _dispatch({ kind: 'item', itemId: itemId });
  }

  function onFlagChanged(flag, value) {
    if (typeof flag !== 'string' || !flag) return false;
    return _dispatch({ kind: 'flag', flag: flag, value: value });
  }

  function onReadinessChange(floorId, score) {
    if (typeof floorId !== 'string') return false;
    return _dispatch({ kind: 'readiness', floorId: floorId, score: +score || 0 });
  }

  function onFloorArrive(floorId, x, y) {
    if (typeof floorId !== 'string') return false;
    return _dispatch({ kind: 'floor', floorId: floorId, x: x | 0, y: y | 0 });
  }

  function onNpcTalk(npcId, branch) {
    if (typeof npcId !== 'string' || !npcId) return false;
    return _dispatch({ kind: 'npc', npcId: npcId, branch: branch || null });
  }

  function onCombatKill(archetype) {
    if (typeof archetype !== 'string' || !archetype) return false;
    return _dispatch({ kind: 'combat', archetype: archetype });
  }

  // ── Marker resolution ────────────────────────────────────────────
  // Returns the {x, y} marker the Minimap should render for `floorId`,
  // or null if no marker applies. Priority:
  //   1. First active quest whose current step targets this floor
  //      (resolved via QuestRegistry.resolveAnchor) — step.target can
  //      be a literal {floorId,x,y}, an anchor-id string, or a spec
  //   2. DOC-66 §2 navigation-hint state machine (ported from
  //      QuestWaypoint.updateQuestTarget)
  //   3. Sticky fallback (last good marker for this floor)
  function getCurrentMarker(floorId) {
    if (typeof floorId !== 'string') return null;

    // (1) Active quest step target
    var ids = listActive();
    for (var i = 0; i < ids.length; i++) {
      var rec = _active[ids[i]];
      var def = (typeof QuestRegistry !== 'undefined') ? QuestRegistry.getQuest(ids[i]) : null;
      if (!def || !Array.isArray(def.steps) || rec.stepIndex >= def.steps.length) continue;
      var step = def.steps[rec.stepIndex];
      if (!step || !step.target) continue;
      var resolved = _resolveStepTarget(step.target);
      if (resolved && resolved.floorId === floorId) {
        _sticky[floorId] = { x: resolved.x, y: resolved.y };
        return { x: resolved.x, y: resolved.y };
      }
    }

    // (2) Navigation hint — legacy state machine
    var hint = _legacyNavigationMarker(floorId);
    if (hint) {
      _sticky[floorId] = { x: hint.x, y: hint.y };
      return { x: hint.x, y: hint.y };
    }

    // (3) Sticky fallback
    if (_sticky[floorId]) return { x: _sticky[floorId].x, y: _sticky[floorId].y };
    return null;
  }

  function _resolveStepTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') {
      // Named-anchor id — ask QuestRegistry
      return (typeof QuestRegistry !== 'undefined' && QuestRegistry.resolveAnchor)
        ? QuestRegistry.resolveAnchor(target) : null;
    }
    if (typeof target === 'object') {
      // Spec object or literal {floorId,x,y}
      if (typeof target.type === 'string') {
        return (typeof QuestRegistry !== 'undefined' && QuestRegistry.resolveAnchor)
          ? QuestRegistry.resolveAnchor(target) : null;
      }
      if (typeof target.floorId === 'string' &&
          typeof target.x === 'number' && typeof target.y === 'number') {
        return { floorId: target.floorId, x: target.x | 0, y: target.y | 0 };
      }
    }
    return null;
  }

  // ── Legacy navigation-hint state machine ─────────────────────────
  // Direct port of QuestWaypoint.updateQuestTarget logic. Runs the
  // DOC-66 §2 five-phase state machine to produce a marker coord when
  // no quest is active. Uses typeof guards for every cross-layer
  // reference so it stays robust during boot / under partial init.

  function _floorDepth(id) { return String(id).split('.').length; }

  function _findDoorTo(parentFloorId, targetFloorId) {
    var src = null;
    if (typeof FloorManager !== 'undefined') {
      if (FloorManager.getFloor && FloorManager.getFloor() === parentFloorId) {
        if (FloorManager.getFloorData) src = FloorManager.getFloorData();
      } else if (FloorManager.getFloorCache) {
        src = FloorManager.getFloorCache(parentFloorId);
      }
    }
    if (!src || !src.doorTargets) return null;
    for (var key in src.doorTargets) {
      if (src.doorTargets[key] === targetFloorId) {
        var parts = key.split(',');
        return { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) };
      }
    }
    return null;
  }

  function _findProgressionDoorForward(currentExterior, targetExterior) {
    var ci = _EXTERIOR_CHAIN.indexOf(String(currentExterior));
    var ti = _EXTERIOR_CHAIN.indexOf(String(targetExterior));
    if (ci < 0 || ti < 0 || ci === ti) return null;
    var step = ci < ti ? 1 : -1;
    for (var i = ti; i !== ci; i -= step) {
      var hopTarget = _EXTERIOR_CHAIN[i];
      var pos = _findDoorTo(currentExterior, hopTarget);
      if (pos) return pos;
    }
    return null;
  }

  function _findCurrentDoorExit() {
    if (typeof FloorManager === 'undefined') return null;
    var fd = FloorManager.getFloorData ? FloorManager.getFloorData() : null;
    if (!fd) return null;
    if (fd.doors && fd.doors.doorExit) {
      return { x: fd.doors.doorExit.x, y: fd.doors.doorExit.y };
    }
    if (fd.doorTargets) {
      var bestKey = null, bestLen = 999;
      for (var k in fd.doorTargets) {
        var t = String(fd.doorTargets[k]);
        if (t.length < bestLen) { bestLen = t.length; bestKey = k; }
      }
      if (bestKey) {
        var p = bestKey.split(',');
        return { x: parseInt(p[0], 10), y: parseInt(p[1], 10) };
      }
    }
    return null;
  }

  function _findTruckAnchorOnFloor(floorId) {
    if (typeof DumpTruckSpawner === 'undefined' || !DumpTruckSpawner.getDeployment) return null;
    var dep = DumpTruckSpawner.getDeployment();
    if (!dep || dep.floorId !== floorId || !dep.tiles || dep.tiles.length === 0) return null;
    return { x: dep.tiles[0][0], y: dep.tiles[0][1] };
  }

  function _stickyOrNull(floorId) {
    if (_sticky[floorId]) return { x: _sticky[floorId].x, y: _sticky[floorId].y };
    return null;
  }

  function _legacyNavigationMarker(floorId) {
    if (typeof FloorManager === 'undefined') return null;

    // ── Gate still locked (pre-authorization) ──────────────────────
    var gateUnlocked = (typeof GameActions !== 'undefined' && GameActions.isGateUnlocked)
      ? GameActions.isGateUnlocked() : false;

    if (!gateUnlocked) {
      var dispatcherPhase = _opts.getDispatcherPhase ? _opts.getDispatcherPhase() : null;
      var isDispatcherPhase = dispatcherPhase !== 'done';

      if (isDispatcherPhase) {
        if (floorId === '0') {
          return _findCurrentDoorExit() || _stickyOrNull(floorId);
        } else if (floorId === '1') {
          var dispEntity = _opts.getDispatcherEntity ? _opts.getDispatcherEntity() : null;
          if (dispEntity && !dispEntity._hidden) {
            return { x: dispEntity.x, y: dispEntity.y };
          }
          var gateQ = _opts.findGateDoorPos ? _opts.findGateDoorPos() : null;
          return gateQ ? { x: gateQ.x - 1, y: gateQ.y } : _stickyOrNull(floorId);
        }
        return _findCurrentDoorExit() || _stickyOrNull(floorId);
      }

      // Dispatcher done, gate still locked — home-keys flow.
      // Legacy hardcoded coords; Slice 3 migrates these to named anchors.
      if (floorId === '1') {
        var anchor1 = (typeof QuestRegistry !== 'undefined' && QuestRegistry.resolveAnchor)
          ? QuestRegistry.resolveAnchor('promenade_home_door') : null;
        if (anchor1 && anchor1.floorId === '1') return { x: anchor1.x, y: anchor1.y };
        return { x: 22, y: 27 };
      }
      if (floorId === '1.6') {
        var anchor16 = (typeof QuestRegistry !== 'undefined' && QuestRegistry.resolveAnchor)
          ? QuestRegistry.resolveAnchor('home_work_keys_chest') : null;
        if (anchor16 && anchor16.floorId === '1.6') return { x: anchor16.x, y: anchor16.y };
        return { x: 19, y: 3 };
      }
      return _findCurrentDoorExit() || _stickyOrNull(floorId);
    }

    // ── Dungeon work cycle (gate unlocked) ─────────────────────────
    var nextGroup = (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getNextGroup)
      ? DungeonSchedule.getNextGroup() : null;

    // Hero-reveal club-contract fallback
    var heroRevealed = (typeof Player !== 'undefined' && Player.hasFlag)
      ? Player.hasFlag('heroWakeArrival') : false;
    if (!heroRevealed && typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getSchedule) {
      var schedList = DungeonSchedule.getSchedule();
      var clubContract = null;
      for (var sci = 0; sci < schedList.length; sci++) {
        if (schedList[sci].groupId === 'club' && !schedList[sci].resolved) {
          clubContract = schedList[sci];
          break;
        }
      }
      if (clubContract) {
        var curDay = (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getCurrentDay)
          ? DungeonSchedule.getCurrentDay() : 0;
        nextGroup = {
          groupId:    clubContract.groupId,
          label:      clubContract.label,
          suit:       clubContract.suit,
          floorIds:   clubContract.floorIds,
          target:     clubContract.target,
          actualDay:  clubContract.actualDay,
          daysAway:   Math.max(0, clubContract.actualDay - curDay),
          heroType:   clubContract.heroType,
          onSchedule: clubContract.onSchedule
        };
      }
    }

    if (!nextGroup || !nextGroup.floorIds || nextGroup.floorIds.length === 0) {
      return null;
    }

    var dungeonId  = nextGroup.floorIds[0];
    var segs       = dungeonId.split('.');
    var lobbyId    = segs.slice(0, 2).join('.');
    var exteriorId = segs[0];
    var target     = (nextGroup.target || 0.6);

    // Inside one of the dungeon floors for this group?
    var inThisDungeon = false;
    for (var gi = 0; gi < nextGroup.floorIds.length; gi++) {
      if (floorId === nextGroup.floorIds[gi]) { inThisDungeon = true; break; }
    }

    if (inThisDungeon) {
      var coreScore = (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore)
        ? ReadinessCalc.getCoreScore(floorId) : 0;
      var dData = FloorManager.getFloorData ? FloorManager.getFloorData() : null;
      var stairsUpPos = (dData && dData.doors && dData.doors.stairsUp)
        ? { x: dData.doors.stairsUp.x, y: dData.doors.stairsUp.y } : null;
      var stairsDnPos = (dData && dData.doors && dData.doors.stairsDn)
        ? { x: dData.doors.stairsDn.x, y: dData.doors.stairsDn.y } : null;
      if (coreScore >= target) {
        return stairsUpPos || stairsDnPos || _findTruckAnchorOnFloor(floorId) || _stickyOrNull(floorId);
      }
      return stairsDnPos || stairsUpPos || _findTruckAnchorOnFloor(floorId) || _stickyOrNull(floorId);
    }

    if (floorId === lobbyId) {
      var allFloorsDone = true;
      if (typeof ReadinessCalc !== 'undefined' && ReadinessCalc.getCoreScore) {
        for (var fi = 0; fi < nextGroup.floorIds.length; fi++) {
          if (ReadinessCalc.getCoreScore(nextGroup.floorIds[fi]) < target) {
            allFloorsDone = false;
            break;
          }
        }
      }
      var lobbyData = FloorManager.getFloorData ? FloorManager.getFloorData() : null;
      var lobbyExit = (lobbyData && lobbyData.doors && lobbyData.doors.doorExit)
        ? { x: lobbyData.doors.doorExit.x, y: lobbyData.doors.doorExit.y } : null;
      var lobbyDn = (lobbyData && lobbyData.doors && lobbyData.doors.stairsDn)
        ? { x: lobbyData.doors.stairsDn.x, y: lobbyData.doors.stairsDn.y } : null;
      if (allFloorsDone) return lobbyExit || lobbyDn || _stickyOrNull(floorId);
      return lobbyDn || lobbyExit || _stickyOrNull(floorId);
    }

    if (floorId === exteriorId) {
      return _findDoorTo(exteriorId, lobbyId)
          || _findTruckAnchorOnFloor(floorId)
          || _stickyOrNull(floorId);
    }

    if (_floorDepth(floorId) === 1 && floorId !== exteriorId) {
      return _findDoorTo(floorId, exteriorId)
          || _findProgressionDoorForward(floorId, exteriorId)
          || _findTruckAnchorOnFloor(floorId)
          || _stickyOrNull(floorId);
    }

    return _findCurrentDoorExit() || _stickyOrNull(floorId);
  }

  // ── Marker refresh ───────────────────────────────────────────────
  // Force a marker recompute for the current floor and push to Minimap.
  // Back-compat alias for the old QuestWaypoint.update() entry point —
  // callers migrating to event-driven updates can still trigger an
  // imperative refresh through here.
  function update() {
    if (typeof FloorManager === 'undefined') return null;
    var fid = FloorManager.getFloor ? FloorManager.getFloor() : null;
    if (!fid) return null;
    var marker = getCurrentMarker(fid);
    if (typeof Minimap !== 'undefined' && Minimap.setQuestTarget) {
      Minimap.setQuestTarget(marker ? { x: marker.x, y: marker.y } : null);
    }
    _emit('marker-change', fid, marker);
    return marker;
  }

  // ── Getters ──────────────────────────────────────────────────────
  function getState(questId) {
    return _active[questId] ? _active[questId].state : null;
  }
  function getStepIndex(questId) {
    return _active[questId] ? _active[questId].stepIndex : -1;
  }
  function listActive() {
    var out = [];
    Object.keys(_active).forEach(function (id) {
      if (_active[id].state === QuestTypes.STATE.ACTIVE) out.push(id);
    });
    return out;
  }
  function snapshot() {
    var out = {};
    Object.keys(_active).forEach(function (id) {
      var r = _active[id];
      out[id] = {
        state:       r.state,
        stepIndex:   r.stepIndex,
        startedTick: r.startedTick,
        failReason:  r.failReason || null
      };
    });
    return out;
  }

  function summary() {
    return {
      initialized:  _initialized,
      activeCount:  listActive().length,
      totalTracked: Object.keys(_active).length,
      optsWired:    !!(_opts.getDispatcherPhase || _opts.getDispatcherEntity || _opts.findGateDoorPos),
      stickyFloors: Object.keys(_sticky).length
    };
  }

  return Object.freeze({
    init:               init,
    on:                 on,
    off:                off,
    setActive:          setActive,
    advance:            advance,
    complete:           complete,
    fail:               fail,
    expire:             expire,
    onItemAcquired:     onItemAcquired,
    onFlagChanged:      onFlagChanged,
    onReadinessChange:  onReadinessChange,
    onFloorArrive:      onFloorArrive,
    onNpcTalk:          onNpcTalk,
    onCombatKill:       onCombatKill,
    getCurrentMarker:   getCurrentMarker,
    update:             update,
    getState:           getState,
    getStepIndex:       getStepIndex,
    listActive:         listActive,
    snapshot:           snapshot,
    summary:            summary,
    get initialized() { return _initialized; }
  });
})();

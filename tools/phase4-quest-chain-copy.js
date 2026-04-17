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
    'marker-change': [],
    'prefs-change':  []
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

  // ── UI preferences (DOC-107 Phase 4) ─────────────────────────────
  // Player-authored runtime settings for the quest system. Persisted
  // to localStorage under `gleaner_settings_v1.quest`. Mutations go
  // exclusively through setUIPrefs() so downstream consumers
  // (Minimap marker gate, Journal filter, etc.) can react via the
  // 'prefs-change' event.
  //
  //   markers        — on/off master switch for minimap diamond
  //   hintVerbosity  — 'off' | 'subtle' | 'explicit'
  //                    off      → never show active-quest markers
  //                    subtle   → show active-quest markers only when
  //                               idle ≥ SUBTLE_IDLE_MS (nav-hint always on)
  //                    explicit → always show active-quest markers
  //   waypointFlair  — 'simple' | 'pulsing' | 'trail' (cosmetic, Minimap)
  //   sidequestOptIn — 'all' | 'main-only' | 'ask'
  //                    all        → accept sidequest injection, show markers
  //                    main-only  → suppress side-kind markers and journal
  //                    ask        → per-quest confirmation UI (Phase 5+)
  var _UI_PREFS_DEFAULTS = Object.freeze({
    markers:        true,
    hintVerbosity:  'subtle',
    waypointFlair:  'pulsing',
    sidequestOptIn: 'all'
  });
  var _UI_PREFS_VALID = Object.freeze({
    hintVerbosity:  ['off', 'subtle', 'explicit'],
    waypointFlair:  ['simple', 'pulsing', 'trail'],
    sidequestOptIn: ['all', 'main-only', 'ask']
  });
  var _SETTINGS_KEY    = 'gleaner_settings_v1';
  var SUBTLE_IDLE_MS   = 90000;
  var _uiPrefs         = {
    markers:        _UI_PREFS_DEFAULTS.markers,
    hintVerbosity:  _UI_PREFS_DEFAULTS.hintVerbosity,
    waypointFlair:  _UI_PREFS_DEFAULTS.waypointFlair,
    sidequestOptIn: _UI_PREFS_DEFAULTS.sidequestOptIn
  };
  var _lastProgressionTick = (typeof Date !== 'undefined') ? Date.now() : 0;

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

  // ── UI prefs: getters / setters / persistence (Phase 4) ──────────
  // getUIPrefs() returns a fresh plain copy — callers never see the
  // internal object.
  function getUIPrefs() {
    return {
      markers:        !!_uiPrefs.markers,
      hintVerbosity:  String(_uiPrefs.hintVerbosity),
      waypointFlair:  String(_uiPrefs.waypointFlair),
      sidequestOptIn: String(_uiPrefs.sidequestOptIn)
    };
  }

  function _clampPref(key, value) {
    if (key === 'markers') return !!value;
    var valid = _UI_PREFS_VALID[key];
    if (!valid) return _UI_PREFS_DEFAULTS[key];
    var s = String(value);
    return (valid.indexOf(s) >= 0) ? s : _UI_PREFS_DEFAULTS[key];
  }

  // setUIPrefs(patch) — shallow merge, validated per-key, persisted.
  // Emits 'prefs-change' with the fresh prefs snapshot so Minimap /
  // HUD toast suppression can react.
  function setUIPrefs(patch) {
    if (!patch || typeof patch !== 'object') return getUIPrefs();
    var changed = false;
    if (Object.prototype.hasOwnProperty.call(patch, 'markers')) {
      var nm = !!patch.markers;
      if (nm !== _uiPrefs.markers) { _uiPrefs.markers = nm; changed = true; }
    }
    var keys = ['hintVerbosity', 'waypointFlair', 'sidequestOptIn'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        var nv = _clampPref(k, patch[k]);
        if (nv !== _uiPrefs[k]) { _uiPrefs[k] = nv; changed = true; }
      }
    }
    if (changed) {
      _persistUIPrefs();
      _emit('prefs-change', getUIPrefs());
    }
    return getUIPrefs();
  }

  // Load prefs from localStorage — graceful no-op if storage is
  // absent (node test harness) or the stored blob is malformed.
  function loadUIPrefs() {
    if (typeof localStorage === 'undefined') return getUIPrefs();
    try {
      var raw = localStorage.getItem(_SETTINGS_KEY);
      if (!raw) return getUIPrefs();
      var blob = JSON.parse(raw);
      if (!blob || typeof blob !== 'object') return getUIPrefs();
      var q = blob.quest;
      if (!q || typeof q !== 'object') return getUIPrefs();
      if (Object.prototype.hasOwnProperty.call(q, 'markers')) {
        _uiPrefs.markers = !!q.markers;
      }
      var keys = ['hintVerbosity', 'waypointFlair', 'sidequestOptIn'];
      for (var i = 0; i < keys.length; i++) {
        if (Object.prototype.hasOwnProperty.call(q, keys[i])) {
          _uiPrefs[keys[i]] = _clampPref(keys[i], q[keys[i]]);
        }
      }
      _emit('prefs-change', getUIPrefs());
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[QuestChain] loadUIPrefs failed:', e);
      }
    }
    return getUIPrefs();
  }

  function _persistUIPrefs() {
    if (typeof localStorage === 'undefined') return;
    try {
      var raw = localStorage.getItem(_SETTINGS_KEY);
      var blob = {};
      if (raw) {
        try { blob = JSON.parse(raw) || {}; } catch (e) { blob = {}; }
      }
      blob.quest = getUIPrefs();
      localStorage.setItem(_SETTINGS_KEY, JSON.stringify(blob));
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[QuestChain] persistUIPrefs failed:', e);
      }
    }
  }

  // Touch the idle tick — called by _dispatch when any quest advances,
  // and also by external progression hooks (e.g. step manual advance)
  // so the Subtle idle gate resets on meaningful player progress.
  function _touchProgressionTick() {
    _lastProgressionTick = (typeof Date !== 'undefined') ? Date.now() : 0;
  }

  // Filter active quest IDs by the current sidequestOptIn setting.
  // 'main-only' drops kind==='side'; 'all' and 'ask' pass through.
  function _filterIdsByOptIn(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return ids;
    if (_uiPrefs.sidequestOptIn !== 'main-only') return ids;
    if (typeof QuestRegistry === 'undefined' || !QuestRegistry.getQuest) return ids;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var def = QuestRegistry.getQuest(ids[i]);
      if (!def || def.kind !== 'side') out.push(ids[i]);
    }
    return out;
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
    // Starting a quest is meaningful progress — reset the Subtle idle gate.
    _touchProgressionTick();
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
    if (advanced) {
      // Reset the Subtle idle gate — the player just made progress.
      _touchProgressionTick();
      if (typeof FloorManager !== 'undefined') {
        var fid = FloorManager.getFloor ? FloorManager.getFloor() : null;
        if (fid) _emit('marker-change', fid, getCurrentMarker(fid));
      }
    }
    return advanced;
  }

  // ── External event ingestion ─────────────────────────────────────
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
  function getCurrentMarker(floorId) {
    if (typeof floorId !== 'string') return null;

    // UI prefs gate (Phase 4):
    if (!_uiPrefs.markers) return null;
    if (_uiPrefs.hintVerbosity === 'off') return null;

    // (1) Active quest step target — gated by Subtle idle window
    var ids = _filterIdsByOptIn(listActive());
    var activeMarker = null;
    for (var i = 0; i < ids.length; i++) {
      var rec = _active[ids[i]];
      var def = (typeof QuestRegistry !== 'undefined') ? QuestRegistry.getQuest(ids[i]) : null;
      if (!def || !Array.isArray(def.steps) || rec.stepIndex >= def.steps.length) continue;
      var step = def.steps[rec.stepIndex];
      if (!step || !step.target) continue;
      var resolved = _resolveStepTarget(step.target);
      if (resolved && resolved.floorId === floorId) {
        activeMarker = { x: resolved.x, y: resolved.y };
        break;
      }
    }

    if (activeMarker) {
      if (_uiPrefs.hintVerbosity === 'subtle') {
        var idleMs = ((typeof Date !== 'undefined') ? Date.now() : 0) - _lastProgressionTick;
        if (idleMs < SUBTLE_IDLE_MS) {
          return _stickyOrNull(floorId);
        }
      }
      _sticky[floorId] = activeMarker;
      return activeMarker;
    }

    // (2) Navigation hint — always visible under Subtle (nav-hint carve-out)
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
      return (typeof QuestRegistry !== 'undefined' && QuestRegistry.resolveAnchor)
        ? QuestRegistry.resolveAnchor(target) : null;
    }
    if (typeof target === 'object') {
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

    var nextGroup = (typeof DungeonSchedule !== 'undefined' && DungeonSchedule.getNextGroup)
      ? DungeonSchedule.getNextGroup() : null;

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

  function getJournalEntries(opts) {
    opts = opts || {};
    var includeActive    = (opts.active    !== false);
    var includeCompleted = (opts.completed === true);
    var filter           = (typeof opts.filter === 'string') ? opts.filter : 'all';

    var out  = [];
    var reg  = (typeof QuestRegistry !== 'undefined') ? QuestRegistry : null;
    var ids  = Object.keys(_active);

    var activeIds    = [];
    var completedIds = [];
    for (var i = 0; i < ids.length; i++) {
      var rec = _active[ids[i]];
      if (!rec) continue;
      if (rec.state === QuestTypes.STATE.ACTIVE)    activeIds.push(ids[i]);
      if (rec.state === QuestTypes.STATE.COMPLETED) completedIds.push(ids[i]);
    }
    var byStartedTickDesc = function (a, b) {
      return (_active[b].startedTick || 0) - (_active[a].startedTick || 0);
    };
    activeIds.sort(byStartedTickDesc);
    completedIds.sort(byStartedTickDesc);

    function projectOne(questId, rec) {
      var def = reg ? reg.getQuest(questId) : null;
      if (!def) return null;
      if (filter !== 'all' && def.kind !== filter) return null;
      var steps = Array.isArray(def.steps) ? def.steps : [];
      var si    = Math.min(Math.max(0, rec.stepIndex | 0), Math.max(0, steps.length - 1));
      var step  = steps[si] || null;
      return {
        id:          questId,
        kind:        def.kind || 'side',
        state:       rec.state,
        title:       def.title || null,
        stepLabel:   (step && step.label) ? step.label : null,
        stepIndex:   rec.stepIndex | 0,
        stepTotal:   steps.length | 0,
        breadcrumb:  def.hook || def.summary || null,
        markerColor: def.markerColor || null,
        target:      (step && step.target) ? step.target : null
      };
    }

    if (includeActive) {
      var filteredActive = (_uiPrefs.sidequestOptIn === 'main-only')
        ? _filterIdsByOptIn(activeIds)
        : activeIds;
      for (var ai = 0; ai < filteredActive.length; ai++) {
        var entryA = projectOne(filteredActive[ai], _active[filteredActive[ai]]);
        if (entryA) out.push(entryA);
      }
    }

    if (includeActive && out.length === 0 && (filter === 'all' || filter === 'nav')) {
      var syn = _synthesizeNavHintEntry();
      if (syn) out.push(syn);
    }

    if (includeCompleted) {
      for (var ci = 0; ci < completedIds.length; ci++) {
        var entryC = projectOne(completedIds[ci], _active[completedIds[ci]]);
        if (entryC) out.push(entryC);
      }
    }

    return out;
  }

  function _synthesizeNavHintEntry() {
    if (typeof FloorManager === 'undefined' || !FloorManager.getFloor) return null;
    var floorId = FloorManager.getFloor();
    if (typeof floorId !== 'string') return null;

    var gateUnlocked = (typeof GameActions !== 'undefined' && GameActions.isGateUnlocked)
      ? GameActions.isGateUnlocked()
      : (typeof Game !== 'undefined' && Game.isGateUnlocked ? Game.isGateUnlocked() : false);

    var labelKey;
    if (!gateUnlocked) {
      if      (floorId === '1.6') labelKey = 'quest.nav_hint.find_keys_home';
      else if (floorId === '0')   labelKey = 'quest.nav_hint.enter_promenade';
      else                         labelKey = 'quest.nav_hint.head_home_keys';
    } else if (floorId === '1') {
      labelKey = 'quest.nav_hint.enter_coral_bazaar';
    } else if (floorId === '1.1') {
      labelKey = 'quest.nav_hint.descend_soft_cellar';
    } else if (floorId && floorId.split('.').length >= 3) {
      labelKey = 'quest.nav_hint.clear_dungeon';
    } else {
      labelKey = 'quest.nav_hint.report_to_entrance';
    }

    return {
      id:          '__nav_hint__',
      kind:        'nav',
      state:       QuestTypes.STATE.ACTIVE,
      title:       'quest.nav_hint.title',
      stepLabel:   labelKey,
      stepIndex:   0,
      stepTotal:   1,
      breadcrumb:  null,
      markerColor: null,
      target:      null
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
    getJournalEntries:  getJournalEntries,
    // Phase 4 — UI preferences
    getUIPrefs:         getUIPrefs,
    setUIPrefs:         setUIPrefs,
    loadUIPrefs:        loadUIPrefs,
    SUBTLE_IDLE_MS:     SUBTLE_IDLE_MS,
    get initialized() { return _initialized; }
  });
})();

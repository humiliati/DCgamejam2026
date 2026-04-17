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
  //
  // Phase 5: predicates may carry `count: N` (integer ≥ 2). The step
  // advances only after N matching events. Progress is tracked in
  // `rec.stepProgress[stepIndex]`; intermediate matches emit a
  // 'waypoint' event with `{ partial: true, progress: k, of: N }` so
  // the UI can render a sub-counter without the step advancing.
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

    // Count-gated advance (Phase 5). If the predicate has `count: N`,
    // accumulate matches in rec.stepProgress and only advance on the
    // Nth match.
    var needed = (step.advanceWhen && +step.advanceWhen.count) | 0;
    if (needed >= 2) {
      if (!rec.stepProgress) rec.stepProgress = {};
      var prog = (rec.stepProgress[rec.stepIndex] | 0) + 1;
      rec.stepProgress[rec.stepIndex] = prog;
      if (prog < needed) {
        // Partial progress — emit a partial waypoint so UI can update
        // the "x / N" counter but do NOT bump the step.
        _emit('waypoint', questId, {
          kind:     waypoint.kind,
          partial:  true,
          progress: prog,
          of:       needed,
          event:    waypoint
        });
        return true;
      }
      // Clear the progress slot — step is about to advance.
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
  //   { kind:'minigame',  kindId, reason?, subTargetId?, floorId? }
  //
  // `event` is a plain object mirroring the fired event:
  //   { kind:'floor',     floorId, x, y }       from onFloorArrive
  //   { kind:'item',      itemId }              from onItemAcquired
  //   { kind:'npc',       npcId, branch }       from onNpcTalk
  //   { kind:'flag',      flag, value }         from onFlagChanged
  //   { kind:'readiness', floorId, score }      from onReadinessChange
  //   { kind:'combat',    archetype }           from onCombatKill
  //   { kind:'minigame',  kindId, reason, subTargetId?, floorId?, x?, y? }
  //                                             from onMinigameExit
  //
  // Count semantics (DOC-107 Phase 5): any predicate may carry
  // `count: N` (integer ≥ 2). When set, `_matches()` still returns true
  // per-event; `advance()` tracks cumulative matches in
  // `rec.stepProgress[stepIndex]` and only bumps stepIndex after the Nth
  // match. This lets a single step declare "wash three pentagram tiles"
  // without three separate sequential steps.
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

      case 'minigame':
        // kindId is required: 'pressure_wash', 'lights_out', 'safe_dial', etc.
        if (predicate.kindId && predicate.kindId !== event.kindId) return false;
        // Optional: exit reason ('complete', 'subtarget', 'abort', 'timeout')
        if (predicate.reason && predicate.reason !== event.reason) return false;
        // Optional: subtarget identifier (e.g. 'pentagram_tile')
        if (predicate.subTargetId && predicate.subTargetId !== event.subTargetId) return false;
        // Optional: restrict to a specific floor
        if (predicate.floorId && predicate.floorId !== event.floorId) return false;
        return true;

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

  // Minigame exit fan-out (DOC-107 Phase 5). Called by PickupActions
  // after any minigame dispatches an exit event. kindId is required
  // ('pressure_wash', 'lights_out', 'safe_dial', etc.); reason is the
  // exit cause ('complete', 'subtarget', 'abort', 'timeout'); payload
  // is free-form but the predicate engine reads subTargetId, floorId,
  // x, and y when present.
  //
  // Subtarget events (reason='subtarget') fire DURING play — a single
  // minigame session can emit many. Complete events (reason='complete')
  // fire once at the end. Both route through the same _dispatch path
  // so a quest step can predicate on either.
  function onMinigameExit(kindId, reason, payload) {
    if (typeof kindId !== 'string' || !kindId) return false;
    var event = {
      kind:        'minigame',
      kindId:      kindId,
      reason:      (typeof reason === 'string' && reason) ? reason : 'complete'
    };
    if (payload && typeof payload === 'object') {
      if (typeof payload.subTargetId === 'string') event.subTargetId = payload.subTargetId;
      if (typeof payload.floorId     === 'string') event.floorId     = payload.floorId;
      if (typeof payload.x === 'number') event.x = payload.x | 0;
      if (typeof payload.y === 'number') event.y = payload.y | 0;
    }
    return _dispatch(event);
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

    // UI prefs gate (Phase 4):
    //   markers=false        → master switch; never emit a marker
    //   hintVerbosity='off'  → suppress ALL markers (player opted out)
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
      // Subtle: only reveal the active-quest marker once the player
      // has been idle for ≥ SUBTLE_IDLE_MS. Explicit: always reveal.
      if (_uiPrefs.hintVerbosity === 'subtle') {
        var idleMs = ((typeof Date !== 'undefined') ? Date.now() : 0) - _lastProgressionTick;
        if (idleMs < SUBTLE_IDLE_MS) {
          // Suppress active marker for now — don't fall through to the
          // pre-quest nav-hint (it'd give misleading guidance). Return
          // the sticky if one exists for continuity across floor swaps.
          return _stickyOrNull(floorId);
        }
      }
      _sticky[floorId] = activeMarker;
      return activeMarker;
    }

    // (2) Navigation hint — legacy state machine. Always visible under
    // Subtle (nav-hint carve-out): the pre-quest guidance flow is the
    // player's only wayfinding before the first quest is authored.
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
    var exteriorId = segs[0
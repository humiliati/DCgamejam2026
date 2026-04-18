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
    'prefs-change':  [],
    // DOC-113 Phase C — sprint timer events
    'timer-start':   [],
    'timer-tick':    [],
    'timer-zone':    [],
    'timer-expired': [],
    'timer-cancel':  []
  };
  var _tickCount   = 0;    // monotonic counter for start/update ordering

  // ── DOC-113 Phase C — Sprint timer state ─────────────────────────
  // When a kind:"fetch" step becomes the current step for any active
  // quest, a countdown timer starts. Pauses during MenuBox, dialogue,
  // floor transitions, combat, and cinematic camera locks. Ticked via
  // tickTimer(dt) called from Game._tick or Game._render.
  //
  // Only one timer can be active at a time (the player can only be in
  // one sprint dungeon at a time).
  var _timer = null;   // null when inactive, or:
  // {
  //   questId:        string,
  //   totalMs:        number,
  //   remainMs:       number,
  //   zone:           'green' | 'yellow' | 'red' | 'expired',
  //   paused:         boolean,
  //   heroArchetype:  string,
  //   floorId:        string,
  //   lastTickSec:    number  // second that last 'timer-tick' was emitted
  // }
  var _TIMER_ZONE_THRESHOLDS = { green: 0.60, yellow: 0.30 };

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

  // ── DOC-113 Phase C — Timer management ────────────────────────────

  function _computeZone(pct) {
    if (pct <= 0) return 'expired';
    if (pct > _TIMER_ZONE_THRESHOLDS.green) return 'green';
    if (pct > _TIMER_ZONE_THRESHOLDS.yellow) return 'yellow';
    return 'red';
  }

  // Start a countdown for a kind:"fetch" step. Called when a quest
  // advances to a fetch step or when the player enters the floor where
  // a fetch step is already the current step.
  function _startTimer(questId, step) {
    if (!step || !step.advanceWhen) return;
    var aw = step.advanceWhen;
    if (aw.kind !== 'fetch' || !aw.timerMs) return;
    // Don't restart if already running for this quest
    if (_timer && _timer.questId === questId) return;
    // Cancel any existing timer (only one at a time)
    if (_timer) _cancelTimer();
    var fid = aw.floorId || ((typeof FloorManager !== 'undefined' && FloorManager.getFloor)
      ? FloorManager.getFloor() : null);
    _timer = {
      questId:       questId,
      totalMs:       +aw.timerMs,
      remainMs:      +aw.timerMs,
      zone:          'green',
      paused:        false,
      heroArchetype: aw.heroArchetype || 'seeker',
      floorId:       fid,
      sentinelGraceMs: +(aw.sentinelGraceMs || 12000),
      lastTickSec:   Math.ceil(aw.timerMs / 1000)
    };
    _emit('timer-start', {
      questId: questId,
      totalMs: _timer.totalMs,
      floorId: _timer.floorId,
      heroArchetype: _timer.heroArchetype
    });
  }

  function _cancelTimer() {
    if (!_timer) return;
    var questId = _timer.questId;
    _timer = null;
    _emit('timer-cancel', { questId: questId });
  }

  // Tick the timer by `dt` milliseconds. Called from tickTimer() which
  // Game._tick or Game._render invokes each frame/tick.
  function _tickTimerInternal(dt) {
    if (!_timer || _timer.zone === 'expired') return;

    // ── Pause check ──────────────────────────────────────────────
    // Timer freezes under the same conditions as MovementController:
    // MenuBox open, DialogBox open, floor transition, combat active,
    // cinematic camera lock, ScreenManager paused.
    var shouldPause = false;
    if (typeof ScreenManager !== 'undefined' && ScreenManager.isPaused && ScreenManager.isPaused()) shouldPause = true;
    if (typeof MenuBox !== 'undefined' && MenuBox.isOpen && MenuBox.isOpen()) shouldPause = true;
    if (typeof DialogBox !== 'undefined' && DialogBox.isOpen && DialogBox.isOpen()) shouldPause = true;
    if (typeof FloorTransition !== 'undefined' && FloorTransition.isTransitioning && FloorTransition.isTransitioning()) shouldPause = true;
    if (typeof CombatEngine !== 'undefined' && CombatEngine.isActive && CombatEngine.isActive()) shouldPause = true;
    if (typeof CinematicCamera !== 'undefined' && CinematicCamera.isInputLocked && CinematicCamera.isInputLocked()) shouldPause = true;

    _timer.paused = shouldPause;
    if (shouldPause) return;

    // ── Countdown ────────────────────────────────────────────────
    _timer.remainMs = Math.max(0, _timer.remainMs - dt);
    var pct = _timer.totalMs > 0 ? _timer.remainMs / _timer.totalMs : 0;
    var prevZone = _timer.zone;
    _timer.zone = _computeZone(pct);

    // Emit 'timer-tick' at most once per second (floor of remaining seconds)
    var sec = Math.ceil(_timer.remainMs / 1000);
    if (sec !== _timer.lastTickSec) {
      _timer.lastTickSec = sec;
      _emit('timer-tick', {
        questId:  _timer.questId,
        remainMs: _timer.remainMs,
        pct:      pct,
        zone:     _timer.zone
      });
    }

    // Emit 'timer-zone' on zone transitions
    if (_timer.zone !== prevZone) {
      _emit('timer-zone', {
        questId:  _timer.questId,
        zone:     _timer.zone,
        prevZone: prevZone
      });
    }

    // ── Expired ──────────────────────────────────────────────────
    if (_timer.remainMs <= 0) {
      _timer.zone = 'expired';
      _emit('timer-expired', {
        questId:       _timer.questId,
        floorId:       _timer.floorId,
        heroArchetype: _timer.heroArchetype,
        sentinelGraceMs: _timer.sentinelGraceMs
      });
    }
  }

  // Public tick entry point — called by Game each frame or tick.
  function tickTimer(dt) {
    _tickTimerInternal(+dt || 0);
  }

  // Public read-only snapshot for UI consumers.
  function getActiveTimer() {
    if (!_timer) return null;
    var pct = _timer.totalMs > 0 ? _timer.remainMs / _timer.totalMs : 0;
    return {
      questId:       _timer.questId,
      remainMs:      _timer.remainMs,
      totalMs:       _timer.totalMs,
      pct:           pct,
      zone:          _timer.zone,
      paused:        !!_timer.paused,
      heroArchetype: _timer.heroArchetype,
      floorId:       _timer.floorId
    };
  }

  // 9th event entry point (DOC-113 Phase C). Explicit trigger for
  // timer expiry — normally fires automatically via _tickTimerInternal
  // when remainMs hits zero. This public API exists for testing and
  // for edge cases where an external system needs to force-expire
  // the timer (e.g. scripted events).
  function onTimerExpired(questId, floorId) {
    if (_timer && _timer.questId === questId) {
      _timer.remainMs = 0;
      _timer.zone = 'expired';
      _emit('timer-expired', {
        questId:       _timer.questId,
        floorId:       floorId || _timer.floorId,
        heroArchetype: _timer.heroArchetype,
        sentinelGraceMs: _timer.sentinelGraceMs
      });
      return true;
    }
    return false;
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

    // DOC-113 Phase C: if the newly-current step is kind:'fetch', start
    // the sprint timer. _maybeComplete may transition to COMPLETED which
    // would make the step index past the end, so check bounds first.
    var defAfter = QuestRegistry.getQuest(questId);
    if (defAfter && Array.isArray(defAfter.steps) && rec.stepIndex < defAfter.steps.length) {
      var nextStep = defAfter.steps[rec.stepIndex];
      if (nextStep && nextStep.advanceWhen && nextStep.advanceWhen.kind === 'fetch') {
        _startTimer(questId, nextStep);
      }
    }

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
    // DOC-113: cancel sprint timer if this quest owns it
    if (_timer && _timer.questId === questId) _cancelTimer();
    var prev = rec.state;
    rec.state = QuestTypes.STATE.COMPLETED;
    _emit('state-change', questId, prev, QuestTypes.STATE.COMPLETED);
    _emit('completed',    questId);
    return true;
  }

  function fail(questId, reason) {
    var rec = _active[questId];
    if (!rec) return false;
    // DOC-113: cancel sprint timer if this quest owns it
    if (_timer && _timer.questId === questId) _cancelTimer();
    var prev = rec.state;
    rec.state = QuestTypes.STATE.FAILED;
    rec.failReason = reason || null;
    _emit('state-change', questId, prev, QuestTypes.STATE.FAILED);
    return true;
  }
  function expire(questId) {
    var rec = _active[questId];
    if (!rec) return false;
    // DOC-113: cancel sprint timer if this quest owns it
    if (_timer && _timer.questId === questId) _cancelTimer();
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
  //   { kind:'floor',           floorId, x, y, radius? }
  //   { kind:'item',            itemId }
  //   { kind:'npc',             npcId, branch? }
  //   { kind:'flag',            flag, value? }       // value undefined → truthy
  //   { kind:'readiness',       floorId, threshold } // crosses threshold
  //   { kind:'combat',          archetype }
  //   { kind:'minigame',        kindId, reason?, subTargetId?, floorId? }
  //   { kind:'reputation-tier', factionId, tier, direction? }
  //   { kind:'gate-opened',     floorId?, x?, y?, gateType? }  // DOC-116
  //
  // `event` is a plain object mirroring the fired event:
  //   { kind:'floor',           floorId, x, y }       from onFloorArrive
  //   { kind:'item',            itemId }              from onItemAcquired
  //   { kind:'npc',             npcId, branch }       from onNpcTalk
  //   { kind:'flag',            flag, value }         from onFlagChanged
  //   { kind:'readiness',       floorId, score }      from onReadinessChange
  //   { kind:'combat',          archetype }           from onCombatKill
  //   { kind:'minigame',        kindId, reason, subTargetId?, floorId?, x?, y? }
  //                                                   from onMinigameExit
  //   { kind:'reputation-tier', factionId, fromTier, toTier, tier, direction }
  //                                                   from onReputationTierCross
  //   { kind:'gate-opened',     floorId, x, y, gateType }
  //                                                   from onGateOpened (DOC-116)
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

      case 'reputation-tier':
        // factionId is required: 'mss', 'pinkerton', 'jesuit', 'bprd'
        if (!predicate.factionId || predicate.factionId !== event.factionId) return false;
        // tier is required — exact match on the destination tier id
        // ('hated'|'unfriendly'|'neutral'|'friendly'|'allied'|'exalted').
        // We match toTier (the tier the player just entered) so a step
        // like "reach Friendly with BPRD" fires on the first crossing.
        if (!predicate.tier || predicate.tier !== event.toTier) return false;
        // Optional: direction gate. Default 'up' — only fire on upward
        // tier-crosses so a demotion (e.g. Friendly→Neutral) doesn't
        // advance a step meant to celebrate reaching Friendly.
        var dir = predicate.direction || 'up';
        if (dir !== 'any' && dir !== event.direction) return false;
        return true;

      case 'fetch':
        // DOC-113 sprint dungeons. Advances when the player picks up the
        // target item (itemId required). Optional floorId restricts the
        // match to a specific floor. Timer/hero data (timerMs,
        // sentinelGraceMs, heroArchetype) live on the step for runtime
        // consumption by HeroSystem but don't gate advancement — the step
        // completes on item acquisition. Fires via onItemAcquired().
        if (!predicate.itemId || predicate.itemId !== event.itemId) return false;
        if (predicate.floorId && predicate.floorId !== event.floorId) return false;
        return true;

      case 'gate-opened':
        // DOC-116 gate taxonomy coordination. Advances when a gate tile
        // (KEY/QUEST/FACTION/SCHEDULE/BREAKABLE/COMPOSITE) opens. All
        // predicate fields are optional so a step can match "any gate
        // anywhere" (count: N for an open-N-gates tutorial) or narrow
        // to a specific gate by floorId + coordinates + type.
        //
        // Field semantics:
        //   floorId  — exact string match on event.floorId (optional)
        //   x, y     — both required together; match only if both int-
        //              equal the event coords (optional)
        //   gateType — one of 'key'|'quest'|'faction'|'schedule'|
        //              'breakable'|'composite'; exact match on event.gateType
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
    var advanced = _dispatch({ kind: 'item', itemId: itemId });
    // DOC-113: also fan out a 'fetch' event so kind:"fetch" steps can
    // match on item pickup. The fetch predicate optionally gates on
    // floorId so we pass the current floor.
    var fid = (typeof FloorManager !== 'undefined' && FloorManager.getFloor)
      ? FloorManager.getFloor() : null;
    if (_dispatch({ kind: 'fetch', itemId: itemId, floorId: fid })) advanced = true;
    return advanced;
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
    // DOC-113: cancel sprint timer if the player left the timer's floor
    if (_timer && _timer.floorId && _timer.floorId !== floorId) {
      _cancelTimer();
    }
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

  // Gate-opened fan-out (DOC-116 gate taxonomy coordination). Called by
  // the gate-resolution pipeline (door-contracts / gate-authority) after
  // a gate tile successfully opens. gateType is one of 'key' | 'quest' |
  // 'faction' | 'schedule' | 'breakable' | 'composite' (see
  // docs/GATE_TAXONOMY.md §4). x/y are the tile coordinates of the gate
  // in the current floor's grid. The current floorId is REQUIRED here —
  // unlike onFloorArrive we don't fall back to FloorManager because
  // gates are tile-addressed and must carry their provenance explicitly
  // so step predicates can narrow on (floorId,x,y).
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

  // Reputation tier-cross fan-out (DOC-107 Phase 3). Called by Game
  // when ReputationBar emits a 'tier-cross' event. factionId is one of
  // QuestTypes.FACTIONS values; fromTier/toTier are REP_TIERS ids
  // ('hated'|'unfriendly'|'neutral'|'friendly'|'allied'|'exalted').
  // The direction ('up'|'down') is derived from the REP_TIERS ordinal
  // gap so predicates can gate on upward crossings only.
  function onReputationTierCross(factionId, fromTier, toTier) {
    if (typeof factionId !== 'string' || !factionId) return false;
    if (typeof toTier   !== 'string' || !toTier)   return false;
    // Derive direction by comparing REP_TIERS ordinals. A missing
    // fromTier (first tier crossing after init) is treated as 'up'.
    var direction = 'up';
    if (typeof QuestTypes !== 'undefined' && Array.isArray(QuestTypes.REP_TIERS)) {
      var fromIdx = -1, toIdx = -1;
      for (var i = 0; i < QuestTypes.REP_TIERS.length; i++) {
        if (QuestTypes.REP_TIERS[i].id === fromTier) fromIdx = i;
        if (QuestTypes.REP_TIERS[i].id === toTier)   toIdx   = i;
      }
      if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx) direction = 'down';
    }
    return _dispatch({
      kind:      'reputation-tier',
      factionId: factionId,
      fromTier:  fromTier || null,
      toTier:    toTier,
      tier:      toTier,
      direction: direction
    });
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
    }

    // ── Gate unlocked (post-authorization) ─────────────────────────
    // After the gate is open, guide the player toward the next
    // progression door (exterior → deeper exterior → dungeon entrance).
    var progressionTarget = _findProgressionDoorForward(floorId, floorId);
    if (progressionTarget) return progressionTarget;

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

  // DOC-116 coordination API. Returns true if the addressed step of the
  // addressed quest has been completed (passed). Accepts either an
  // integer step index or a string step.id. Semantics:
  //   - Unknown quest            → false
  //   - Quest in COMPLETED state → true for any in-range step or
  //                                 known step.id (every step passed)
  //   - Quest in ACTIVE state    → true iff the resolved step index is
  //                                 strictly less than rec.stepIndex
  //                                 (the current step is NOT complete,
  //                                 only previous steps are)
  //   - Any other state          → false (locked / available / failed /
  //                                 expired — no steps have "passed")
  //   - Unknown step.id          → false
  //   - Out-of-range int         → false
  //
  // This is the single-source-of-truth predicate used by QUEST-gate
  // resolvers (GATE_TAXONOMY.md §8a.2) to decide whether a gate should
  // open. Keeping the stepIdx/stepId normalization here — rather than
  // duplicating it in each gate resolver — avoids drift as the quest
  // system evolves.
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

  // ── Journal entries (DOC-107 Phase 4 / Phase 2.1a) ───────────────
  // Returns quest records filtered by state for the Journal face.
  // filter: { active: bool, completed: bool, failed: bool, expired: bool }
  //
  // Phase 2.1a expanded the projection to match what _renderJournal in
  // menu-faces.js actually reads: title, stepLabel, markerColor,
  // breadcrumb, progress, summary, giver, rewards. Sorted stable:
  // main > side > contract, then startedTick ascending.
  //
  // Back-compat: when no state flag is passed, returns all records in
  // _active (matches pre-2.1a semantics). label + steps are kept on
  // the payload for legacy callers.
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
      // Progress index clamps to totalSteps for completed quests so
      // the journal can render "3/3" not "2/3" on the completed pane.
      var progressCurrent = (st === QuestTypes.STATE.COMPLETED) ? totalSteps : rec.stepIndex;
      // Breadcrumb — resolved to a floor-name i18n key so the journal
      // renderer can localize. Minimap.getFloorStack lives at Layer 2
      // and QuestChain is Layer 3; we stay at the i18n-key layer.
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
    // Stable sort: main > side > contract, then startedTick ascending.
    out.sort(function (a, b) {
      var ao = (_KIND_ORDER[a.kind] !== undefined) ? _KIND_ORDER[a.kind] : 99;
      var bo = (_KIND_ORDER[b.kind] !== undefined) ? _KIND_ORDER[b.kind] : 99;
      if (ao !== bo) return ao - bo;
      return (a.startedTick || 0) - (b.startedTick || 0);
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
    init:                    init,
    on:                      on,
    off:                     off,
    setActive:               setActive,
    advance:                 advance,
    complete:                complete,
    fail:                    fail,
    expire:                  expire,
    onItemAcquired:          onItemAcquired,
    onFlagChanged:           onFlagChanged,
    onReadinessChange:       onReadinessChange,
    onFloorArrive:           onFloorArrive,
    onNpcTalk:               onNpcTalk,
    onCombatKill:            onCombatKill,
    onMinigameExit:          onMinigameExit,
    onReputationTierCross:   onReputationTierCross,
    onGateOpened:            onGateOpened,
    getCurrentMarker:        getCurrentMarker,
    update:                  update,
    getState:                getState,
    getStepIndex:            getStepIndex,
    isStepComplete:          isStepComplete,
    listActive:              listActive,
    snapshot:                snapshot,
    summary:                 summary,
    getJournalEntries:       getJournalEntries,
    getUIPrefs:              getUIPrefs,
    setUIPrefs:              setUIPrefs,
    loadUIPrefs:             loadUIPrefs,
    getActiveTimer:          getActiveTimer,
    tickTimer:               tickTimer,
    onTimerExpired:          onTimerExpired,
    get initialized() { return _initialized; }
  });
})();

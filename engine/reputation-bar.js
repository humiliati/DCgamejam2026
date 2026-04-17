/**
 * ReputationBar — WoW-style favor ledger + tier-cross event bus.
 *
 * Layer 3 (game module). Depends on QuestTypes (Layer 0). Renders via
 * HUD / menu-faces journal in later phases — this module is pure state.
 *
 * Mirrors the readiness-calc / HUD tier-cross pattern (see
 * docs/READINESS_BAR_ROADMAP.md, hud.js:15 `_onTierCross`): integer
 * favor value per subject, tier lookup via QuestTypes.tierForFavor(),
 * fires an event the first time a subject crosses into a new tier
 * (Neutral → Friendly, Friendly → Allied, etc.) so the HUD can flash
 * a toast and the journal can update.
 *
 * Canonical flag source: ACT2_NARRATIVE_OUTLINE §10 faction_favor_*.
 *
 * ── Subject-kind namespace (DOC-109 Phase 0, 2026-04-17) ─────────
 * Internal keys are `"kind:id"` strings: `'faction:bprd'`,
 * `'npc:dispatcher-hallow'`. Two subject kinds are supported today,
 * `'faction'` and `'npc'`, sharing the Hated→Exalted tier ladder.
 *
 * Canonical API: addSubjectFavor / setSubjectFavor / getSubjectFavor /
 * getSubjectTier / listSubjects(kind) / snapshotByKind().
 *
 * Event bus emits 4 args: `(kind, id, prev, next)` and
 * `(kind, id, prevTier, nextTier)`. Legacy 3-arg listeners are
 * detected via `Function.length` and receive `(id, prev, next)` so
 * call sites registered before Phase 0 keep working. The length-based
 * dispatch is removed in DOC-109 Phase 7 after a grep sweep confirms
 * no remaining 3-arg listeners in engine/*.js.
 *
 * Legacy alias surface (faction-scoped): addFavor / setFavor /
 * getFavor / getTier / listFactions / snapshot — all delegate to
 * the subject-kind methods with `kind='faction'` and keep the
 * pre-Phase-0 call signatures and return shapes intact. Save-game
 * fixtures loading via `snapshot()` continue to see the flat
 * `{ factionId: {favor, tier} }` shape.
 */
var ReputationBar = (function () {
  'use strict';

  var _initialized = false;
  var _favor       = {};   // { "kind:id": integer }
  var _tierCache   = {};   // { "kind:id": tierId } — last observed tier
  var _listeners   = { 'tier-cross': [], 'favor-change': [] };

  function _key(kind, id) { return kind + ':' + id; }

  // Emit to all listeners — Function.length decides old 3-arg (legacy
  // faction-only) vs new 4-arg (kind-aware) signature. Remove the
  // length branch in DOC-109 Phase 7 once all listeners are migrated.
  function _emit(event, kind, id, prev, next) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      var fn = list[i];
      try {
        if (fn.length >= 4) fn(kind, id, prev, next);
        else                fn(id, prev, next);
      } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ReputationBar] ' + event + ' listener threw:', e);
        }
      }
    }
  }

  function _currentTierId(kind, id) {
    if (typeof QuestTypes === 'undefined') return 'neutral';
    var t = QuestTypes.tierForFavor(_favor[_key(kind, id)] || 0);
    return t ? t.id : 'neutral';
  }

  // ── Init ─────────────────────────────────────────────────────────
  // Seeds every known faction to 0 favor = Neutral. The `seed`
  // argument accepts the legacy `{ factionId: favor }` shape for
  // save-game compatibility; every entry is interpreted as a faction
  // (kind='faction'). NPC favor is not seeded — NPC subjects are
  // created lazily on first addSubjectFavor('npc', ...) call.
  function init(seed) {
    _initialized = true;
    _favor = {};
    _tierCache = {};
    if (typeof QuestTypes === 'undefined') return true;

    Object.keys(QuestTypes.FACTIONS).forEach(function (key) {
      var fid = QuestTypes.FACTIONS[key];
      var k = _key('faction', fid);
      _favor[k]     = 0;
      _tierCache[k] = _currentTierId('faction', fid);
    });

    if (seed && typeof seed === 'object') {
      Object.keys(seed).forEach(function (fid) {
        var v = seed[fid] | 0;
        var k = _key('faction', fid);
        _favor[k]     = v;
        _tierCache[k] = _currentTierId('faction', fid);
      });
    }
    return true;
  }

  // ── Event bus ────────────────────────────────────────────────────
  function on(event, fn) {
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

  // ── Mutation (canonical subject-kind API) ────────────────────────
  function addSubjectFavor(kind, id, delta) {
    if (typeof kind !== 'string' || !kind) return 0;
    if (typeof id   !== 'string' || !id)   return 0;
    var k = _key(kind, id);
    var prev = _favor[k] || 0;
    var prevTier = _tierCache[k] || _currentTierId(kind, id);
    var next = (prev + ((+delta) | 0)) | 0;
    _favor[k] = next;
    _emit('favor-change', kind, id, prev, next);

    var nextTier = _currentTierId(kind, id);
    if (nextTier !== prevTier) {
      _tierCache[k] = nextTier;
      _emit('tier-cross', kind, id, prevTier, nextTier);
    }
    return next;
  }

  function setSubjectFavor(kind, id, value) {
    if (typeof kind !== 'string' || !kind) return 0;
    if (typeof id   !== 'string' || !id)   return 0;
    var k = _key(kind, id);
    var prev = _favor[k] || 0;
    var prevTier = _tierCache[k] || _currentTierId(kind, id);
    var next = ((+value) | 0);
    _favor[k] = next;
    _emit('favor-change', kind, id, prev, next);

    var nextTier = _currentTierId(kind, id);
    if (nextTier !== prevTier) {
      _tierCache[k] = nextTier;
      _emit('tier-cross', kind, id, prevTier, nextTier);
    }
    return next;
  }

  // ── Getters (canonical subject-kind API) ─────────────────────────
  function getSubjectFavor(kind, id) {
    return _favor[_key(kind, id)] || 0;
  }
  function getSubjectTier(kind, id) {
    if (typeof QuestTypes === 'undefined') return null;
    return QuestTypes.tierForFavor(_favor[_key(kind, id)] || 0);
  }
  function listSubjects(kind) {
    if (typeof kind !== 'string' || !kind) return [];
    var prefix = kind + ':';
    var out = [];
    Object.keys(_favor).forEach(function (k) {
      if (k.indexOf(prefix) === 0) out.push(k.substring(prefix.length));
    });
    return out;
  }
  function snapshotByKind() {
    var out = {};
    Object.keys(_favor).forEach(function (k) {
      var colon = k.indexOf(':');
      if (colon < 1) return;
      var kind = k.substring(0, colon);
      var id   = k.substring(colon + 1);
      if (!out[kind]) out[kind] = {};
      out[kind][id] = { favor: _favor[k], tier: _tierCache[k] };
    });
    return out;
  }

  // ── Legacy aliases (faction scope; pre-Phase-0 surface) ──────────
  // These delegate to the subject-kind API with kind='faction'. Kept
  // indefinitely so save-game fixtures emitting the flat shape still
  // load; DOC-109 Phase 7 revisits whether to drop them.
  function addFavor(factionId, delta) { return addSubjectFavor('faction', factionId, delta); }
  function setFavor(factionId, value) { return setSubjectFavor('faction', factionId, value); }
  function getFavor(factionId)        { return getSubjectFavor('faction', factionId); }
  function getTier(factionId)         { return getSubjectTier('faction', factionId); }
  function listFactions()             { return listSubjects('faction'); }
  function snapshot() {
    // Legacy shape: { factionId: { favor, tier } } — filter to kind='faction'.
    var out = {};
    listSubjects('faction').forEach(function (fid) {
      var k = _key('faction', fid);
      out[fid] = { favor: _favor[k], tier: _tierCache[k] };
    });
    return out;
  }

  function summary() {
    return {
      initialized:  _initialized,
      factionCount: listSubjects('faction').length,
      npcCount:     listSubjects('npc').length,
      subjectCount: Object.keys(_favor).length
    };
  }

  return Object.freeze({
    init:             init,
    on:               on,
    off:              off,
    // Canonical subject-kind API (DOC-109 Phase 0)
    addSubjectFavor:  addSubjectFavor,
    setSubjectFavor:  setSubjectFavor,
    getSubjectFavor:  getSubjectFavor,
    getSubjectTier:   getSubjectTier,
    listSubjects:     listSubjects,
    snapshotByKind:   snapshotByKind,
    // Legacy aliases (faction scope)
    addFavor:         addFavor,
    setFavor:         setFavor,
    getFavor:         getFavor,
    getTier:          getTier,
    listFactions:     listFactions,
    snapshot:         snapshot,
    // Diagnostics
    summary:          summary,
    get initialized() { return _initialized; }
  });
})();

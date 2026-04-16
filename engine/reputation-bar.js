/**
 * ReputationBar — WoW-style faction favor ledger + tier-cross event bus.
 *
 * Layer 3 (game module). Depends on QuestTypes (Layer 0). Renders via
 * HUD / menu-faces journal in later phases — Phase 0 is pure state.
 *
 * Mirrors the readiness-calc / HUD tier-cross pattern (see
 * docs/READINESS_BAR_ROADMAP.md, hud.js:15 `_onTierCross`): integer
 * favor value per faction, tier lookup via QuestTypes.tierForFavor(),
 * fires an event the first time a faction crosses into a new tier
 * (Neutral → Friendly, Friendly → Allied, etc.) so the HUD can flash
 * a toast and the journal can update.
 *
 * Canonical flag source: ACT2_NARRATIVE_OUTLINE §10 faction_favor_*.
 * In Phase 0 ReputationBar is a pure in-memory ledger; Phase 2 will
 * wire it to save-backend and the ACT2 flag schema.
 */
var ReputationBar = (function () {
  'use strict';

  var _initialized = false;
  var _favor       = {};   // { factionId: integer }
  var _tierCache   = {};   // { factionId: tierId } — last observed tier
  var _listeners   = { 'tier-cross': [], 'favor-change': [] };

  function _emit(event, a, b, c) {
    var list = _listeners[event];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](a, b, c); } catch (e) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[ReputationBar] ' + event + ' listener threw:', e);
        }
      }
    }
  }

  function _currentTierId(factionId) {
    if (typeof QuestTypes === 'undefined') return 'neutral';
    var t = QuestTypes.tierForFavor(_favor[factionId] || 0);
    return t ? t.id : 'neutral';
  }

  // ── Init ─────────────────────────────────────────────────────────
  // Seeds every known faction to 0 favor = Neutral. Callers can pass
  // an { factionId: favor } map to restore from save.
  function init(seed) {
    _initialized = true;
    _favor = {};
    _tierCache = {};
    if (typeof QuestTypes === 'undefined') return true;

    Object.keys(QuestTypes.FACTIONS).forEach(function (key) {
      var fid = QuestTypes.FACTIONS[key];
      _favor[fid]     = 0;
      _tierCache[fid] = _currentTierId(fid);
    });

    if (seed && typeof seed === 'object') {
      Object.keys(seed).forEach(function (fid) {
        var v = seed[fid] | 0;
        _favor[fid]     = v;
        _tierCache[fid] = _currentTierId(fid);
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

  // ── Mutation ─────────────────────────────────────────────────────
  function addFavor(factionId, delta) {
    if (typeof factionId !== 'string' || !factionId) return 0;
    var prev = _favor[factionId] || 0;
    var prevTier = _tierCache[factionId] || _currentTierId(factionId);
    var next = (prev + ((+delta) | 0)) | 0;
    _favor[factionId] = next;
    _emit('favor-change', factionId, prev, next);

    var nextTier = _currentTierId(factionId);
    if (nextTier !== prevTier) {
      _tierCache[factionId] = nextTier;
      _emit('tier-cross', factionId, prevTier, nextTier);
    }
    return next;
  }

  function setFavor(factionId, value) {
    if (typeof factionId !== 'string' || !factionId) return 0;
    var prev = _favor[factionId] || 0;
    var prevTier = _tierCache[factionId] || _currentTierId(factionId);
    var next = ((+value) | 0);
    _favor[factionId] = next;
    _emit('favor-change', factionId, prev, next);

    var nextTier = _currentTierId(factionId);
    if (nextTier !== prevTier) {
      _tierCache[factionId] = nextTier;
      _emit('tier-cross', factionId, prevTier, nextTier);
    }
    return next;
  }

  // ── Getters ──────────────────────────────────────────────────────
  function getFavor(factionId) { return _favor[factionId] || 0; }
  function getTier(factionId) {
    if (typeof QuestTypes === 'undefined') return null;
    return QuestTypes.tierForFavor(_favor[factionId] || 0);
  }
  function listFactions() {
    return Object.keys(_favor);
  }
  function snapshot() {
    var out = {};
    Object.keys(_favor).forEach(function (fid) {
      out[fid] = { favor: _favor[fid], tier: _tierCache[fid] };
    });
    return out;
  }

  function summary() {
    return {
      initialized:  _initialized,
      factionCount: Object.keys(_favor).length
    };
  }

  return Object.freeze({
    init:         init,
    on:           on,
    off:          off,
    addFavor:     addFavor,
    setFavor:     setFavor,
    getFavor:     getFavor,
    getTier:      getTier,
    listFactions: listFactions,
    snapshot:     snapshot,
    summary:      summary,
    get initialized() { return _initialized; }
  });
})();

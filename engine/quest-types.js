/**
 * QuestTypes — shared enums + structural helpers for the quest system.
 *
 * Layer 0 (zero-dependency). Loaded before QuestRegistry / QuestChain /
 * ReputationBar / menu-faces journal / minimap so every consumer reads
 * the same frozen vocabulary.
 *
 * See docs/QUEST_SYSTEM_ROADMAP.md §2 "Target Architecture" for the
 * canonical type definitions. This module is intentionally behavior-free
 * in Phase 0 — it exposes frozen enums + shape validators only.
 *
 * Naming: every quest entity gets a stable string id (not an integer).
 * Ids must match /^[a-z0-9_.-]+$/ so they survive JSON round-trips,
 * save-backend keys, and i18n string-namespace suffixes.
 */
var QuestTypes = (function () {
  'use strict';

  // ── Quest kinds ──────────────────────────────────────────────────
  // 'main'      — spine quests that gate Act 1 → Act 2 transition
  // 'faction'   — per-faction reputation-advancement chains
  // 'side'      — optional, floor-anchored odd jobs
  // 'tutorial'  — one-shot hand-holding, retires after completion
  var KIND = Object.freeze({
    MAIN:     'main',
    FACTION:  'faction',
    SIDE:     'side',
    TUTORIAL: 'tutorial'
  });

  // ── Quest states ────────────────────────────────────────────────
  // state machine: locked → available → active → completed|failed|expired
  var STATE = Object.freeze({
    LOCKED:    'locked',     // prerequisites unmet
    AVAILABLE: 'available',  // player can accept / auto-offer ready
    ACTIVE:    'active',     // in progress, waypoints visible
    COMPLETED: 'completed',  // final step satisfied
    FAILED:    'failed',     // explicit fail predicate hit
    EXPIRED:   'expired'     // time/act window closed without completion
  });

  // ── Waypoint kinds ──────────────────────────────────────────────
  // 'floor'           — advance by reaching a tile on a specific floor
  // 'item'            — advance by acquiring an item/card id
  // 'npc'             — advance by exhausting a dialogue branch
  // 'flag'            — advance when a player-flag predicate becomes true
  // 'readiness'       — advance when a readiness tier is crossed
  // 'combat'          — advance by defeating an enemy archetype or boss
  // 'minigame'        — advance on minigame exit event (DOC-107 Phase 5).
  //                     Predicate fields: kindId (required), reason?,
  //                     subTargetId?, floorId?, count? (N-of-M via
  //                     stepProgress).
  // 'reputation-tier' — advance when a faction reputation tier is crossed
  //                     (DOC-107 Phase 3). Predicate fields: factionId
  //                     (required), tier (required — exact match on the
  //                     *destination* tier id), direction? ('up'|'down'|'any'
  //                     default 'up'). Fires once per tier-cross event.
  var WAYPOINT_KIND = Object.freeze({
    FLOOR:           'floor',
    ITEM:            'item',
    NPC:             'npc',
    FLAG:            'flag',
    READINESS:       'readiness',
    COMBAT:          'combat',
    MINIGAME:        'minigame',
    REPUTATION_TIER: 'reputation-tier'
  });

  // ── Reputation tiers ────────────────────────────────────────────
  // Mirrors ACT2_NARRATIVE_OUTLINE §10 faction_favor_* semantics +
  // WoW-style tier labels. Integer favor → tier by threshold table.
  var REP_TIERS = Object.freeze([
    { id: 'hated',      min: -Infinity, label: 'Hated'      },
    { id: 'unfriendly', min: -500,      label: 'Unfriendly' },
    { id: 'neutral',    min: 0,         label: 'Neutral'    },
    { id: 'friendly',   min: 500,       label: 'Friendly'   },
    { id: 'allied',     min: 2500,      label: 'Allied'     },
    { id: 'exalted',    min: 10000,     label: 'Exalted'    }
  ]);

  // ── Faction ids ─────────────────────────────────────────────────
  // Canonical roster — mirror ACT2_NARRATIVE_OUTLINE.md §2.
  // Keep in sync with engine/reputation-bar.js defaults and
  // data/strings/en.js `reputation.faction_*` string keys.
  var FACTIONS = Object.freeze({
    MSS:       'mss',        // Dispatcher Agency
    PINKERTON: 'pinkerton',  // Crooked detective agency
    JESUIT:    'jesuit',     // Religious order (400-year secret)
    BPRD:      'bprd'        // Dragons-are-protectors network
  });

  // ── Validators ──────────────────────────────────────────────────
  var _ID_RE = /^[a-z0-9_.-]+$/;
  function isValidId(s) {
    return typeof s === 'string' && s.length > 0 && s.length <= 64 && _ID_RE.test(s);
  }

  function isKind(k) {
    if (typeof k !== 'string') return false;
    for (var key in KIND) if (KIND[key] === k) return true;
    return false;
  }

  function isState(s) {
    if (typeof s !== 'string') return false;
    for (var key in STATE) if (STATE[key] === s) return true;
    return false;
  }

  function isWaypointKind(w) {
    if (typeof w !== 'string') return false;
    for (var key in WAYPOINT_KIND) if (WAYPOINT_KIND[key] === w) return true;
    return false;
  }

  function tierForFavor(favor) {
    var n = +favor || 0;
    var picked = REP_TIERS[0];
    for (var i = 0; i < REP_TIERS.length; i++) {
      if (n >= REP_TIERS[i].min) picked = REP_TIERS[i];
    }
    return picked;
  }

  return Object.freeze({
    KIND:          KIND,
    STATE:         STATE,
    WAYPOINT_KIND: WAYPOINT_KIND,
    REP_TIERS:     REP_TIERS,
    FACTIONS:      FACTIONS,
    isValidId:     isValidId,
    isKind:        isKind,
    isState:       isState,
    isWaypointKind:isWaypointKind,
    tierForFavor:  tierForFavor,
    initialized:   true
  });
})();
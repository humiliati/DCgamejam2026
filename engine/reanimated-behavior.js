/**
 * ReanimatedBehavior — Verb-field assignment + tick for friendly
 * reanimated enemies.
 *
 * When the player seals a harvested corpse and reanimates it, the
 * resulting friendly entity lives in FloorManager.getEnemies() with
 * { friendly: true, nonLethal: true, ... }. This module takes over
 * from the legacy _assignWanderPath in corpse-actions.js — instead
 * of a bounce patrol between crates, reanimated creatures get a
 * verb-set derived from their archetype and the nodes nearby, and
 * orbit organically via VerbField.tick.
 *
 * Implements VERB_FIELD_NPC_ROADMAP.md §15 and Phase 10.
 *
 * Layer 3.5 — depends on VerbField (Layer 1), VerbNodes (Layer 1),
 *             FloorManager (Layer 3), TILES (Layer 0).
 */
var ReanimatedBehavior = (function () {
  'use strict';

  // ── Archetype table ──────────────────────────────────────────────
  //
  // Each archetype defines base decay rates per verb, reflecting the
  // creature's original nature. See VERB_FIELD_NPC_ROADMAP.md §15.4.
  //
  // Rest decay is always moderate-high — reanimated creatures just
  // died, they need to rest. Other verb decays vary by archetype.

  var ARCHETYPES = {
    // Undead — dutiful, gravitates toward work stations & guards things.
    undead: {
      rest:    0.0015,
      social:  0.0010,
      errands: 0.0004,
      duty:    0.0018
    },
    // Construct — high duty, low socialization, anchored to work.
    construct: {
      rest:    0.0005,
      social:  0.0003,
      errands: 0.0008,
      duty:    0.0025
    },
    // Beast — curious wanderer, moderate social, low duty.
    beast: {
      rest:    0.0020,
      social:  0.0015,
      errands: 0.0008,
      duty:    0.0003
    },
    // Arcane — restless, high rest need but slow decay on others.
    arcane: {
      rest:    0.0008,
      social:  0.0005,
      errands: 0.0005,
      duty:    0.0002
    },
    // Generic fallback — balanced decay, produces watchable behavior.
    generic: {
      rest:    0.0015,
      social:  0.0010,
      errands: 0.0005,
      duty:    0.0005
    }
  };

  // Shared satisfier maps so every archetype's verbSet references the
  // same arrays (avoids allocating duplicates per reanim).
  var SATISFIERS = {
    rest:    ['rest_spot', 'bench', 'bonfire'],
    social:  ['bonfire', 'well', 'bench'],
    errands: ['shop_entrance', 'bulletin_board'],
    duty:    ['work_station', 'faction_post']
  };

  // How wide to cast the net for nodes that influence verbSet
  // composition. Wider than _buildWanderPath's 12 tiles (§15.3).
  var NODE_SEARCH_RADIUS = 16;

  // Starting need values — reanimated creatures wake up tired and
  // mildly social. Duty need is low because they haven't been
  // assigned anywhere yet.
  var INITIAL_NEEDS = {
    rest:    0.70,
    social:  0.50,
    errands: 0.30,
    duty:    0.20
  };

  // ── Classification ───────────────────────────────────────────────

  /**
   * Pick an archetype from an entity's type/name string. Pattern
   * matching against common lexemes — falls back to 'generic' for
   * anything unrecognised.
   *
   * @param {string} entityType
   * @returns {string} archetype key
   */
  function classify(entityType) {
    var t = (entityType || '').toLowerCase();
    if (/bone|skeleton|corpse|wraith|shamble|ghoul|sovereign/.test(t)) return 'undead';
    if (/golem|clockwork|drone|construct|iron|amalgam|mechan/.test(t))  return 'construct';
    if (/slime|toad|crawler|rat|hound|crab|eel|stalker|mold/.test(t))   return 'beast';
    if (/imp|sprite|ember|arcane|wisp|phantom/.test(t))                  return 'arcane';
    return 'generic';
  }

  // ── Assignment ───────────────────────────────────────────────────

  /**
   * Replace the legacy bounce-patrol assignment with a verb-field
   * assignment. Falls back to a patrol path if no nearby verb nodes
   * exist (keeps the pre-Phase-10 behavior intact for floors that
   * haven't been auto-populated yet).
   *
   * @param {Object} entity     — reanimated friendly entity
   * @param {number} originX
   * @param {number} originY
   * @param {Object} [legacyFallback]  — { assignWanderPath: fn } to
   *                                     use if no verb nodes nearby
   */
  function assign(entity, originX, originY, legacyFallback) {
    if (!entity) return;

    var floorId = (typeof FloorManager !== 'undefined' && FloorManager.getCurrentFloorId)
      ? FloorManager.getCurrentFloorId() : null;

    var verbSet = _buildVerbSet(entity, originX, originY, floorId);

    if (verbSet && typeof VerbField !== 'undefined') {
      VerbField.assign(entity, verbSet);
      entity._verbArchetype = classify(entity.type);
      entity._reanimOrigin  = { x: originX, y: originY };
      // Clear any pre-existing patrol scaffolding
      entity.path = null;
      entity.pathIndex = 0;
      entity.pathDirection = 1;
      // Mosey delay: stand at origin for 2-4s before any tick moves them
      entity._stepTimer = -(2000 + Math.floor(Math.random() * 2000));
      return;
    }

    // No nodes nearby — fall back to legacy patrol
    if (legacyFallback && typeof legacyFallback.assignWanderPath === 'function') {
      legacyFallback.assignWanderPath(entity, originX, originY);
    }
  }

  /**
   * Build a dynamic verbSet for a reanimated entity based on its
   * archetype and the types of nodes actually nearby. Verbs with no
   * satisfiers on the current floor are omitted — no point in
   * carrying a `duty` need if the floor has no work_station nodes.
   *
   * @param {Object} entity
   * @param {number} originX
   * @param {number} originY
   * @param {string} floorId
   * @returns {Object|null} verbSet or null if no satisfiable verbs
   */
  function _buildVerbSet(entity, originX, originY, floorId) {
    if (!floorId || typeof VerbNodes === 'undefined') return null;

    var allNodes = VerbNodes.getNodes(floorId);
    if (!allNodes || allNodes.length === 0) return null;

    // Bucket node types present within search radius
    var hasTypes = {};
    var nearbyCount = 0;
    for (var i = 0; i < allNodes.length; i++) {
      var n = allNodes[i];
      var dist = Math.abs(n.x - originX) + Math.abs(n.y - originY);
      if (dist > NODE_SEARCH_RADIUS) continue;
      hasTypes[n.type] = true;
      nearbyCount++;
    }
    if (nearbyCount === 0) return null;

    var archKey = classify(entity.type);
    var decays  = ARCHETYPES[archKey] || ARCHETYPES.generic;

    var verbSet = {};

    // Every reanimated creature carries a rest verb — guaranteed by
    // the rest_spot synthesis pass in DungeonVerbNodes.populate.
    if (hasTypes.rest_spot || hasTypes.bench || hasTypes.bonfire) {
      verbSet.rest = {
        need:       INITIAL_NEEDS.rest,
        decayRate:  decays.rest,
        satisfiers: SATISFIERS.rest
      };
    }

    if (hasTypes.bonfire || hasTypes.well || hasTypes.bench) {
      verbSet.social = {
        need:       INITIAL_NEEDS.social,
        decayRate:  decays.social,
        satisfiers: SATISFIERS.social
      };
    }

    if (hasTypes.shop_entrance || hasTypes.bulletin_board) {
      verbSet.errands = {
        need:       INITIAL_NEEDS.errands,
        decayRate:  decays.errands,
        satisfiers: SATISFIERS.errands
      };
    }

    if (hasTypes.work_station || hasTypes.faction_post) {
      verbSet.duty = {
        need:       INITIAL_NEEDS.duty,
        decayRate:  decays.duty,
        satisfiers: SATISFIERS.duty
      };
    }

    return Object.keys(verbSet).length > 0 ? verbSet : null;
  }

  // ── Tick ─────────────────────────────────────────────────────────

  /**
   * Per-frame (10fps) verb-field tick for all friendly reanimated
   * entities on the current floor. Called from GameLoop alongside
   * NpcSystem.tick. Filters enemies list for friendly + verbSet.
   *
   * @param {number} dt   — ms since last tick
   */
  function tick(dt) {
    if (typeof VerbField === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;

    var floorId = FloorManager.getCurrentFloorId
      ? FloorManager.getCurrentFloorId() : null;
    if (!floorId) return;

    var enemies = FloorManager.getEnemies ? FloorManager.getEnemies() : null;
    if (!enemies || enemies.length === 0) return;

    var fd = FloorManager.getFloorData();
    if (!fd || !fd.grid) return;

    var nodes = (typeof VerbNodes !== 'undefined')
      ? VerbNodes.getNodes(floorId) : null;
    if (!nodes || nodes.length === 0) return;

    // Walk the list once, tick each qualifying entity. VerbField.tick
    // is a no-op for entities without _verbSet so the filter is
    // strictly a perf optimisation.
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || !e.friendly || !e._verbSet) continue;
      // Skip dead/removed entities
      if (e.hp !== undefined && e.hp <= 0) continue;
      VerbField.tick(e, dt, fd.grid, nodes, _REANIM_VERB_OPTS);
    }
  }

  // Cached options object for VerbField.tick — avoids per-tick alloc.
  // No onStep callback yet (reanimated creatures use the raycaster's
  // enemy sprite pipeline, not NpcSystem footsteps). Step audio can
  // be wired later if desired.
  var _REANIM_VERB_OPTS = {};

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    assign:     assign,
    tick:       tick,
    classify:   classify,
    ARCHETYPES: ARCHETYPES
  });
})();

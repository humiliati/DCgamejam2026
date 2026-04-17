/**
 * VerbNodes — Spatial node registry for verb-field NPC behavior.
 *
 * Each floor has named spatial nodes (bonfires, wells, shop entrances,
 * work stations, etc.) that NPCs can satisfy their verbs at. The verb-field
 * tick in NpcSystem queries these to compute movement gradients.
 *
 * Nodes are registered per floor. Each node has a type string that maps
 * to verb satisfiers in the NPC's verbSet definition.
 *
 * Layer 1 — zero-dep IIFE (no imports required).
 * See VERB_FIELD_NPC_ROADMAP.md §4 for schema and conventions.
 */
var VerbNodes = (function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  var _nodes = {};  // floorId → Array<Node>

  // ── Node schema ──────────────────────────────────────────────────
  //
  // {
  //   id:       string   — unique stable identifier
  //   type:     string   — node type (maps to verb satisfiers)
  //   x:        number   — grid X
  //   y:        number   — grid Y
  //   faction:  string?  — if set, only NPCs of this faction can satisfy
  //                        faction_post verbs here
  //   contested: bool?   — Act 2: both factions claim this node
  // }
  //
  // Node type vocabulary:
  //   bonfire        — social verb satisfier (primary gathering)
  //   well           — social verb satisfier (secondary)
  //   bench          — social + rest satisfier
  //   shop_entrance  — errands verb satisfier
  //   bulletin_board — errands verb satisfier
  //   faction_post   — duty verb satisfier (faction-locked)
  //   work_station   — duty verb satisfier (role-specific)
  //   rest_spot      — rest verb satisfier

  /**
   * Register spatial nodes for a floor.
   * Calling register() for the same floor appends (does not replace).
   *
   * @param {string} floorId
   * @param {Array}  nodes  — Array of node definition objects
   */
  function register(floorId, nodes) {
    if (!_nodes[floorId]) _nodes[floorId] = [];
    for (var i = 0; i < nodes.length; i++) {
      _nodes[floorId].push(nodes[i]);
    }
  }

  /**
   * Get all spatial nodes for a floor.
   *
   * @param {string} floorId
   * @returns {Array} — Array of node objects (empty if none registered)
   */
  function getNodes(floorId) {
    return _nodes[floorId] || [];
  }

  /**
   * Find a specific node by id across all floors.
   *
   * @param {string} nodeId
   * @returns {Object|null}
   */
  function findById(nodeId) {
    var floors = Object.keys(_nodes);
    for (var i = 0; i < floors.length; i++) {
      var arr = _nodes[floors[i]];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].id === nodeId) return arr[j];
      }
    }
    return null;
  }

  /**
   * Get the number of registered floors (for debug logging).
   * @returns {number}
   */
  function floorCount() {
    return Object.keys(_nodes).length;
  }

  // ── Built-in node registrations (retired — DOC-110 P3 Ch.0) ──────
  //
  // The hand-authored _registerBuiltinNodes() block was retired on
  // 2026-04-17. Hand-authored spatial nodes now live in
  // `data/verb-nodes.json` and are registered at boot by
  // `engine/verb-node-seed.js` (loaded immediately after this file
  // in index.html). Depth >=3 floors continue to auto-derive via
  // engine/dungeon-verb-nodes.js.
  //
  // To author a new node: edit data/verb-nodes.json directly, then
  // run `node tools/extract-verb-nodes.js` to refresh the sidecar.
  // The pre-commit hook regenerates automatically when the JSON is
  // staged. See docs/NPC_TOOLING_ROADMAP.md §Phase 3.

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    register:   register,
    getNodes:   getNodes,
    findById:   findById,
    floorCount: floorCount
  });
})();

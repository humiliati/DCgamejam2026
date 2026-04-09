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

  // ── Built-in node registrations ──────────────────────────────────
  //
  // Hand-authored spatial nodes for the jam's hand-authored floors.
  // These define the "furniture" of the world that verb-field NPCs
  // orbit around. Coordinates match the floor blockout grids.

  function _registerBuiltinNodes() {

    // ── Floor 0: The Approach (42×32, tutorial corridor) ───────────
    //
    // Sparse — this is a tutorial space. Just enough nodes for the
    // drifter and groundskeeper to have somewhere to orbit.
    register('0', [
      { id: 'approach_campfire',    type: 'bonfire',       x: 18, y: 14 },
      { id: 'approach_facade',      type: 'rest_spot',     x: 37, y: 17 }
    ]);

    // ── Floor 1: The Promenade (50×36, main village hub) ──────────
    //
    // The primary exterior floor. Rich node set for the full verb
    // vocabulary. Layout reference:
    //
    //   NW: Bazaar (shop_entrance)
    //   NC: Inn courtyard (bonfire, bench)
    //   NE: Noticeboard cluster (bulletin_board)
    //   Mid: Main road (work_station for lamplighter)
    //   SW: Cellar entrance
    //   SC: Gleaner's Home area
    //   SE: Well, south bench
    //
    register('1', [
      // Social nodes
      { id: 'promenade_bonfire',    type: 'bonfire',        x: 24, y: 12 },
      { id: 'promenade_well',       type: 'well',           x: 34, y: 24 },
      { id: 'promenade_bench_n',    type: 'bench',          x: 28, y: 8  },
      { id: 'promenade_bench_s',    type: 'bench',          x: 20, y: 26 },

      // Errands nodes
      { id: 'bazaar_entrance',      type: 'shop_entrance',  x: 10, y: 10 },
      { id: 'inn_entrance',         type: 'shop_entrance',  x: 22, y: 8  },
      { id: 'noticeboard',          type: 'bulletin_board',  x: 38, y: 8  },
      { id: 'cellar_entrance',      type: 'shop_entrance',  x: 10, y: 22 },

      // Duty nodes (faction posts — each faction's patrol anchor)
      { id: 'tide_post',            type: 'faction_post',   x: 22, y: 10, faction: 'tide' },
      { id: 'foundry_post',         type: 'faction_post',   x: 38, y: 10, faction: 'foundry' },
      { id: 'admiralty_post',       type: 'faction_post',   x: 20, y: 22, faction: 'admiralty' },

      // Work stations
      { id: 'lamplighter_station',  type: 'work_station',   x: 30, y: 16 },

      // Rest
      { id: 'home_porch',           type: 'rest_spot',      x: 16, y: 28 }
    ]);

    // ── Floor 1.1: Coral Bazaar (interior) ─────────────────────────
    register('1.1', [
      { id: 'bazaar_counter_a',     type: 'work_station',   x: 4,  y: 8  },
      { id: 'bazaar_counter_b',     type: 'work_station',   x: 10, y: 8  },
      { id: 'bazaar_bookshelf',     type: 'bulletin_board',  x: 7,  y: 3  },
      { id: 'bazaar_browse',        type: 'shop_entrance',  x: 7,  y: 6  }
    ]);

    // ── Floor 1.2: Driftwood Inn (interior) ────────────────────────
    register('1.2', [
      { id: 'inn_hearth',           type: 'bonfire',        x: 6,  y: 4  },
      { id: 'inn_bar',              type: 'work_station',   x: 8,  y: 3  },
      { id: 'inn_table',            type: 'bench',          x: 4,  y: 6  },
      { id: 'inn_bookshelf',        type: 'bulletin_board',  x: 10, y: 2  }
    ]);

    // ── Floor 2: Lantern Row (50×36, commercial district) ──────────
    //
    // 7 existing shops in north facade. South half is boardwalk piers
    // over water. First floor to get full 5-verb coverage.
    //
    // Layout: North facade (rows 2-5), road corridor (rows 7-14),
    //         pillar arcades (row 11), boardwalk (rows 15-35).
    //
    register('2', [
      // Social nodes
      { id: 'lantern_bonfire',          type: 'bonfire',        x: 33, y: 17 },
      { id: 'lantern_bench_w',          type: 'bench',          x: 10, y: 18 },
      { id: 'lantern_bench_c',          type: 'bench',          x: 24, y: 18 },
      { id: 'lantern_bench_e',          type: 'bench',          x: 40, y: 18 },

      // Errands nodes
      { id: 'lantern_notice_w',         type: 'bulletin_board', x: 15, y: 10 },
      { id: 'lantern_notice_e',         type: 'bulletin_board', x: 35, y: 10 },
      { id: 'lantern_shop_dispatcher',  type: 'shop_entrance',  x: 7,  y: 5  },
      { id: 'lantern_shop_armorer',     type: 'shop_entrance',  x: 22, y: 5  },
      { id: 'lantern_shop_chandler',    type: 'shop_entrance',  x: 28, y: 5  },
      { id: 'lantern_shop_apothecary',  type: 'shop_entrance',  x: 34, y: 5  },
      { id: 'lantern_shop_cartographer', type: 'shop_entrance', x: 40, y: 5  },
      { id: 'lantern_shop_teahouse',    type: 'shop_entrance',  x: 46, y: 5  },

      // Duty nodes (faction patrol anchors)
      { id: 'lantern_tide_post',        type: 'faction_post',   x: 8,  y: 12, faction: 'tide' },
      { id: 'lantern_foundry_post',     type: 'faction_post',   x: 22, y: 12, faction: 'foundry' },
      { id: 'lantern_admiralty_post',   type: 'faction_post',   x: 40, y: 12, faction: 'admiralty' },

      // Eat node
      { id: 'lantern_soup',             type: 'soup_kitchen',   x: 31, y: 15 },

      // Rest nodes (cots between facade doors)
      { id: 'lantern_cot_a',            type: 'rest_spot',      x: 11, y: 6  },
      { id: 'lantern_cot_b',            type: 'rest_spot',      x: 18, y: 6  },
      { id: 'lantern_cot_c',            type: 'rest_spot',      x: 25, y: 6  },
      { id: 'lantern_cot_d',            type: 'rest_spot',      x: 31, y: 6  },
      { id: 'lantern_cot_e',            type: 'rest_spot',      x: 37, y: 6  },
      { id: 'lantern_cot_f',            type: 'rest_spot',      x: 43, y: 6  }
    ]);

    // ── Floor 3: The Garrison (52×52, frontier crosshair) ─────────
    //
    // Crosshair layout with center guard tower + 4 arms.
    // 52×52 grid, sparsely populated. Dominant faction: Admiralty.
    //
    // North arm: forest clearing + bonfire.
    // West arm: entry from Floor 2.
    // East arm: ROAD highway to Floor 4 (locked).
    // South arm: fenced boardwalk pier.
    // Center: guard tower + slum shacks.
    //
    register('3', [
      // Social nodes
      { id: 'garrison_bonfire',          type: 'bonfire',        x: 23, y: 6  },
      { id: 'garrison_well',             type: 'well',           x: 25, y: 26 },

      // Errands nodes
      { id: 'garrison_notice',           type: 'bulletin_board', x: 36, y: 25 },
      { id: 'garrison_quartermaster',    type: 'shop_entrance',  x: 31, y: 20 },
      { id: 'garrison_clockmaster',      type: 'shop_entrance',  x: 40, y: 20 },

      // Duty nodes (faction patrol anchors)
      { id: 'garrison_foundry_post',     type: 'faction_post',   x: 30, y: 24, faction: 'foundry' },
      { id: 'garrison_admiralty_post',   type: 'faction_post',   x: 20, y: 24, faction: 'admiralty' },

      // Eat nodes (slum soup kitchen area)
      { id: 'garrison_soup_a',           type: 'soup_kitchen',   x: 14, y: 24 },
      { id: 'garrison_soup_b',           type: 'soup_kitchen',   x: 15, y: 24 },

      // Rest nodes (cots scattered among slum shacks)
      { id: 'garrison_cot_a',            type: 'rest_spot',      x: 20, y: 22 },
      { id: 'garrison_cot_b',            type: 'rest_spot',      x: 21, y: 22 },
      { id: 'garrison_cot_c',            type: 'rest_spot',      x: 26, y: 28 },
      { id: 'garrison_cot_d',            type: 'rest_spot',      x: 27, y: 28 },
      { id: 'garrison_cot_north_a',      type: 'rest_spot',      x: 22, y: 8  },
      { id: 'garrison_cot_north_b',      type: 'rest_spot',      x: 24, y: 8  }
    ]);

    console.log('[VerbNodes] Registered spatial nodes for '
      + Object.keys(_nodes).length + ' floor(s)');
  }

  // Auto-register on load
  _registerBuiltinNodes();

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    register:   register,
    getNodes:   getNodes,
    findById:   findById,
    floorCount: floorCount
  });
})();

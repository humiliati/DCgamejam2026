/**
 * VerbField — Actor-agnostic verb-field movement tick.
 *
 * Extracted from NpcSystem's _tickVerbField so that any actor
 * (friendly NPC, reanimated friendly enemy, Act-2 hostile, future
 * unified actor) can drive movement from the same verb-field
 * resolution without depending on npc-system internals.
 *
 * An actor is any object with { x, y, facing } that optionally
 * carries a _verbSet and verb-field state fields. This module does
 * not care whether it lives in NpcSystem._npcs, FloorManager enemies,
 * or the future unified actor list — the caller iterates and the
 * caller provides the step-sound hook.
 *
 * Layer 1 — depends only on TILES (Layer 0) for walkability checks.
 * See VERB_FIELD_NPC_ROADMAP.md §6 for algorithm.
 */
var VerbField = (function () {
  'use strict';

  // ── Tuning constants ─────────────────────────────────────────────
  // Canonical home for the verb-field tuning. NpcSystem references
  // these via VerbField.DISTANCE_WEIGHT etc. when it needs them.

  var DISTANCE_WEIGHT   = 0.15;   // How much distance penalises pull (lower = actors walk farther)
  var NOISE_FACTOR      = 0.05;   // Random perturbation on node score (breaks ties)
  var SATISFACTION_DROP = 0.50;   // How much need drops on node arrival
  var LINGER_MIN        = 3000;   // Min ms actor pauses at a node
  var LINGER_MAX        = 7000;   // Max ms actor pauses at a node

  var DEFAULT_STEP_INTERVAL = 600;

  // ── Assignment ───────────────────────────────────────────────────

  /**
   * Initialize verb-field state on an actor. The actor must already
   * have { x, y, facing } set. Idempotent for the step timing fields
   * so callers can pre-populate _stepInterval.
   *
   * @param {Object} actor
   * @param {Object} verbSet  — { verbName: { need, decayRate, satisfiers, factionLock? } }
   * @returns {Object} actor
   */
  function assign(actor, verbSet) {
    if (!actor) return actor;
    actor._verbSet          = verbSet;
    actor._verbSatisfyTimer = 0;
    actor._currentNode      = null;
    actor._dominantVerb     = null;
    actor._verbTarget       = null;
    if (actor._stepTimer === undefined)    actor._stepTimer = 0;
    if (actor._stepInterval === undefined) actor._stepInterval = DEFAULT_STEP_INTERVAL;
    return actor;
  }

  // ── Per-actor tick ───────────────────────────────────────────────

  /**
   * Run one verb-field tick for a single actor.
   *
   * @param {Object} actor  — must carry _verbSet (no-op if missing)
   * @param {number} dt     — ms since last tick
   * @param {Array}  grid   — 2D tile grid for walkability
   * @param {Array}  nodes  — spatial nodes from VerbNodes.getNodes(floorId)
   * @param {Object} [opts] — {
   *     onStep:    function(actor, nx, ny)          — called after a successful grid step
   *     factionOf: function(actor) -> string|null   — override actor.factionId lookup
   *   }
   */
  function tick(actor, dt, grid, nodes, opts) {
    if (!actor || !actor._verbSet) return;
    opts = opts || {};

    var verbs = actor._verbSet;
    var keys  = Object.keys(verbs);

    // 1. Decay — increase all verb needs over time
    for (var vi = 0; vi < keys.length; vi++) {
      var v = verbs[keys[vi]];
      v.need = Math.min(1.0, v.need + v.decayRate * dt);
    }

    // 2. Satisfaction linger — if paused at a node, don't move
    if (actor._verbSatisfyTimer > 0) {
      actor._verbSatisfyTimer -= dt;
      return;
    }

    // 3. Step timer — respect the actor's step cadence
    actor._stepTimer -= dt;
    if (actor._stepTimer > 0) return;
    actor._stepTimer = actor._stepInterval + (Math.random() * 200 - 100);

    // 4. Score all reachable nodes — find the strongest pull
    var bestScore = -1;
    var bestNode  = null;

    for (var ni = 0; ni < nodes.length; ni++) {
      var node = nodes[ni];

      // Compute total pull from all verbs this node satisfies
      var pull = 0;
      for (var vi2 = 0; vi2 < keys.length; vi2++) {
        var vb = verbs[keys[vi2]];
        for (var si = 0; si < vb.satisfiers.length; si++) {
          if (vb.satisfiers[si] === node.type) {
            // Faction lock check
            if (node.type === 'faction_post' && node.faction) {
              var actorFaction = opts.factionOf
                ? opts.factionOf(actor)
                : actor.factionId;
              if (vb.factionLock && vb.factionLock !== node.faction) continue;
              if (!vb.factionLock && actorFaction !== node.faction) continue;
            }
            pull += vb.need;
            break; // Each verb counts once per node
          }
        }
      }

      if (pull <= 0) continue;

      // Distance penalty (Manhattan) — closer nodes score higher
      var dx = actor.x - node.x;
      var dy = actor.y - node.y;
      var dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0) dist = 0.5; // Already at the node

      var score = pull / (dist * DISTANCE_WEIGHT);
      // Small random perturbation to break ties and create variety
      score += Math.random() * NOISE_FACTOR;

      if (score > bestScore) {
        bestScore = score;
        bestNode  = node;
      }
    }

    // 5. Step toward the winning node
    if (bestNode) {
      actor._verbTarget = bestNode;
      _stepToward(actor, bestNode.x, bestNode.y, grid, opts);
    }

    // 6. Check arrival — are we at or adjacent to any node?
    for (var ai = 0; ai < nodes.length; ai++) {
      var arrNode = nodes[ai];
      var adx = Math.abs(actor.x - arrNode.x);
      var ady = Math.abs(actor.y - arrNode.y);
      if (adx + ady > 1) continue; // Not at this node

      // Find which verb(s) this node satisfies and reduce their need
      var dominated = null;
      var bestNeed  = -1;
      for (var vk = 0; vk < keys.length; vk++) {
        var verb = verbs[keys[vk]];
        for (var sk = 0; sk < verb.satisfiers.length; sk++) {
          if (verb.satisfiers[sk] === arrNode.type) {
            if (arrNode.type === 'faction_post' && arrNode.faction) {
              var af = opts.factionOf
                ? opts.factionOf(actor)
                : actor.factionId;
              if ((verb.factionLock || af) !== arrNode.faction) continue;
            }
            verb.need = Math.max(0, verb.need - SATISFACTION_DROP);
            if (verb.need + SATISFACTION_DROP > bestNeed) {
              bestNeed = verb.need + SATISFACTION_DROP;
              dominated = keys[vk];
            }
            break;
          }
        }
      }

      // Linger at the node
      actor._verbSatisfyTimer = LINGER_MIN +
        Math.random() * (LINGER_MAX - LINGER_MIN);
      actor._currentNode  = arrNode;
      actor._dominantVerb = dominated;
      actor._verbTarget   = null;

      // Face toward the node
      _faceToward(actor, arrNode.x, arrNode.y);
      break;
    }
  }

  // ── Bulk tick ────────────────────────────────────────────────────

  /**
   * Tick every actor in the collection that carries a _verbSet.
   * Passes through opts unchanged.
   *
   * @param {Array}  actors
   * @param {number} dt
   * @param {Array}  grid
   * @param {Array}  nodes
   * @param {Object} [opts]
   */
  function tickAll(actors, dt, grid, nodes, opts) {
    if (!actors || actors.length === 0) return;
    if (!nodes || nodes.length === 0) return;
    for (var i = 0; i < actors.length; i++) {
      var a = actors[i];
      if (!a || !a._verbSet) continue;
      tick(a, dt, grid, nodes, opts);
    }
  }

  // ── Greedy one-step movement ─────────────────────────────────────
  //
  // Moves actor one tile toward (tx, ty). Dominant axis first, other
  // axis as fallback if blocked. Bails (stays put) if both are blocked.

  function _stepToward(actor, tx, ty, grid, opts) {
    var diffX = tx - actor.x;
    var diffY = ty - actor.y;
    if (diffX === 0 && diffY === 0) return;

    var dx = 0, dy = 0;
    if (Math.abs(diffX) >= Math.abs(diffY) && diffX !== 0) {
      dx = diffX > 0 ? 1 : -1;
    } else if (diffY !== 0) {
      dy = diffY > 0 ? 1 : -1;
    } else if (diffX !== 0) {
      dx = diffX > 0 ? 1 : -1;
    }

    var nx = actor.x + dx;
    var ny = actor.y + dy;

    // Wall / occupancy check
    var blocked = false;
    if (grid && grid[ny] && grid[ny][nx] !== undefined) {
      var tile = grid[ny][nx];
      if (typeof TILES !== 'undefined' && !TILES.isWalkable(tile)) {
        blocked = true;
      }
    }

    if (blocked) {
      // Try the other axis as fallback
      var dx2 = 0, dy2 = 0;
      if (dx !== 0 && diffY !== 0) {
        dy2 = diffY > 0 ? 1 : -1;
      } else if (dy !== 0 && diffX !== 0) {
        dx2 = diffX > 0 ? 1 : -1;
      }
      if (dx2 !== 0 || dy2 !== 0) {
        nx = actor.x + dx2;
        ny = actor.y + dy2;
        blocked = false;
        if (grid && grid[ny] && grid[ny][nx] !== undefined) {
          var tile2 = grid[ny][nx];
          if (typeof TILES !== 'undefined' && !TILES.isWalkable(tile2)) {
            blocked = true;
          }
        }
        if (!blocked) { dx = dx2; dy = dy2; }
        else return; // Both axes blocked — stay put
      } else {
        return; // No fallback axis
      }
    }

    // Commit the step
    actor._prevX = actor.x;
    actor._prevY = actor.y;
    actor._lerpT = 0;

    actor.x = nx;
    actor.y = ny;

    if      (dx > 0)  actor.facing = 'east';
    else if (dx < 0)  actor.facing = 'west';
    else if (dy > 0)  actor.facing = 'south';
    else if (dy < 0)  actor.facing = 'north';

    if (opts && typeof opts.onStep === 'function') {
      opts.onStep(actor, nx, ny);
    }
  }

  /**
   * Face an actor toward a specific grid position.
   * Exposed publicly because encounter detection and arrival code
   * both want it.
   */
  function faceToward(actor, tx, ty) {
    _faceToward(actor, tx, ty);
  }

  function _faceToward(actor, tx, ty) {
    var dx = tx - actor.x;
    var dy = ty - actor.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      actor.facing = dx > 0 ? 'east' : (dx < 0 ? 'west' : actor.facing);
    } else {
      actor.facing = dy > 0 ? 'south' : (dy < 0 ? 'north' : actor.facing);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return Object.freeze({
    assign:      assign,
    tick:        tick,
    tickAll:     tickAll,
    faceToward:  faceToward,
    // Tuning constants exposed for inspection / shared reads
    DISTANCE_WEIGHT:   DISTANCE_WEIGHT,
    NOISE_FACTOR:      NOISE_FACTOR,
    SATISFACTION_DROP: SATISFACTION_DROP,
    LINGER_MIN:        LINGER_MIN,
    LINGER_MAX:        LINGER_MAX
  });
})();

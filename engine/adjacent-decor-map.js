/**
 * AdjacentDecorMap — IIFE module (Layer 1)
 *
 * Data registry for DOC-117 Adjacent Tile Decor System — Tier 1
 * scaffolding.
 *
 * Ecology-carrying source tiles (creature tiles, botanical anchors,
 * infrastructure tiles) declare a list of decor sprite entries that
 * should scatter onto neighboring tiles at floor-load time. A
 * companion spawner (engine/adjacent-decor-spawner.js, Layer 3)
 * consumes this registry, rolls seeded RNG per candidate neighbor,
 * and writes results into the Raycaster's _wallDecor + _floorDecor
 * maps.
 *
 * SCOPE — Tier 1 scaffolding only. Sprite rosters are empty at this
 * stage so the module + spawn pipe can be exercised end-to-end
 * without any art landing. Sprites are added in the §8a step-2 pass
 * (feather + bone + scratch generators in TextureAtlas). Tier 2
 * (botanical) and Tier 3 (infrastructure & street) ship post-Jam
 * per DOC-117 §8b-§8c.
 *
 * Schema (per entry — see DOC-117 §2a):
 *   sprite:        string     sprite ID registered with TextureAtlas
 *   placement:     enum       'floor' | 'wall-knee' | 'wall-mid' | 'wall-top'
 *   rate:          0-1 float  independent Bernoulli probability
 *   directions:    enum       'cardinal' | 'adjacent-only' | 'facing-tile'
 *                             | 'inline' | 'front 1-tile' | 'all'
 *   neighborTiles: int[]?     optional allowlist of target tile IDs
 *                             (Tier 2/3). Absent → any walkable neighbor.
 *   minDepth:      int?       optional floor depth gate
 *   biomeTint:     bool?      optional biome accent tint
 *
 * Public API is frozen: AdjacentDecorMap.getConfig(tileId) returns
 * the registered entry array (or [] if the tile is not a source).
 * The module is a pure lookup — no state, no side effects.
 */
var AdjacentDecorMap = (function () {
  'use strict';

  // Layer 0 constants. Guard for the standalone-test case where this
  // module loads without TILES (e.g. a future node syntax-check
  // harness). In-browser, TILES is always defined by the time this
  // IIFE runs because index.html loads tiles.js in Layer 0.
  var T = (typeof TILES !== 'undefined') ? TILES : {};

  // ── Tier 1 — Creature ecology (DOC-117 §1a-§1f, shipped 2026-04-17)
  //
  // 19 sprite entries authored per DOC-117_TIER1_SPRITE_TAXONOMY.md.
  // Rates tuned conservatively to respect the ~12-instance dungeon-floor
  // perf budget (DOC-117 §7). Directions = 'cardinal' for this first
  // live pass — advanced modes (facing-tile/inline) fall back to
  // cardinal in the spawner with a warn-once, so the pipeline stays
  // deterministic until those resolvers land.
  var MAP = {};

  // §1a ROOST — feathers, scales, guano drip above the perch.
  MAP[T.ROOST || 49] = [
    { sprite: 'decor_feather_single',     placement: 'floor',    rate: 0.50, directions: 'cardinal' },
    { sprite: 'decor_feather_tuft',       placement: 'floor',    rate: 0.25, directions: 'cardinal' },
    { sprite: 'decor_dragon_scale',       placement: 'floor',    rate: 0.15, directions: 'cardinal' },
    { sprite: 'decor_guano_streak_wall',  placement: 'wall-top', rate: 0.40, directions: 'cardinal' }
  ];

  // §1b NEST — woven sticks, bone fragments on the ground around the mound.
  MAP[T.NEST || 50] = [
    { sprite: 'decor_bone_shard_floor',   placement: 'floor', rate: 0.40, directions: 'cardinal' },
    { sprite: 'decor_stick_bundle_floor', placement: 'floor', rate: 0.35, directions: 'cardinal' }
  ];

  // §1c DEN — fur, gnawed bones, claw damage on adjacent walls.
  MAP[T.DEN || 51] = [
    { sprite: 'decor_fur_tuft',            placement: 'floor',    rate: 0.40, directions: 'cardinal' },
    { sprite: 'decor_gnawed_bone',         placement: 'floor',    rate: 0.35, directions: 'cardinal' },
    { sprite: 'decor_bone_shard_floor',    placement: 'floor',    rate: 0.25, directions: 'cardinal' },
    { sprite: 'decor_scratch_kneehigh',    placement: 'wall-knee',rate: 0.40, directions: 'cardinal' },
    { sprite: 'decor_claw_gouge_masonry',  placement: 'wall-mid', rate: 0.18, directions: 'cardinal' }
  ];

  // §1d FUNGAL_PATCH — fungus on walls + spore clouds + mycelium threads.
  MAP[T.FUNGAL_PATCH || 52] = [
    { sprite: 'decor_fungus_climb_wall',      placement: 'wall-mid', rate: 0.45, directions: 'cardinal' },
    { sprite: 'decor_spore_puff_floor',       placement: 'floor',    rate: 0.35, directions: 'cardinal' },
    { sprite: 'decor_mycelium_thread_wall',   placement: 'wall-mid', rate: 0.20, directions: 'cardinal' }
  ];

  // §1e ENERGY_CONDUIT — brass pipe run, oil/filings, warning plate.
  MAP[T.ENERGY_CONDUIT || 53] = [
    { sprite: 'decor_brass_pipe_run_wall',      placement: 'wall-mid', rate: 0.55, directions: 'cardinal' },
    { sprite: 'decor_copper_filings_floor',     placement: 'floor',    rate: 0.35, directions: 'cardinal' },
    { sprite: 'decor_oil_stain_floor',          placement: 'floor',    rate: 0.22, directions: 'cardinal' },
    { sprite: 'decor_warning_sign_plate',       placement: 'wall-top', rate: 0.15, directions: 'cardinal' }
  ];

  // §1f TERRITORIAL_MARK — parallel scratches + blood dots.
  MAP[T.TERRITORIAL_MARK || 54] = [
    { sprite: 'decor_scratch_parallel_wall',  placement: 'wall-mid', rate: 0.35, directions: 'cardinal' },
    { sprite: 'decor_blood_dot_floor',        placement: 'floor',    rate: 0.30, directions: 'cardinal' }
  ];

  // Tier 2 (botanical) + Tier 3 (infrastructure) are declared here
  // when the respective rollouts land (DOC-117 §8b / §8c). Until
  // then, their source tile IDs fall through to the empty-list
  // default in getConfig() — same semantic as "not a source tile".

  /**
   * Lookup decor entries for a source tile.
   *
   * @param {number} tileId — a TILES constant value.
   * @returns {Array<Object>} the registered entry list. Always an
   *   array — callers can iterate without a null check. Empty array
   *   means "this tile is not an ecology source (or its sprites
   *   haven't shipped yet)."
   */
  function getConfig(tileId) {
    var list = MAP[tileId];
    return list || [];
  }

  /**
   * Is this tile registered as an ecology source? Useful for tooling
   * (blockout-visualizer preview hook — DOC-117 §8d item 14) to
   * highlight decor-producing tiles without iterating the full
   * neighbor logic.
   *
   * Returns true even for a registered tile with an empty entry list
   * — the registration is the signal, not the list length. This
   * stays stable as tiers ship sprites over time.
   *
   * @param {number} tileId
   * @returns {boolean}
   */
  function isSourceTile(tileId) {
    return Object.prototype.hasOwnProperty.call(MAP, tileId);
  }

  return Object.freeze({
    getConfig:    getConfig,
    isSourceTile: isSourceTile
  });
})();

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

  // ── Tier 1 — Creature ecology (scaffolding; empty until §8a step 2)
  //
  // Each creature tile gets a registered entry list. Empty arrays
  // preserve the registration surface (the spawner will iterate and
  // simply find nothing to place) so that lookups by tile ID never
  // return undefined. This lets the spawn pass + Raycaster decor map
  // plumbing be exercised before any sprite generator lands.
  //
  // When sprite generators are wired, replace each [] with the
  // catalogue rows from DOC-117 §1a-§1f.
  var MAP = {};
  MAP[T.ROOST            || 49] = []; // §1a ROOST
  MAP[T.NEST             || 50] = []; // §1b NEST
  MAP[T.DEN              || 51] = []; // §1c DEN
  MAP[T.FUNGAL_PATCH     || 52] = []; // §1d FUNGAL_PATCH
  MAP[T.ENERGY_CONDUIT   || 53] = []; // §1e ENERGY_CONDUIT
  MAP[T.TERRITORIAL_MARK || 54] = []; // §1f TERRITORIAL_MARK

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

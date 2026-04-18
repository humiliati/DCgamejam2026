/**
 * AdjacentDecorSpawner — IIFE module (Layer 3)
 *
 * Runtime side of the DOC-117 Adjacent Tile Decor System. Subscribes
 * to FloorManager's 'floor-loaded' event and, for each source tile
 * registered in AdjacentDecorMap, rolls seeded RNG against its
 * neighbors and publishes decor entries into the Raycaster's floor +
 * wall decor maps.
 *
 * Pipeline per floor-loaded event:
 *   1. Read floorData.grid + dimensions + depth from the payload.
 *   2. Walk every cell. For each source tile (AdjacentDecorMap has a
 *      registered config), iterate its decor entries.
 *   3. For each entry, compute the candidate neighbor set by direction
 *      filter, apply the neighborTiles allowlist (pre-roll guard per
 *      DOC-117 §3 — filter rejection does NOT advance the RNG stream),
 *      then roll SeededRNG.random() against the entry's rate.
 *   4. Accepted rolls accumulate into a floor-decor map (for 'floor'
 *      placements) or a wall-decor overlay (for 'wall-*' placements).
 *   5. Publish via Raycaster.setFloorDecor + Raycaster.mergeWallDecor.
 *
 * Determinism: SeededRNG is reseeded per floor by FloorTransition
 * (via SeededRNG.deriveFloor). Within a single spawn pass, entries
 * roll in a fixed iteration order (y-major → x-major → entry index)
 * so revisits produce identical decor. Adding or removing
 * neighborTiles from an entry only reveals/hides spawns where rolls
 * already would have happened — other decor does not shift.
 *
 * Scaffolding state (2026-04-17): Tier 1 catalogs in AdjacentDecorMap
 * are empty shells so the spawn pass + maps are exercised without any
 * sprites landing. Running this module today produces zero decor
 * entries on any floor — a valid no-op that confirms the event
 * subscription + floor walk + setter calls are wired.
 *
 * Dependencies:
 *   - FloorManager (Layer 3, loads before this module)    → on('floor-loaded')
 *   - AdjacentDecorMap (Layer 1)                          → getConfig(tileId)
 *   - SeededRNG (Layer 0)                                 → random(), randInt()
 *   - Raycaster (Layer 2)                                 → setFloorDecor, mergeWallDecor
 *
 * See docs/ADJACENT_TILE_DECOR_SPEC.md (DOC-117) §3 for the spawn
 * pseudocode, §4 for placement math, §2a for schema semantics.
 */
var AdjacentDecorSpawner = (function () {
  'use strict';

  // ── Direction filter implementations ────────────────────────────
  //
  // Each filter returns an array of candidate neighbor cells:
  //   [{ x, y, face }, ...]
  //
  //   face: direction index 0-3 matching the raycaster's face
  //         convention (0=EAST, 1=SOUTH, 2=WEST, 3=NORTH) — the face
  //         of the SOURCE tile that points at the neighbor. Used by
  //         wall-* placements so the overlay can key into the
  //         correct per-face slot of _wallDecor[y][x][face].
  //
  // Note on scaffolding: Tier 1 decor catalogs are empty, so these
  // filters are not exercised in production today. They are
  // implemented up front so the pipeline is complete when sprites
  // land in §8a step 2. `facing-tile`, `inline`, and `front 1-tile`
  // currently fall back to `cardinal` with a console warn — they
  // require a `primaryFacing` field on the source tile's contract
  // entry which is out of scope for this scaffolding pass. Upgrade
  // these before shipping any entry that uses the corresponding
  // direction mode.
  //
  // Face indices for cardinal offsets (matches raycaster.js):
  //   EAST  (+x, 0, face 0)
  //   SOUTH (0, +y, face 1)
  //   WEST  (-x, 0, face 2)
  //   NORTH (0, -y, face 3)

  var _CARDINAL_OFFSETS = [
    { dx:  1, dy:  0, face: 0 }, // EAST
    { dx:  0, dy:  1, face: 1 }, // SOUTH
    { dx: -1, dy:  0, face: 2 }, // WEST
    { dx:  0, dy: -1, face: 3 }  // NORTH
  ];

  var _ALL_OFFSETS = [
    { dx:  1, dy:  0, face: 0 }, { dx:  1, dy:  1, face: 1 },
    { dx:  0, dy:  1, face: 1 }, { dx: -1, dy:  1, face: 1 },
    { dx: -1, dy:  0, face: 2 }, { dx: -1, dy: -1, face: 3 },
    { dx:  0, dy: -1, face: 3 }, { dx:  1, dy: -1, face: 3 }
  ];

  function _neighborsCardinal(sx, sy, gridW, gridH) {
    var out = [];
    for (var i = 0; i < _CARDINAL_OFFSETS.length; i++) {
      var o = _CARDINAL_OFFSETS[i];
      var nx = sx + o.dx, ny = sy + o.dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      out.push({ x: nx, y: ny, face: o.face });
    }
    return out;
  }

  function _neighborsAll(sx, sy, gridW, gridH) {
    var out = [];
    for (var i = 0; i < _ALL_OFFSETS.length; i++) {
      var o = _ALL_OFFSETS[i];
      var nx = sx + o.dx, ny = sy + o.dy;
      if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
      out.push({ x: nx, y: ny, face: o.face });
    }
    return out;
  }

  // Tracks whether the primaryFacing-required filters have already
  // warned for this session — keeps the console quiet once the
  // author is aware of the missing upgrade.
  var _warnedFacingTile = false;
  var _warnedInline = false;
  var _warnedFrontTile = false;

  function _candidateNeighbors(mode, sx, sy, gridW, gridH) {
    switch (mode) {
      case 'cardinal':
      case 'adjacent-only':
        // 'cardinal' and 'adjacent-only' share geometry here. The
        // spec distinguishes them by walkability semantics but the
        // spawner doesn't yet enforce walkability on the neighbor
        // (Tier 1 entries have no walkability constraint; Tier 2/3
        // enforce via neighborTiles). They'll differ once the §9a
        // walkability-blocking question is resolved.
        return _neighborsCardinal(sx, sy, gridW, gridH);
      case 'all':
        return _neighborsAll(sx, sy, gridW, gridH);
      case 'facing-tile':
        if (!_warnedFacingTile) {
          console.warn('[AdjacentDecorSpawner] directions="facing-tile" falls back to cardinal (primaryFacing not yet wired; DOC-117 §4 upgrade pending)');
          _warnedFacingTile = true;
        }
        return _neighborsCardinal(sx, sy, gridW, gridH);
      case 'inline':
        if (!_warnedInline) {
          console.warn('[AdjacentDecorSpawner] directions="inline" falls back to cardinal (primaryFacing not yet wired; DOC-117 §4 upgrade pending)');
          _warnedInline = true;
        }
        return _neighborsCardinal(sx, sy, gridW, gridH);
      case 'front 1-tile':
        if (!_warnedFrontTile) {
          console.warn('[AdjacentDecorSpawner] directions="front 1-tile" falls back to cardinal (primaryFacing not yet wired; DOC-117 §4 upgrade pending)');
          _warnedFrontTile = true;
        }
        return _neighborsCardinal(sx, sy, gridW, gridH);
      default:
        console.warn('[AdjacentDecorSpawner] unknown directions mode "' + mode + '" — using cardinal');
        return _neighborsCardinal(sx, sy, gridW, gridH);
    }
  }

  // ── Main spawn pass ──────────────────────────────────────────────

  /**
   * Build a fresh decor overlay for the freshly-loaded floor.
   * Returns { floorDecor, wallDecor } — each is an array-of-maps
   * ready to hand to the raycaster.
   *
   * Pure function of the grid + RNG stream + AdjacentDecorMap.
   * Extracted from the event handler for unit testability + so
   * tooling (blockout-visualizer preview pass, DOC-117 §8d item 14)
   * can reuse it.
   */
  function buildOverlay(grid, gridW, gridH, depth) {
    var floorDecor = [];   // floorDecor[y][x] = Array of items
    var wallOverlay = [];  // wallOverlay[y][x][face] = Array of items

    if (!grid || !gridW || !gridH) return { floorDecor: floorDecor, wallDecor: wallOverlay };
    if (typeof AdjacentDecorMap === 'undefined' || typeof SeededRNG === 'undefined') {
      return { floorDecor: floorDecor, wallDecor: wallOverlay };
    }

    for (var y = 0; y < gridH; y++) {
      var row = grid[y];
      if (!row) continue;
      for (var x = 0; x < gridW; x++) {
        var tileId = row[x];
        var cfg = AdjacentDecorMap.getConfig(tileId);
        if (!cfg.length) continue; // Not a source tile

        for (var ei = 0; ei < cfg.length; ei++) {
          var entry = cfg[ei];

          // minDepth gate — happens before neighbor iteration so we
          // don't burn RNG rolls on out-of-depth entries.
          if (typeof entry.minDepth === 'number' && depth < entry.minDepth) continue;

          var neighbors = _candidateNeighbors(entry.directions || 'cardinal', x, y, gridW, gridH);
          for (var ni = 0; ni < neighbors.length; ni++) {
            var n = neighbors[ni];
            var neighborTile = (grid[n.y] && grid[n.y][n.x] !== undefined) ? grid[n.y][n.x] : -1;

            // Pre-roll neighborTiles guard (DOC-117 §3). Filter
            // rejection does NOT advance the RNG stream — adding or
            // removing entries from the allowlist reveals/hides
            // spawns deterministically without shifting other decor.
            if (entry.neighborTiles && entry.neighborTiles.indexOf(neighborTile) < 0) continue;

            var roll = SeededRNG.random();
            if (roll >= (entry.rate || 0)) continue;

            var item = _buildDecorItem(entry, n, depth);
            if (!item) continue;

            if (entry.placement === 'floor') {
              if (!floorDecor[n.y]) floorDecor[n.y] = [];
              if (!floorDecor[n.y][n.x]) floorDecor[n.y][n.x] = [];
              floorDecor[n.y][n.x].push(item);
            } else {
              // wall-knee / wall-mid / wall-top — overlay keyed by
              // source-facing face so it lands on the wall face that
              // faces the source tile (e.g. guano streak on the wall
              // beneath a roost overhang).
              if (!wallOverlay[n.y]) wallOverlay[n.y] = {};
              if (!wallOverlay[n.y][n.x]) wallOverlay[n.y][n.x] = {};
              if (!wallOverlay[n.y][n.x][n.face]) wallOverlay[n.y][n.x][n.face] = [];
              wallOverlay[n.y][n.x][n.face].push(item);
            }
          }
        }
      }
    }

    return { floorDecor: floorDecor, wallDecor: wallOverlay };
  }

  /**
   * Build a single decor item struct matching the shape RaycasterSprites
   * already consumes for _wallDecor entries. Floor items follow the
   * same shape minus the face semantics — RaycasterSprites' future
   * floorDecor renderer will read these fields from _floorDecor.
   *
   * Fields stored (DOC-117 §4):
   *   spriteId   — for sprite atlas lookup
   *   placement  — echoed so the renderer can read it without the
   *                index hop back into AdjacentDecorMap
   *   anchorU    — jittered ±0.15 per instance (see §4)
   *   anchorV    — derived from placement band
   *   minDepth   — copied for runtime gate checks (e.g., fading)
   *   biomeTint  — copied for the future tint pass (§9c)
   */
  function _buildDecorItem(entry, neighbor, depth) {
    if (!entry || !entry.sprite) return null;

    var anchorV = 0.5;
    switch (entry.placement) {
      case 'wall-top':  anchorV = 0.15; break; // V-range 0.00 – 0.30
      case 'wall-mid':  anchorV = 0.50; break; // V-range 0.30 – 0.70
      case 'wall-knee': anchorV = 0.85; break; // V-range 0.70 – 1.00
      case 'floor':
      default:          anchorV = 1.00; break; // floor-plane decor
    }

    // ±0.15 U-jitter (DOC-117 §4). Consumes one RNG draw per placed
    // item, distinct from the acceptance roll above.
    var jitter = (SeededRNG.random() - 0.5) * 0.3;
    var anchorU = 0.5 + jitter;

    return {
      spriteId:  entry.sprite,
      placement: entry.placement,
      anchorU:   anchorU,
      anchorV:   anchorV,
      minDepth:  (typeof entry.minDepth === 'number') ? entry.minDepth : null,
      biomeTint: !!entry.biomeTint
    };
  }

  // ── Event handler ────────────────────────────────────────────────

  function _onFloorLoaded(payload) {
    if (!payload || !payload.floorData) return;
    var fd = payload.floorData;
    var grid = fd.grid, gridW = fd.gridW, gridH = fd.gridH;
    var depth = payload.depth || 1;

    var overlay = buildOverlay(grid, gridW, gridH, depth);

    if (typeof Raycaster !== 'undefined') {
      if (typeof Raycaster.setFloorDecor === 'function') {
        Raycaster.setFloorDecor(overlay.floorDecor);
      }
      if (typeof Raycaster.mergeWallDecor === 'function') {
        Raycaster.mergeWallDecor(overlay.wallDecor);
      }
    }
  }

  // ── Init: subscribe to FloorManager event ────────────────────────
  //
  // IIFE init time is guaranteed to run after FloorManager's IIFE
  // because index.html loads this script later in Layer 3. We
  // subscribe once; there's no need to off() because the spawner
  // lives for the lifetime of the game.
  if (typeof FloorManager !== 'undefined' && typeof FloorManager.on === 'function') {
    FloorManager.on('floor-loaded', _onFloorLoaded);
  } else {
    console.warn('[AdjacentDecorSpawner] FloorManager.on not available at init — subscription skipped');
  }

  return Object.freeze({
    buildOverlay:    buildOverlay,
    _onFloorLoaded:  _onFloorLoaded // exposed for tooling/tests; leading underscore signals internal
  });
})();

/**
 * HoseDecal — Per-tile visit ledger derived from HoseState path.
 *
 * PURE DATA. No rendering, no DOM, no gameplay side-effects.
 *
 * Maintains a denser representation of the hose path than HoseState's flat
 * _path array: for every visited tile, we record every visit with its entry
 * and exit directions. This is the primitive that:
 *   - HoseOverlay      (Rung 2B) draws minimap stripes from
 *   - RaycasterFloor   (Rung 2C) composites 32×32 floor decals from
 *   - MovementCtrl/hook(Rung 2D) consults on tile-entry to detect self-squeeze
 *   - SpraySystem      (Rung 2E) reads isCrossed() on the player's tile to
 *                      apply the flow-squeeze pressure penalty
 *   - Procgen contracts(Rung 2F) use the crossCount/length stats as a shape
 *                      metric when scoring generated floors
 *
 * Direction convention (CLAUDE.md § "Direction convention"):
 *   0 = EAST  (+x)   1 = SOUTH (+y, since +Y = south on screen)
 *   2 = WEST  (-x)   3 = NORTH (-y)
 *
 * A "visit" is one pass of the hose across a single tile cell:
 *   { entryDir, exitDir, visitIndex }
 *     entryDir  — which edge the hose came in through
 *                 (null = start of a strand / floor warp / initial attach)
 *     exitDir   — which edge the hose left through
 *                 (null = current head of hose, player still on it)
 *     visitIndex — monotonic counter unique across the whole ledger.
 *                  Used during pop to identify which visit to remove.
 *
 * Tile record stored per (floorId, x, y):
 *   { visits: [Visit, Visit, ...], crossCount: n }
 *     crossCount === visits.length (cached so isCrossed() is O(1))
 *
 * Lifecycle parity with HoseState:
 *   - HoseState.attach()  → ledger wiped, seed visit recorded for start tile
 *   - HoseState step      → append a new visit, patch prior head's exitDir
 *   - HoseState pop       → remove head visit, re-null the new head's exitDir
 *   - HoseState detach()  → ledger PRESERVED (mirrors HoseState._path policy,
 *                           so retract animations / "last dropped" overlays
 *                           can still read the path until next attach()).
 *
 * Layer 1. Depends only on HoseState (same layer, loaded earlier).
 */
var HoseDecal = (function () {
  'use strict';

  // ── Direction constants (CLAUDE.md: 0=E, 1=S, 2=W, 3=N) ─────────
  var DIR_EAST  = 0;
  var DIR_SOUTH = 1;
  var DIR_WEST  = 2;
  var DIR_NORTH = 3;

  // ── Rung 2C raster constants ────────────────────────────────────
  // Sub-cell resolution per tile. 16×16 at 2 channels = 512 bytes/tile.
  var HOSE_RES          = 16;
  // Half-width of the stripe mask (circle radius in subcells). 2 → 4-wide.
  var HOSE_STRIPE_HALFW = 2;
  // How far a U-turn / head-or-tail stub penetrates from the edge midpoint
  // toward the tile center. Chosen to read as a stub, not a through-line.
  var HOSE_STUB_DEPTH   = 6;

  // Direction index → tile-local subcell coordinate of the edge midpoint.
  // Order matches DIR_* constants: 0=E, 1=S, 2=W, 3=N.
  // Using HOSE_RES - 1 for the far edge keeps every midpoint in-bounds.
  var EDGE_PT = [
    { x: HOSE_RES - 1,    y: HOSE_RES >> 1 },  // E — right edge, mid row
    { x: HOSE_RES >> 1,   y: HOSE_RES - 1 },   // S — bottom edge, mid col
    { x: 0,               y: HOSE_RES >> 1 },  // W — left edge,  mid row
    { x: HOSE_RES >> 1,   y: 0 }               // N — top edge,   mid col
  ];
  // Tile center — shared endpoint for stubs / elbow corners.
  var CENTER_PT = { x: HOSE_RES >> 1, y: HOSE_RES >> 1 };

  // Public feature flag (Rung 2C perf protocol — spec §11.2). When false,
  // getBitmap() still works (so consumers that call it survive), but the
  // floor sampler can branch on this to skip the hose block entirely for
  // A/B measurement. Default true — the decal renders unless a harness
  // explicitly flips it.
  var _RUNG_2C_RENDER = true;

  /** Unit-vector delta → direction index, or null if non-adjacent. */
  function _deltaToDir(dx, dy) {
    if (dx ===  1 && dy ===  0) return DIR_EAST;
    if (dx === -1 && dy ===  0) return DIR_WEST;
    if (dx ===  0 && dy ===  1) return DIR_SOUTH;
    if (dx ===  0 && dy === -1) return DIR_NORTH;
    return null;
  }

  function _opposite(dir) {
    if (dir == null) return null;
    return (dir + 2) % 4;
  }

  // ── State ──────────────────────────────────────────────────────
  // _floors[floorId][tileKey] = {visits: [...], crossCount: n}
  // tileKey = "x,y" (floorId is a separate key level, not baked into tileKey)
  var _floors = Object.create(null);

  // Chronological list of visits — one entry per record, in push order.
  // Each entry: {floorId, tileKey, visitIndex}
  // Mirrors HoseState._path length exactly.
  var _visitSequence = [];

  // Monotonic counter. Never reused; pop decrements sequence but not this.
  var _nextVisitIndex = 0;

  // Bumped on every ledger mutation. Consumers (minimap, decal renderer)
  // can cheap-check "has anything changed since I last rendered?".
  var _version = 0;
  function _bump() { _version++; }

  function _tileKey(x, y) { return x + ',' + y; }

  function _getOrMakeTile(floorId, key) {
    var floor = _floors[floorId];
    if (!floor) { floor = _floors[floorId] = Object.create(null); }
    var rec = floor[key];
    if (!rec) {
      rec = floor[key] = {
        visits: [],
        crossCount: 0,
        // Rung 2C raster state (lazy — bmp allocates on first getBitmap())
        bmp: null,                // Uint8Array(HOSE_RES * HOSE_RES * 2) when realized
        visitIndexAtPaint: -1,    // head-visit index at last paint/rebuild
        dirty: true               // true → rebuild on next getBitmap()
      };
    }
    return rec;
  }

  function _dropEmptyTile(floorId, key) {
    var floor = _floors[floorId];
    if (!floor) return;
    var rec = floor[key];
    if (rec && rec.visits.length === 0) {
      delete floor[key];
      // Keep the floor bucket itself — floors get re-entered during retract.
    }
  }

  /** Find a specific visit within a tile record by its visitIndex. */
  function _findVisitIdx(rec, visitIndex) {
    if (!rec) return -1;
    for (var i = rec.visits.length - 1; i >= 0; i--) {
      if (rec.visits[i].visitIndex === visitIndex) return i;
    }
    return -1;
  }

  // ── Rung 2C raster primitives (internal) ────────────────────────
  //
  // Per-tile bitmaps are 16×16 subcells × 2 interleaved channels.
  //   data[(y * HOSE_RES + x) * 2 + 0] = coverage  (0..255, painted)
  //   data[(y * HOSE_RES + x) * 2 + 1] = intensity (mirrors coverage in 2C;
  //                                      reserved for Rung 2E flow simulation)
  //
  // All raster writes use max-combine so overlapping strokes compose
  // idempotently. That makes `_paintStripe` safe to call twice with the same
  // args, and lets crossed tiles naturally show both stripes.
  //
  // Coverage is pure geometry — age-since-head, kink desaturation, and the
  // head-pulse tint are computed per-frame in the floor sampler from
  // per-tile `visitIndexAtPaint` + per-frame global snapshots, NOT baked
  // into the bitmap. That keeps the raster a one-shot asset and avoids
  // rebaking visited tiles as the head advances.

  /**
   * Allocate (if needed) and return the raw Uint8Array for a tile's bitmap.
   * Tile records store `.bmp = null` until this is called, so tiles that
   * are never sampled (offscreen, fog-washed) never pay the 512 bytes.
   */
  function _getOrInitBmp(tileRec) {
    if (tileRec.bmp === null) {
      tileRec.bmp = new Uint8Array(HOSE_RES * HOSE_RES * 2);
    }
    return tileRec.bmp;
  }

  /**
   * Paint a filled disc of radius `r` subcells centered at `(cx, cy)` with
   * max-combine semantics. Out-of-bounds subcells are skipped. Hits both
   * channels (channel 1 mirrors coverage for 2C; reserved for 2E flow).
   */
  function _paintDisc(bmp, cx, cy, r, intensity) {
    var rSq = r * r;
    var minX = Math.max(0,            Math.floor(cx - r));
    var maxX = Math.min(HOSE_RES - 1, Math.ceil (cx + r));
    var minY = Math.max(0,            Math.floor(cy - r));
    var maxY = Math.min(HOSE_RES - 1, Math.ceil (cy + r));
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var ddx = x - cx, ddy = y - cy;
        if (ddx * ddx + ddy * ddy > rSq) continue;
        var idx = (y * HOSE_RES + x) * 2;
        if (bmp[idx    ] < intensity) bmp[idx    ] = intensity;  // coverage
        if (bmp[idx + 1] < intensity) bmp[idx + 1] = intensity;  // intensity
      }
    }
  }

  /**
   * Thickened-line rasterizer. Walks `(x1,y1) → (x2,y2)` in subcell steps
   * and stamps a disc of radius `halfW` at each step. Uses max-combine on
   * both channels. Zero-length lines degrade to a single disc.
   */
  function _paintLine(bmp, x1, y1, x2, y2, halfW, intensity) {
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.max(Math.abs(dx), Math.abs(dy));
    if (len === 0) { _paintDisc(bmp, x1, y1, halfW, intensity); return; }
    var stepX = dx / len, stepY = dy / len;
    // Sub-pixel step → we want to cover every subcell along the way, so
    // run t from 0 to len (inclusive) painting a disc per integer step.
    for (var t = 0; t <= len; t++) {
      _paintDisc(bmp, x1 + stepX * t, y1 + stepY * t, halfW, intensity);
    }
  }

  /**
   * Paint one visit's stripe into a tile bitmap. Shape is dispatched by the
   * (fromEdge, toEdge) pair:
   *
   *   (-1, -1)           → seed disc at center (origin, no motion)
   *   (-1,  d)           → tail stub: center → EDGE_PT[d]
   *   ( d, -1)           → head stub: EDGE_PT[d] → center
   *   ( d, (d+2)%4)      → through-pass: EDGE_PT[d] → EDGE_PT[opposite]
   *   ( d, d)            → U-turn: EDGE_PT[d] → stub point HOSE_STUB_DEPTH
   *                                 subcells inward along the inward normal
   *   ( d, e) perp       → 90° elbow: two lines EDGE_PT[d]→CENTER→EDGE_PT[e]
   *
   * `intensity` is the fill strength (typically 255). Safe to call twice
   * with identical args — max-combine leaves the bitmap unchanged.
   */
  function _paintStripe(bmp, fromEdge, toEdge, intensity) {
    if (fromEdge === -1 && toEdge === -1) {
      // Seed disc — slightly larger than stripe half-width so the origin
      // reads as a point on the floor rather than a hairline.
      _paintDisc(bmp, CENTER_PT.x, CENTER_PT.y,
                 HOSE_STRIPE_HALFW + 1, intensity);
      return;
    }

    // Exactly one edge is open — that's either a tail stub (entry=-1) or
    // the head of hose (exit=-1). Both rasterize as edge↔center; the head
    // pulse tint is applied at sampler time via visitIndexAtPaint.
    if (fromEdge === -1 || toEdge === -1) {
      var d = (fromEdge === -1) ? toEdge : fromEdge;
      var ep = EDGE_PT[d];
      _paintLine(bmp, ep.x, ep.y,
                      CENTER_PT.x, CENTER_PT.y,
                      HOSE_STRIPE_HALFW, intensity);
      return;
    }

    // Both edges concrete from here on.
    if (fromEdge === toEdge) {
      // U-turn — from edge to a stub HOSE_STUB_DEPTH subcells inward.
      // Inward normal from EDGE_PT[d] is the vector (CENTER_PT - EDGE_PT[d])
      // scaled to unit length, but since edges are axis-aligned the inward
      // direction is simply the opposite axis component. Using EDGE_PT[opposite]
      // as the "deep" end and scaling by stubDepth/(HOSE_RES-1) along the
      // line gives us the stub point in one lerp.
      var dU = fromEdge;
      var epU = EDGE_PT[dU];
      var opp = EDGE_PT[(dU + 2) % 4];
      // Parametric t along EDGE_PT[d] → EDGE_PT[opp] that lands at
      // HOSE_STUB_DEPTH subcells from the entry edge.
      var axisLen = HOSE_RES - 1;  // distance between opposing edge midpoints
      var tStub = Math.min(1, HOSE_STUB_DEPTH / axisLen);
      var stubX = epU.x + (opp.x - epU.x) * tStub;
      var stubY = epU.y + (opp.y - epU.y) * tStub;
      _paintLine(bmp, epU.x, epU.y, stubX, stubY,
                 HOSE_STRIPE_HALFW, intensity);
      return;
    }

    if (toEdge === (fromEdge + 2) % 4) {
      // Through-pass — straight line from edge to opposite edge.
      var epA = EDGE_PT[fromEdge];
      var epB = EDGE_PT[toEdge];
      _paintLine(bmp, epA.x, epA.y, epB.x, epB.y,
                 HOSE_STRIPE_HALFW, intensity);
      return;
    }

    // 90° elbow — perpendicular edges. Two lines meeting at the center.
    // The center-pivot is geometrically indistinguishable from a quadratic
    // Bézier at this resolution (spec §3.1) and is 3× cheaper to raster.
    var ep1 = EDGE_PT[fromEdge];
    var ep2 = EDGE_PT[toEdge];
    _paintLine(bmp, ep1.x, ep1.y, CENTER_PT.x, CENTER_PT.y,
               HOSE_STRIPE_HALFW, intensity);
    _paintLine(bmp, CENTER_PT.x, CENTER_PT.y, ep2.x, ep2.y,
               HOSE_STRIPE_HALFW, intensity);
  }

  /**
   * Zero + re-rasterize a tile's bitmap from its full visit list. Called
   * lazily from getBitmap() when `dirty` is true, and eagerly on pop (when
   * a visit is removed — max-combine cannot subtract).
   */
  function _rebuildTile(tileRec) {
    var bmp = _getOrInitBmp(tileRec);
    // Fill zero — Uint8Array.fill is available everywhere we target.
    for (var i = 0; i < bmp.length; i++) bmp[i] = 0;
    var visits = tileRec.visits;
    for (var v = 0; v < visits.length; v++) {
      var visit = visits[v];
      var fromE = (visit.entryDir == null) ? -1 : visit.entryDir;
      var toE   = (visit.exitDir  == null) ? -1 : visit.exitDir;
      _paintStripe(bmp, fromE, toE, 255);
    }
    tileRec.dirty = false;
  }

  /**
   * Mark a tile record dirty so the next getBitmap() call rebuilds it.
   * Optionally bump `visitIndexAtPaint` when this tile just became the
   * current head (so the age-since-head multiplier reads 0 at the head).
   */
  function _markDirty(tileRec, newHeadVisitIndex) {
    if (!tileRec) return;
    tileRec.dirty = true;
    if (typeof newHeadVisitIndex === 'number') {
      tileRec.visitIndexAtPaint = newHeadVisitIndex;
    }
  }

  // ── Ledger mutations (internal) ────────────────────────────────

  function _seedInitialVisit(x, y, floorId) {
    var key = _tileKey(x, y);
    var rec = _getOrMakeTile(floorId, key);
    var idx = _nextVisitIndex++;
    rec.visits.push({ entryDir: null, exitDir: null, visitIndex: idx });
    rec.crossCount = rec.visits.length;
    _visitSequence.push({ floorId: floorId, tileKey: key, visitIndex: idx });
    // Rung 2C: seed tile is the (only) head; rebuild on first getBitmap().
    _markDirty(rec, idx);
    _bump();
  }

  function _appendStep(nx, ny, nfloorId) {
    // Determine move direction from previous head → new tile.
    var prev = _visitSequence.length > 0
      ? _visitSequence[_visitSequence.length - 1]
      : null;
    var moveDir = null;

    var prevRec = null;
    if (prev && prev.floorId === nfloorId) {
      var parts = prev.tileKey.split(',');
      var px = parseInt(parts[0], 10);
      var py = parseInt(parts[1], 10);
      moveDir = _deltaToDir(nx - px, ny - py);

      // Patch prev head's exitDir (it's about to stop being the head).
      if (moveDir != null) {
        prevRec = _floors[prev.floorId] && _floors[prev.floorId][prev.tileKey];
        var pIdx = _findVisitIdx(prevRec, prev.visitIndex);
        if (pIdx !== -1) prevRec.visits[pIdx].exitDir = moveDir;
      }
      // If moveDir is null here (non-adjacent on same floor — teleport, floor-
      // internal warp, etc.) leave prev.exitDir as null. The strand breaks;
      // new tile also gets entryDir=null below.
    }
    // If floor changed, both ends stay null (a strand break across floors —
    // renderers draw each floor's strand independently).

    // Create new visit record on the landing tile.
    var nkey = _tileKey(nx, ny);
    var nrec = _getOrMakeTile(nfloorId, nkey);
    var entryDir = _opposite(moveDir); // null when moveDir was null
    var idx = _nextVisitIndex++;
    nrec.visits.push({ entryDir: entryDir, exitDir: null, visitIndex: idx });
    nrec.crossCount = nrec.visits.length;
    _visitSequence.push({ floorId: nfloorId, tileKey: nkey, visitIndex: idx });

    // Rung 2C: the previous head tile's shape just changed (its open-ended
    // head stub resolved into either a straight, elbow, or U-turn as its
    // exitDir got patched). Mark it dirty so the next getBitmap() rebuilds.
    // The new head tile is also dirty (fresh visit) and takes the current
    // monotonic index so age-since-head reads 0 at the head.
    if (prevRec) _markDirty(prevRec);
    _markDirty(nrec, idx);
    _bump();
  }

  function _popLast() {
    if (_visitSequence.length === 0) return;
    var last = _visitSequence.pop();

    // Remove the popped visit from its tile.
    var rec = _floors[last.floorId] && _floors[last.floorId][last.tileKey];
    if (rec) {
      var vIdx = _findVisitIdx(rec, last.visitIndex);
      if (vIdx !== -1) rec.visits.splice(vIdx, 1);
      rec.crossCount = rec.visits.length;
      // Rung 2C: if the tile still carries earlier visits (crossed tile),
      // the remaining stripe(s) need re-rastering because max-combine
      // cannot subtract the popped shape. If visits hit 0, the tile gets
      // dropped below — its bmp goes with it.
      if (rec.visits.length > 0) _markDirty(rec);
      _dropEmptyTile(last.floorId, last.tileKey);
    }

    // The visit that was one step earlier chronologically is now the head.
    // It had its exitDir set (pointing toward the just-popped tile); null it,
    // because the head represents "we're standing on it, we haven't left yet."
    if (_visitSequence.length > 0) {
      var head = _visitSequence[_visitSequence.length - 1];
      var headRec = _floors[head.floorId] && _floors[head.floorId][head.tileKey];
      var hIdx = _findVisitIdx(headRec, head.visitIndex);
      if (hIdx !== -1) headRec.visits[hIdx].exitDir = null;
      // Rung 2C: the new head tile's shape reverts from
      // straight/elbow back to a head stub. Rebuild on next sample, and
      // retake the current head visit index so the pulse lands on it.
      _markDirty(headRec, head.visitIndex);
    }
    _bump();
  }

  function _clear() {
    _floors = Object.create(null);
    _visitSequence.length = 0;
    _nextVisitIndex = 0;
    _bump();
  }

  // ── HoseState event wiring ─────────────────────────────────────

  function _onAttach(/* buildingId, originFloorId */) {
    // Wipe and reseed from HoseState's current path — at attach time, the
    // path is [{startX, startY, currentFloorId}] (single entry).
    _clear();
    if (typeof HoseState === 'undefined') return;
    var path = HoseState.getPath();
    if (path && path.length > 0) {
      _seedInitialVisit(path[0].x, path[0].y, path[0].floorId);
    }
  }

  function _onStep(stepData /* , pathLength */) {
    if (!stepData) return;
    _appendStep(stepData.x, stepData.y, stepData.floorId);
  }

  function _onPop(/* poppedEntry, newPathLength */) {
    _popLast();
  }

  function _onDetach(/* reason */) {
    // Intentionally NO-OP. Mirrors HoseState's _path policy: data stays
    // intact until the next attach() so HoseReel / overlay / decal consumers
    // can play out their retract animations.
  }

  var _wired = false;
  function _wireHoseState() {
    if (_wired) return;
    if (typeof HoseState === 'undefined') return;
    HoseState.on('attach', _onAttach);
    HoseState.on('step',   _onStep);
    HoseState.on('pop',    _onPop);
    HoseState.on('detach', _onDetach);
    _wired = true;
  }

  // Wire at module load. If HoseState happens not to be defined yet (load-
  // order oddity), callers can re-invoke via HoseDecal._wireHoseState().
  _wireHoseState();

  // ── Public queries ─────────────────────────────────────────────

  /**
   * Return the tile record at (x, y) on floorId, or null if the hose has
   * never touched that tile. Returned object is the LIVE record — treat as
   * read-only; consumers must not mutate visits / crossCount.
   */
  function getVisitsAt(x, y, floorId) {
    var floor = _floors[floorId];
    if (!floor) return null;
    var rec = floor[_tileKey(x, y)];
    return rec || null;
  }

  /**
   * O(1): true iff the tile has >= 2 visits (hose crosses itself there).
   */
  function isCrossed(x, y, floorId) {
    var rec = getVisitsAt(x, y, floorId);
    return !!(rec && rec.crossCount >= 2);
  }

  /**
   * Iterate every tile record on a given floor.
   *   cb(x, y, tileRecord) — return false from cb to stop early.
   */
  function iterateFloorVisits(floorId, cb) {
    var floor = _floors[floorId];
    if (!floor || typeof cb !== 'function') return;
    for (var key in floor) {
      if (!Object.prototype.hasOwnProperty.call(floor, key)) continue;
      var parts = key.split(',');
      var x = parseInt(parts[0], 10);
      var y = parseInt(parts[1], 10);
      if (cb(x, y, floor[key]) === false) return;
    }
  }

  /**
   * Current head of the hose — the tile the player is standing on.
   * Returns { floorId, x, y, visitIndex } or null if ledger is empty.
   */
  function getHead() {
    if (_visitSequence.length === 0) return null;
    var h = _visitSequence[_visitSequence.length - 1];
    var parts = h.tileKey.split(',');
    return {
      floorId: h.floorId,
      x: parseInt(parts[0], 10),
      y: parseInt(parts[1], 10),
      visitIndex: h.visitIndex
    };
  }

  /**
   * Number of tiles touched on the given floor (unique cells).
   * O(n) scan — floor tile counts are in the low hundreds so this is cheap.
   */
  function getTileCount(floorId) {
    var floor = _floors[floorId];
    if (!floor) return 0;
    var n = 0;
    for (var k in floor) {
      if (Object.prototype.hasOwnProperty.call(floor, k)) n++;
    }
    return n;
  }

  /** Bumped on every mutation — cache invalidation key for renderers. */
  function getVersion() { return _version; }

  /**
   * Drop ledger entries for a single floor (e.g. if FloorManager regenerates
   * a level mid-session). Does not touch other floors.
   */
  function clearFloor(floorId) {
    if (!_floors[floorId]) return;
    delete _floors[floorId];
    // Also drop sequence entries for that floor. Rare path, O(n).
    var rebuilt = [];
    for (var i = 0; i < _visitSequence.length; i++) {
      if (_visitSequence[i].floorId !== floorId) rebuilt.push(_visitSequence[i]);
    }
    _visitSequence = rebuilt;
    _bump();
  }

  /**
   * Rebuild the entire ledger from HoseState.getPath(). Use after a state
   * reset, a missed event, or save-load restoration.
   */
  function rebuildFromState() {
    _clear();
    if (typeof HoseState === 'undefined') return;
    var path = HoseState.getPath();
    if (!path || path.length === 0) return;
    _seedInitialVisit(path[0].x, path[0].y, path[0].floorId);
    for (var i = 1; i < path.length; i++) {
      _appendStep(path[i].x, path[i].y, path[i].floorId);
    }
  }

  // ── Rung 2C public queries ─────────────────────────────────────

  /**
   * Return the rasterized decal bitmap for a single tile, rebuilding lazily
   * if the ledger has mutated since the last paint. Consumers (primarily
   * RaycasterFloor) are expected to check visitIndexAtPaint against the
   * per-frame head visit index to drive the head-pulse tint, and against
   * a global age baseline to drive the desaturation-over-time falloff.
   *
   * Returns null if the tile has no visits (no hose ever touched it), OR
   * if `_RUNG_2C_RENDER` is false (A/B perf harness disables the render).
   *
   * Returned object is the LIVE bmp reference — treat as READ-ONLY. Callers
   * must not mutate the data. Layout: interleaved (coverage, intensity) per
   * subcell, row-major, HOSE_RES × HOSE_RES × 2 bytes total.
   */
  function getBitmap(floorId, x, y) {
    if (!_RUNG_2C_RENDER) return null;
    var floor = _floors[floorId];
    if (!floor) return null;
    var rec = floor[_tileKey(x, y)];
    if (!rec || rec.visits.length === 0) return null;
    if (rec.dirty || rec.bmp === null) _rebuildTile(rec);
    return {
      data:              rec.bmp,
      visitIndexAtPaint: rec.visitIndexAtPaint,
      crossCount:        rec.crossCount
    };
  }

  /**
   * Current head visit index on a given floor, or -1 if the head is either
   * empty or on another floor. Callers use this to drive the head-pulse
   * tint (the tile whose visitIndexAtPaint matches the head gets the
   * brighter HOSE_HEAD_* color rather than the stripe-body HOSE_* color).
   *
   * O(1) — reads the tail of _visitSequence.
   */
  function getHeadVisitIndex(floorId) {
    if (_visitSequence.length === 0) return -1;
    var h = _visitSequence[_visitSequence.length - 1];
    if (h.floorId !== floorId) return -1;
    return h.visitIndex;
  }

  // ── Debug / test ───────────────────────────────────────────────

  function debugSnapshot() {
    var floorIds = [];
    for (var k in _floors) {
      if (Object.prototype.hasOwnProperty.call(_floors, k)) floorIds.push(k);
    }
    return {
      version:        _version,
      floors:         floorIds,
      sequenceLength: _visitSequence.length,
      nextVisitIndex: _nextVisitIndex,
      head:           getHead()
    };
  }

  /** Harness-only hard reset. Does not unwire listeners. */
  function reset() { _clear(); }

  // ── Public API ─────────────────────────────────────────────────

  return Object.freeze({
    // Direction constants (re-exported so consumers don't re-declare)
    DIR_EAST:  DIR_EAST,
    DIR_SOUTH: DIR_SOUTH,
    DIR_WEST:  DIR_WEST,
    DIR_NORTH: DIR_NORTH,

    // Rung 2C raster constants (exposed for tests + floor sampler)
    HOSE_RES:          HOSE_RES,
    HOSE_STRIPE_HALFW: HOSE_STRIPE_HALFW,
    HOSE_STUB_DEPTH:   HOSE_STUB_DEPTH,

    // Queries
    getVisitsAt:        getVisitsAt,
    isCrossed:          isCrossed,
    iterateFloorVisits: iterateFloorVisits,
    getHead:            getHead,
    getTileCount:       getTileCount,
    getVersion:         getVersion,

    // Rung 2C queries (per-tile decal bitmaps + head tracking)
    getBitmap:          getBitmap,
    getHeadVisitIndex:  getHeadVisitIndex,

    // Rung 2C feature flag (A/B perf harness toggles this)
    get _RUNG_2C_RENDER() { return _RUNG_2C_RENDER; },
    set _RUNG_2C_RENDER(v) { _RUNG_2C_RENDER = !!v; },

    // Lifecycle / recovery
    rebuildFromState:   rebuildFromState,
    clearFloor:         clearFloor,

    // Debug / test
    debugSnapshot:      debugSnapshot,
    reset:              reset,
    _wireHoseState:     _wireHoseState   // late-binding recovery hook
  });
})();

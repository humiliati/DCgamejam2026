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
    if (!rec) { rec = floor[key] = { visits: [], crossCount: 0 }; }
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

  // ── Ledger mutations (internal) ────────────────────────────────

  function _seedInitialVisit(x, y, floorId) {
    var key = _tileKey(x, y);
    var rec = _getOrMakeTile(floorId, key);
    var idx = _nextVisitIndex++;
    rec.visits.push({ entryDir: null, exitDir: null, visitIndex: idx });
    rec.crossCount = rec.visits.length;
    _visitSequence.push({ floorId: floorId, tileKey: key, visitIndex: idx });
    _bump();
  }

  function _appendStep(nx, ny, nfloorId) {
    // Determine move direction from previous head → new tile.
    var prev = _visitSequence.length > 0
      ? _visitSequence[_visitSequence.length - 1]
      : null;
    var moveDir = null;

    if (prev && prev.floorId === nfloorId) {
      var parts = prev.tileKey.split(',');
      var px = parseInt(parts[0], 10);
      var py = parseInt(parts[1], 10);
      moveDir = _deltaToDir(nx - px, ny - py);

      // Patch prev head's exitDir (it's about to stop being the head).
      if (moveDir != null) {
        var prevRec = _floors[prev.floorId] && _floors[prev.floorId][prev.tileKey];
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

    // Queries
    getVisitsAt:        getVisitsAt,
    isCrossed:          isCrossed,
    iterateFloorVisits: iterateFloorVisits,
    getHead:            getHead,
    getTileCount:       getTileCount,
    getVersion:         getVersion,

    // Lifecycle / recovery
    rebuildFromState:   rebuildFromState,
    clearFloor:         clearFloor,

    // Debug / test
    debugSnapshot:      debugSnapshot,
    reset:              reset,
    _wireHoseState:     _wireHoseState   // late-binding recovery hook
  });
})();

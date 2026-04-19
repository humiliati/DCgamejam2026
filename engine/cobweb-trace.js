/**
 * CobwebTrace — install minigame for cobweb barrier-web (Phase 4.7).
 *
 * Replaces the instant F-press install with a multi-click/multi-drag tracing
 * minigame. 3–6 lime nodes are painted across the corridor plane; the player
 * connects them in a variant-specific pattern before the web resolves and the
 * full barrier web plays through the Phase 4.6 draw-in animation.
 *
 * Inspired by (and ported from) EyesOnly's ConstellationTracer splash-screen
 * minigame. Adapted for the cobweb install flow with six variant prescriptions.
 *
 * ── State machine ──────────────────────────────────────────────────────
 *   idle        : no session active.
 *   highlighting: cursor is hovering a candidate node — dwell fills a ring.
 *   hasNode     : one or more nodes committed; cursor tethered to last node.
 *   tethered    : same as hasNode (internal alias during live tether).
 *   resolve     : validation passed or failed; animation plays; session ends.
 *
 * ── Validation modes (per-variant) ─────────────────────────────────────
 *   shape : visit all authored nodes (order-agnostic) then close the loop
 *           back to the first-visited node.  {classic, tangled_shape, sheet}
 *   euler : traverse every authored edge exactly once (order-agnostic).
 *           {funnel, tangled_euler}
 *   exact : visit every node at least once (order-agnostic, no closure).
 *           {corner_br, hammock}
 *
 * ── Public API ─────────────────────────────────────────────────────────
 *   beginSession(opts)      : opts = { floorId, tileX, tileY, corridorDir,
 *                                      variantId, onResolve(success,forced) }
 *   endSession(success)     : tear down session; fires onResolve if set.
 *   isActive()              : bool — session is live.
 *   updateCursor(x, y)      : pointer position in canvas coords.
 *   handleKey(key)          : consume arrow/enter/escape during session.
 *   handlePointerClick()    : consume left-click (grab/drop).
 *   handlePointerMove(x,y)  : alias for updateCursor.
 *   update(frameDt)         : tick; advances dwell/reject/resolve anim.
 *   render(ctx, w, h)       : draw overlay.
 *   getState()              : debug — returns { state, path, rejects, ... }.
 *
 * ── Layer ──────────────────────────────────────────────────────────────
 *   Layer 2 — depends on: InputManager, AudioSystem (soft), Toast (soft),
 *             MinigameExit (soft — for Escape handling via the shared chrome).
 *   CobwebNode (Layer 3) calls beginSession; Game (Layer 4) drives update/render.
 */
var CobwebTrace = (function () {
  'use strict';

  // ── Config / tunables ──────────────────────────────────────────────
  var HIT_RADIUS           = 48;    // px — click/hover hit-test radius
  var SNAP_RADIUS          = 32;    // px — auto-snap cursor when near node
  var HIGHLIGHT_DWELL      = 8;     // frames dwell before hover-pickup
  var REJECT_FLASH_FRAMES  = 20;    // frames to show red flash on invalid move
  var RESOLVE_ANIM_FRAMES  = 30;    // frames for resolve fade
  var MAX_REJECTS          = 3;     // rejections before force-fail (→ tangled)
  var ENTRY_GRACE_MS       = 250;   // ignore clicks for this long after begin

  var KBD_CURSOR_STEP      = 14;    // px per keyboard nudge
  var KBD_CURSOR_DIAG      = 10;    // px for diagonal keys (≈ step / √2)

  // Region on screen where nodes are laid out (normalized coords multiply by
  // this region size, not the whole viewport — keeps trace area compact).
  var REGION_FRACTION_W    = 0.55;   // trace region is 55% viewport width
  var REGION_FRACTION_H    = 0.55;   // trace region is 55% viewport height

  // ── Colors ─────────────────────────────────────────────────────────
  var COL_BG_VIGNETTE      = 'rgba(4,6,10,0.55)';   // dim surrounding viewport
  var COL_NODE             = '#c6ff6b';             // lime
  var COL_NODE_PULSE       = '#eaffae';             // bright lime for pulse
  var COL_NODE_HOVER_RING  = 'rgba(198,255,107,0.45)';
  var COL_NODE_COMMITTED   = '#ffffff';             // committed/visited ring
  var COL_EDGE_LOCKED      = 'rgba(220,245,255,0.85)'; // silk highlight
  var COL_EDGE_LOCKED_CORE = '#ffffff';
  var COL_TETHER_PREV      = 'rgba(198,255,107,0.55)'; // dashed preview
  var COL_SNAP_RING        = 'rgba(255,255,255,0.75)';
  var COL_REJECT           = '#ff4060';
  var COL_RESOLVE_GHOST    = 'rgba(220,245,255,0.35)';

  // ── Per-variant specs (normalized 0..1 coords inside the trace region) ─
  // mode decides validation:
  //   'shape' — visit every authored node at least once, then close back
  //             to the first-visited node (closure required).
  //   'euler' — traverse every authored edge exactly once (no closure).
  //   'exact' — visit every node at least once (no edges, no closure).
  //
  // Each variant from cobweb-renderer's dispatch gets a spec entry. Unknown
  // variants fall back to VARIANT_SPECS.classic.
  var VARIANT_SPECS = {
    // ── classic : closed cycle of 4 corner nodes ──
    classic: {
      mode: 'shape',
      nodes: [
        { x: 0.15, y: 0.20 },
        { x: 0.85, y: 0.20 },
        { x: 0.85, y: 0.80 },
        { x: 0.15, y: 0.80 }
      ],
      edges: []
    },

    // ── corner_br : exact — spider reaches from SE corner to all 4 nodes ──
    corner_br: {
      mode: 'exact',
      nodes: [
        { x: 0.85, y: 0.85 },   // anchor corner
        { x: 0.50, y: 0.55 },
        { x: 0.25, y: 0.30 },
        { x: 0.70, y: 0.20 }
      ],
      edges: []
    },

    // ── funnel : euler — two diagonals across 4 nodes (an X) ──
    funnel: {
      mode: 'euler',
      nodes: [
        { x: 0.18, y: 0.22 },   // TL
        { x: 0.82, y: 0.22 },   // TR
        { x: 0.18, y: 0.78 },   // BL
        { x: 0.82, y: 0.78 }    // BR
      ],
      edges: [ [0, 3], [1, 2] ]   // TL–BR and TR–BL (the X)
    },

    // ── tangled : euler — two overlapping quads, every edge exactly once ──
    tangled: {
      mode: 'euler',
      nodes: [
        { x: 0.20, y: 0.30 },
        { x: 0.50, y: 0.15 },
        { x: 0.80, y: 0.30 },
        { x: 0.80, y: 0.75 },
        { x: 0.20, y: 0.75 }
      ],
      // outer pentagon + crossings — 7 edges total, eulerian path exists
      // (every node has even degree? let's audit:
      //   0: edges to 1, 4, 2 → degree 3
      //   1: edges to 0, 2, 3 → degree 3
      //   2: edges to 1, 3, 0 → degree 3
      //   3: edges to 2, 4, 1 → degree 3
      //   4: edges to 3, 0    → degree 2
      // 4 odd-degree nodes → no Eulerian path/circuit.
      // Trim to a valid Eulerian trail: need exactly 0 or 2 odd-degree.
      // Keep: 0-1, 1-2, 2-3, 3-4, 4-0, 1-3 (outer + one crossing)
      //   0: 1, 4       → 2
      //   1: 0, 2, 3    → 3
      //   2: 1, 3       → 2
      //   3: 2, 4, 1    → 3
      //   4: 3, 0       → 2
      // 2 odd-degree (1 and 3) → Eulerian trail exists from 1 to 3.
      edges: [ [0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 3] ]
    },

    // ── hammock : exact — left-anchor → mids → right-anchor ──
    hammock: {
      mode: 'exact',
      nodes: [
        { x: 0.12, y: 0.50 },   // left anchor
        { x: 0.35, y: 0.42 },
        { x: 0.55, y: 0.58 },
        { x: 0.75, y: 0.42 },
        { x: 0.92, y: 0.50 }    // right anchor
      ],
      edges: []
    },

    // ── sheet : shape — horizontal zig-zag through 6 nodes ──
    sheet: {
      mode: 'shape',
      nodes: [
        { x: 0.15, y: 0.30 },
        { x: 0.42, y: 0.30 },
        { x: 0.70, y: 0.30 },
        { x: 0.90, y: 0.45 },
        { x: 0.55, y: 0.70 },
        { x: 0.15, y: 0.70 }
      ],
      edges: []
    }
  };

  // ── Module state ───────────────────────────────────────────────────
  // _state ∈ { 'idle', 'highlighting', 'hasNode', 'tethered', 'resolve' }.
  var _state = 'idle';

  // Active session payload (set in beginSession, cleared in endSession).
  // _session = {
  //   floorId, tileX, tileY, corridorDir, variantId,
  //   spec,             // VARIANT_SPECS entry (clone with pixel coords)
  //   nodes,            // [{nx,ny,px,py}], pixel coords resolved each layout
  //   edges,            // [[a,b]] authored edges (euler mode)
  //   path,             // [nodeIdx,...] visited order
  //   pathEdges,        // [[a,b]] set of edges already traversed (euler)
  //   startMs,          // Date.now() at beginSession
  //   rejects,          // count of rejected attempts so far
  //   onResolve,        // callback(success:bool, forcedVariantId:string|null)
  // }
  var _session = null;

  // Cursor (canvas px).
  var _cursor = { x: 0, y: 0, active: false };

  // Hover/dwell tracking.
  var _highlightIdx = -1;
  var _highlightFrames = 0;

  // Reject flash (frames remaining).
  var _rejectFrames = 0;
  var _rejectNodeIdx = -1;     // which node flashed, or -1 for tether-only

  // Resolve animation.
  var _resolveFrames = 0;
  var _resolveSuccess = false;

  // Track whether we're actively tethering (left-click held OR keyboard-grab).
  var _tethering = false;

  // Layout cache — recomputed every render when viewport size changes.
  var _lastW = 0;
  var _lastH = 0;
  var _regionX = 0;
  var _regionY = 0;
  var _regionW = 0;
  var _regionH = 0;

  // ── Helpers ────────────────────────────────────────────────────────

  function _getSpec(variantId) {
    var s = VARIANT_SPECS[variantId];
    return s || VARIANT_SPECS.classic;
  }

  function _computeLayout(w, h) {
    if (w === _lastW && h === _lastH && _session && _session.nodes.length) return;
    _regionW = Math.floor(w * REGION_FRACTION_W);
    _regionH = Math.floor(h * REGION_FRACTION_H);
    _regionX = Math.floor((w - _regionW) * 0.5);
    _regionY = Math.floor((h - _regionH) * 0.5);
    if (_session) {
      for (var i = 0; i < _session.nodes.length; i++) {
        var n = _session.nodes[i];
        n.px = _regionX + n.nx * _regionW;
        n.py = _regionY + n.ny * _regionH;
      }
    }
    // Keyboard-only bootstrap: if the cursor was never positioned (sentinel
    // -1,-1), plant it in the center of the trace region on first render.
    if (_cursor.x < 0 || _cursor.y < 0) {
      _cursor.x = _regionX + _regionW * 0.5;
      _cursor.y = _regionY + _regionH * 0.5;
      _cursor.active = true;
    }
    _lastW = w; _lastH = h;
  }

  function _dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function _nearestNode(x, y, maxD) {
    if (!_session) return -1;
    var nodes = _session.nodes;
    var best = -1, bestD = maxD;
    for (var i = 0; i < nodes.length; i++) {
      var d = _dist(x, y, nodes[i].px, nodes[i].py);
      if (d <= bestD) { best = i; bestD = d; }
    }
    return best;
  }

  function _edgeKey(a, b) {
    // Undirected edge — canonicalize low→high.
    return (a < b) ? (a + '-' + b) : (b + '-' + a);
  }

  function _authoredEdgeSet() {
    if (!_session) return {};
    var out = {};
    for (var i = 0; i < _session.edges.length; i++) {
      var e = _session.edges[i];
      out[_edgeKey(e[0], e[1])] = true;
    }
    return out;
  }

  function _playSfx(name) {
    if (typeof AudioSystem !== 'undefined' && AudioSystem.play) {
      try { AudioSystem.play(name); } catch (_e) { /* optional sfx */ }
    }
  }

  // ── Validation ─────────────────────────────────────────────────────

  /**
   * Given the current path, decide whether the trace is complete.
   * Returns 'success' | 'pending' | null (path empty).
   * For 'shape' mode, success requires all nodes visited + closure back to
   * path[0]. 'exact' requires every node visited once. 'euler' requires every
   * authored edge traversed exactly once.
   */
  function _evaluateProgress() {
    if (!_session || _session.path.length === 0) return null;
    var mode = _session.spec.mode;
    var nodes = _session.nodes;
    var path = _session.path;

    if (mode === 'exact') {
      // All nodes visited?
      var visited = {};
      for (var i = 0; i < path.length; i++) visited[path[i]] = true;
      var hit = 0;
      for (var k = 0; k < nodes.length; k++) if (visited[k]) hit++;
      return (hit === nodes.length) ? 'success' : 'pending';
    }

    if (mode === 'shape') {
      // All nodes visited AND closure edge present (last node == path[0] reachable).
      var seen = {};
      for (var j = 0; j < path.length; j++) seen[path[j]] = true;
      var count = 0;
      for (var kk = 0; kk < nodes.length; kk++) if (seen[kk]) count++;
      if (count < nodes.length) return 'pending';
      // Closure: need at least 3 unique nodes and final-to-first connection.
      if (count < 3) return 'pending';
      // The closure is recorded as a repeat of path[0] at end OR the tether
      // is currently dropped onto path[0]. We treat completing-back-to-first
      // as the "return to start" move. See _commitNode.
      if (path.length >= 2 && path[path.length - 1] === path[0]) return 'success';
      return 'pending';
    }

    if (mode === 'euler') {
      // Every authored edge traversed exactly once.
      var authored = _authoredEdgeSet();
      var authoredCount = 0;
      for (var ek in authored) if (Object.prototype.hasOwnProperty.call(authored, ek)) authoredCount++;
      var traversed = _session.pathEdges;
      var tCount = 0;
      for (var tk in traversed) if (Object.prototype.hasOwnProperty.call(traversed, tk)) tCount++;
      if (tCount !== authoredCount) return 'pending';
      // Ensure the traversed set exactly matches authored.
      for (var a in authored) {
        if (!traversed[a]) return 'pending';
      }
      return 'success';
    }

    return 'pending';
  }

  /**
   * Is the move from lastNode → targetNode valid?
   * - 'exact' : always valid (we just track visits).
   * - 'shape' : valid if targetNode has not been visited yet, OR target ==
   *             path[0] AND all other nodes have been visited (closure move).
   * - 'euler' : valid if the edge (lastNode, targetNode) is authored AND has
   *             not been traversed yet.
   * Returns true/false.
   */
  function _isValidMove(lastNodeIdx, targetNodeIdx) {
    if (!_session) return false;
    if (lastNodeIdx === targetNodeIdx) return false;
    var mode = _session.spec.mode;

    if (mode === 'exact') {
      return true;   // any move lands us on a node; revisits are ignored.
    }

    if (mode === 'shape') {
      var path = _session.path;
      // Revisit not allowed EXCEPT closure: target == path[0] and every other
      // node is already visited.
      var visited = {};
      for (var i = 0; i < path.length; i++) visited[path[i]] = true;
      if (!visited[targetNodeIdx]) return true;    // first visit, fine
      if (targetNodeIdx !== path[0]) return false; // mid-path revisit, reject
      // closure candidate — must have all other nodes visited:
      for (var k = 0; k < _session.nodes.length; k++) {
        if (!visited[k]) return false;
      }
      return true;
    }

    if (mode === 'euler') {
      var authored = _authoredEdgeSet();
      var ek = _edgeKey(lastNodeIdx, targetNodeIdx);
      if (!authored[ek]) return false;
      if (_session.pathEdges[ek]) return false;
      return true;
    }

    return false;
  }

  // ── Session mutators ───────────────────────────────────────────────

  function _commitNode(nodeIdx) {
    var s = _session;
    if (!s) return;
    var lastNode = s.path.length > 0 ? s.path[s.path.length - 1] : -1;

    if (lastNode < 0) {
      // First node — always free.
      s.path.push(nodeIdx);
      _state = 'hasNode';
      _playSfx('cobweb_trace_lock');
      return;
    }

    if (!_isValidMove(lastNode, nodeIdx)) {
      // Reject — red flash on target, no progress loss.
      _rejectFrames = REJECT_FLASH_FRAMES;
      _rejectNodeIdx = nodeIdx;
      s.rejects++;
      _playSfx('cobweb_trace_reject');
      if (s.rejects >= MAX_REJECTS) {
        // Force-fail: end session with forced tangled variant.
        _beginResolve(false);
      }
      return;
    }

    // Valid move — commit.
    var ek = _edgeKey(lastNode, nodeIdx);
    s.pathEdges[ek] = true;
    s.path.push(nodeIdx);
    _state = 'hasNode';
    _playSfx('cobweb_trace_lock');

    // Check completion.
    var progress = _evaluateProgress();
    if (progress === 'success') {
      _beginResolve(true);
    }
  }

  function _beginResolve(success) {
    _state = 'resolve';
    _resolveFrames = RESOLVE_ANIM_FRAMES;
    _resolveSuccess = success;
    _tethering = false;
    _playSfx(success ? 'cobweb_trace_resolve' : 'cobweb_trace_fail');
  }

  function _finishResolve() {
    var s = _session;
    if (!s) { _state = 'idle'; return; }
    var cb = s.onResolve;
    var forcedVariant = _resolveSuccess ? null : 'tangled';
    var cleanFirstTry = _resolveSuccess && (s.rejects === 0);
    _session = null;
    _state = 'idle';
    _highlightIdx = -1;
    _highlightFrames = 0;
    _rejectFrames = 0;
    _rejectNodeIdx = -1;
    _resolveFrames = 0;
    _tethering = false;
    if (typeof cb === 'function') {
      try { cb(_resolveSuccess, forcedVariant, cleanFirstTry); }
      catch (err) { console.error('[CobwebTrace] onResolve threw:', err); }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Start a new trace session. Idempotent if already active — returns false
   * without clobbering the existing session.
   *
   * opts = {
   *   floorId, tileX, tileY, corridorDir,
   *   variantId,                // one of VARIANT_SPECS keys
   *   onResolve(success, forcedVariantId, cleanFirstTry)
   *                             // forcedVariantId = 'tangled' on fail, null on success
   * }
   */
  function beginSession(opts) {
    if (_state !== 'idle') {
      console.warn('[CobwebTrace] beginSession called while active');
      return false;
    }
    opts = opts || {};
    var spec = _getSpec(opts.variantId || 'classic');
    // Clone the spec nodes into our session format with pixel slots.
    var nodes = [];
    for (var i = 0; i < spec.nodes.length; i++) {
      nodes.push({
        nx: spec.nodes[i].x,
        ny: spec.nodes[i].y,
        px: 0,
        py: 0
      });
    }
    _session = {
      floorId:     opts.floorId,
      tileX:       opts.tileX,
      tileY:       opts.tileY,
      corridorDir: opts.corridorDir,
      variantId:   opts.variantId || 'classic',
      spec:        spec,
      nodes:       nodes,
      edges:       spec.edges.slice(),   // copy so caller can't mutate
      path:        [],
      pathEdges:   {},
      startMs:     Date.now(),
      rejects:     0,
      onResolve:   opts.onResolve || null
    };
    _state = 'highlighting';
    _highlightIdx = -1;
    _highlightFrames = 0;
    _rejectFrames = 0;
    _rejectNodeIdx = -1;
    _resolveFrames = 0;
    _tethering = false;
    _lastW = 0; _lastH = 0;   // force layout recompute next render
    // Default cursor to whatever the pointer last reported; if it's never
    // been active (webOS-only keyboard players), a 0,0 cursor is useless,
    // so bump it to a sentinel that the first render() centers for us.
    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var p0 = InputManager.getPointer();
      if (p0 && p0.active) {
        _cursor.x = p0.x; _cursor.y = p0.y; _cursor.active = true;
      } else {
        _cursor.x = -1; _cursor.y = -1; _cursor.active = false;
      }
    }
    _playSfx('cobweb_trace_begin');
    return true;
  }

  /**
   * Bail out of the current session. Fires onResolve(false, 'tangled').
   */
  function endSession(force) {
    if (_state === 'idle') return;
    if (force) {
      _resolveSuccess = false;
      _finishResolve();
    } else {
      _beginResolve(false);
    }
  }

  function isActive() { return _state !== 'idle'; }

  function updateCursor(x, y) {
    _cursor.x = x;
    _cursor.y = y;
    _cursor.active = true;
  }

  function handlePointerMove(x, y) { updateCursor(x, y); }

  /**
   * Consume a pointer click during an active session. Returns true if the
   * click was consumed (so the caller should skip its own handler).
   */
  function handlePointerClick() {
    if (!isActive()) return false;
    if (_state === 'resolve') return true;  // swallow clicks during resolve
    if (!_session) return false;
    // Entry grace.
    if ((Date.now() - _session.startMs) < ENTRY_GRACE_MS) return true;

    var idx = _nearestNode(_cursor.x, _cursor.y, HIT_RADIUS);
    if (idx < 0) {
      // Empty click — drops the tether without committing.
      _tethering = false;
      return true;
    }
    _commitNode(idx);
    _tethering = true;
    return true;
  }

  /**
   * Keyboard input. Returns true if consumed.
   * Arrow keys nudge the cursor. Enter / OK commits nearest node.
   * Escape / Backspace / GoBack / Back aborts the session.
   */
  function handleKey(key) {
    if (!isActive()) return false;
    if (_state === 'resolve') return true;
    switch (key) {
      case 'ArrowLeft':
      case 'turn_left':
      case 'strafe_left':
        _cursor.x -= KBD_CURSOR_STEP; _cursor.active = true; return true;
      case 'ArrowRight':
      case 'turn_right':
      case 'strafe_right':
        _cursor.x += KBD_CURSOR_STEP; _cursor.active = true; return true;
      case 'ArrowUp':
      case 'step_forward':
        _cursor.y -= KBD_CURSOR_STEP; _cursor.active = true; return true;
      case 'ArrowDown':
      case 'step_back':
        _cursor.y += KBD_CURSOR_STEP; _cursor.active = true; return true;
      case 'Enter':
      case ' ':
      case 'Space':
      case 'OK':
      case 'interact':
        // Commit nearest — same effect as pointer click.
        return handlePointerClick();
      case 'Escape':
      case 'Backspace':
      case 'GoBack':
      case 'Back':
      case 'pause':
        endSession(false);
        return true;
    }
    return false;
  }

  /**
   * Per-frame update. Advances dwell, reject flash, resolve anim.
   *
   * Also auto-pulls the InputManager pointer so a mouse-only player never has
   * to hit a key to move the cursor. Keyboard nudges (handleKey) still work
   * when the mouse is idle — they overwrite _cursor, and the next mouse move
   * re-syncs it. If the pointer hasn't ever moved, the cursor defaults to
   * center-screen via _computeLayout.
   */
  function update(frameDt) {
    if (!isActive()) return;

    if (typeof InputManager !== 'undefined' && InputManager.getPointer) {
      var p = InputManager.getPointer();
      if (p && p.active) {
        _cursor.x = p.x;
        _cursor.y = p.y;
        _cursor.active = true;
        // Treat the pointer being present as "tethering on" once the first
        // node is committed. Without this, a mouse player would have to
        // click-and-hold for the dashed preview to draw. Click-to-commit,
        // hover-to-preview feels right for a splash-style trace minigame.
        if (_session && _session.path.length > 0) _tethering = true;
      }
    }

    // Snap cursor to nearest node within SNAP_RADIUS for tactile feedback.
    var snapIdx = _nearestNode(_cursor.x, _cursor.y, SNAP_RADIUS);

    // Dwell-hover pickup: hovering a node for HIGHLIGHT_DWELL frames while
    // tethering auto-commits it (hands-free Magic Remote feel).
    var hoverIdx = _nearestNode(_cursor.x, _cursor.y, HIT_RADIUS);
    if (hoverIdx !== _highlightIdx) {
      _highlightIdx = hoverIdx;
      _highlightFrames = 0;
    } else if (hoverIdx >= 0) {
      _highlightFrames++;
      if (_tethering && _highlightFrames >= HIGHLIGHT_DWELL) {
        // Don't re-commit the same node we're already sitting on.
        var s = _session;
        var last = s && s.path.length > 0 ? s.path[s.path.length - 1] : -1;
        if (hoverIdx !== last) {
          _commitNode(hoverIdx);
          _highlightFrames = 0;
        }
      }
    }

    if (_rejectFrames > 0) _rejectFrames--;
    if (_state === 'resolve') {
      _resolveFrames--;
      if (_resolveFrames <= 0) _finishResolve();
    }

    // Store snap for render hint.
    _session && (_session._snapIdx = snapIdx);
  }

  /**
   * Render the overlay. ctx is the main 2D canvas. w,h are the viewport size.
   */
  function render(ctx, w, h) {
    if (!isActive()) return;
    _computeLayout(w, h);
    var s = _session;
    if (!s) return;
    var t = Date.now() / 1000;

    ctx.save();

    // Dim background (vignette) — softens the scene so overlay reads clearly.
    ctx.fillStyle = COL_BG_VIGNETTE;
    ctx.fillRect(0, 0, w, h);

    // Authored edges (euler mode only) — drawn faint so player sees the
    // required shape.
    if (s.spec.mode === 'euler') {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = COL_NODE;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      for (var e = 0; e < s.edges.length; e++) {
        var a = s.nodes[s.edges[e][0]];
        var b = s.nodes[s.edges[e][1]];
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Committed path — glowing silk segments.
    if (s.path.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      // Outer glow layer.
      ctx.strokeStyle = COL_EDGE_LOCKED;
      ctx.lineWidth = 6;
      ctx.shadowColor = COL_EDGE_LOCKED;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(s.nodes[s.path[0]].px, s.nodes[s.path[0]].py);
      for (var p = 1; p < s.path.length; p++) {
        ctx.lineTo(s.nodes[s.path[p]].px, s.nodes[s.path[p]].py);
      }
      ctx.stroke();
      // Flowing gradient core (white shimmer traveling along the path).
      ctx.strokeStyle = COL_EDGE_LOCKED_CORE;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.beginPath();
      ctx.moveTo(s.nodes[s.path[0]].px, s.nodes[s.path[0]].py);
      for (var p2 = 1; p2 < s.path.length; p2++) {
        ctx.lineTo(s.nodes[s.path[p2]].px, s.nodes[s.path[p2]].py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Active tether — dashed preview from last committed node to cursor.
    var last = s.path.length > 0 ? s.path[s.path.length - 1] : -1;
    if (_tethering && last >= 0) {
      var ln = s.nodes[last];
      ctx.save();
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = COL_TETHER_PREV;
      ctx.lineWidth = 2;
      ctx.lineDashOffset = -(t * 40) % 14;
      ctx.beginPath();
      ctx.moveTo(ln.px, ln.py);
      ctx.lineTo(_cursor.x, _cursor.y);
      ctx.stroke();
      ctx.restore();
    }

    // Nodes with pulse + dwell arc + committed-ring.
    for (var i = 0; i < s.nodes.length; i++) {
      var n = s.nodes[i];
      var visited = false;
      for (var pi = 0; pi < s.path.length; pi++) {
        if (s.path[pi] === i) { visited = true; break; }
      }

      // Pulse core.
      var pulse = 0.6 + 0.4 * Math.sin(t * 3 + i);
      var isReject = (_rejectFrames > 0 && _rejectNodeIdx === i);
      ctx.save();
      ctx.fillStyle = isReject ? COL_REJECT : (pulse > 0.85 ? COL_NODE_PULSE : COL_NODE);
      ctx.shadowColor = isReject ? COL_REJECT : COL_NODE;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(n.px, n.py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Committed-ring.
      if (visited) {
        ctx.save();
        ctx.strokeStyle = COL_NODE_COMMITTED;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n.px, n.py, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Dwell progress arc.
      if (_highlightIdx === i && _highlightFrames > 0 && !visited) {
        var progress = Math.min(1, _highlightFrames / HIGHLIGHT_DWELL);
        ctx.save();
        ctx.strokeStyle = COL_NODE_HOVER_RING;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(n.px, n.py, 16, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Snap-ring hint — around nearest node within SNAP_RADIUS.
    if (s._snapIdx !== undefined && s._snapIdx >= 0) {
      var sn = s.nodes[s._snapIdx];
      ctx.save();
      ctx.strokeStyle = COL_SNAP_RING;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(sn.px, sn.py, 22 + 2 * Math.sin(t * 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Cursor crosshair (small ring) — hidden when snapping tight.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(_cursor.x, _cursor.y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Resolve fade — white flash on success, red on fail.
    if (_state === 'resolve') {
      var pct = 1 - (_resolveFrames / RESOLVE_ANIM_FRAMES);
      ctx.save();
      ctx.globalAlpha = 0.8 * (1 - pct);
      ctx.fillStyle = _resolveSuccess ? '#e8ffb0' : '#ff6060';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Hint text near bottom.
    ctx.save();
    ctx.fillStyle = 'rgba(220,240,220,0.85)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    var hint;
    if (s.spec.mode === 'shape')      hint = 'Spin a closed web through every node';
    else if (s.spec.mode === 'euler') hint = 'Trace every dashed thread — each only once';
    else                               hint = 'Touch every node to anchor the web';
    ctx.fillText(hint, w * 0.5, _regionY + _regionH + 28);
    if (s.rejects > 0) {
      ctx.fillStyle = 'rgba(255,120,120,0.9)';
      ctx.fillText('Rejects: ' + s.rejects + ' / ' + MAX_REJECTS,
                   w * 0.5, _regionY + _regionH + 46);
    }
    ctx.restore();

    ctx.restore();
  }

  function getState() {
    return {
      state:        _state,
      active:       isActive(),
      variantId:    _session ? _session.variantId : null,
      mode:         _session ? _session.spec.mode : null,
      pathLen:      _session ? _session.path.length : 0,
      rejects:      _session ? _session.rejects : 0,
      highlightIdx: _highlightIdx,
      cursor:       { x: _cursor.x, y: _cursor.y, active: _cursor.active }
    };
  }

  // ── Public API ─────────────────────────────────────────────────────
  return {
    beginSession:       beginSession,
    endSession:         endSession,
    isActive:           isActive,
    updateCursor:       updateCursor,
    handlePointerMove:  handlePointerMove,
    handlePointerClick: handlePointerClick,
    handleKey:          handleKey,
    update:             update,
    render:             render,
    getState:           getState,
    // Exposed for tests / debug:
    VARIANT_SPECS:      VARIANT_SPECS
  };
})();

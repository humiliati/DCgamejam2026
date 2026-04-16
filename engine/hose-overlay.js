/**
 * HoseOverlay — minimap rendering of the hose body (PW-4 / Rung 2B).
 *
 * Consumes the HoseDecal per-tile visit ledger (Rung 2A) and draws each visit
 * as an edge-midpoint stripe on the minimap. Adjacent tiles join seamlessly
 * because both sides meet at the shared edge midpoint.
 *
 * Per-visit rendering cases (given visit.entryDir / visit.exitDir):
 *   - Both null               → solitary seed dot at tile center (origin with
 *                                no movement yet, or floor-transition landing).
 *   - entry=null, exit=d      → tail stub: center → exit-edge midpoint.
 *                                (Hose origin on this floor before first step.)
 *   - entry=d, exit=null      → head stub: entry-edge midpoint → center,
 *                                with pulsing cyan glow overlay.
 *   - entry=d, exit=opposite  → straight line: entry-mid → exit-mid.
 *                                (Through-pass; adjacent cells frame a line.)
 *   - entry=d, exit=d+1|d+3   → 90° quadratic Bézier with control at center.
 *                                (Elbow; control pulls the curve inward.)
 *   - entry=d, exit=d         → U-turn: cubic Bézier self-loop pushing
 *                                inward toward opposite edge, splayed
 *                                laterally along the perpendicular axis.
 *
 * Crossed tiles (crossCount >= 2) additionally receive a cyan X mark on top
 * of the stacked stripes. Retraction via HoseReel → HoseState.popLastStep()
 * updates the ledger automatically, so the overlay redraws without that
 * visit on the next frame.
 *
 * Called by Minimap.render() after MinimapNav overlay, so the hose draws
 * on top of the nav path dots. Same setRenderParams / drawOverlay pattern.
 *
 * Layer 2 — depends on: HoseState (soft), HoseDecal (soft), HoseReel (soft)
 */
var HoseOverlay = (function () {
  'use strict';

  // ── Direction constants (match HoseDecal / CLAUDE.md) ───────────
  var DIR_EAST  = 0;
  var DIR_SOUTH = 1;
  var DIR_WEST  = 2;
  var DIR_NORTH = 3;

  // ── Colors ──────────────────────────────────────────────────────
  var HOSE_COLOR       = 'rgba(80,220,120,0.80)';   // green line, stripes
  var HOSE_COLOR_REEL  = 'rgba(80,220,120,0.40)';   // dimmer during reel
  var CROSS_COLOR      = 'rgba(80,200,255,0.85)';   // cyan X on crossings
  var ORIGIN_COLOR     = 'rgba(255,200,40,0.85)';   // yellow origin (truck)
  var HEAD_HALO_BASE   = [80, 255, 180];            // cyan-green head pulse
  var HOSE_WIDTH_UNITS = 2;                          // baseline stroke width

  // ── Render params (synced from Minimap each frame) ──────────────
  var _tileSize = 0;
  var _offsetX  = 0;
  var _offsetY  = 0;

  function setRenderParams(tileSize, offsetX, offsetY) {
    _tileSize = tileSize;
    _offsetX  = offsetX;
    _offsetY  = offsetY;
  }

  // ── Direction helpers ───────────────────────────────────────────

  // Edge midpoint in tile-local coordinates (origin = tile top-left).
  // Returns null for null/invalid dir so the caller can branch.
  function _edgeMidpoint(dir, T) {
    if (dir === DIR_EAST)  return { x: T,       y: T * 0.5 };
    if (dir === DIR_SOUTH) return { x: T * 0.5, y: T       };
    if (dir === DIR_WEST)  return { x: 0,       y: T * 0.5 };
    if (dir === DIR_NORTH) return { x: T * 0.5, y: 0       };
    return null;
  }

  function _opposite(d) {
    if (d == null) return null;
    return (d + 2) % 4;
  }

  // ── Per-visit drawing ───────────────────────────────────────────

  function _drawStraight(ctx, ox, oy, T, entryDir, exitDir) {
    var e = _edgeMidpoint(entryDir, T);
    var x = _edgeMidpoint(exitDir,  T);
    ctx.beginPath();
    ctx.moveTo(ox + e.x, oy + e.y);
    ctx.lineTo(ox + x.x, oy + x.y);
    ctx.stroke();
  }

  function _drawElbow(ctx, ox, oy, T, entryDir, exitDir) {
    // Quadratic Bézier with control point at tile center. This pulls the
    // curve inward from the corner formed by entry and exit edges, giving
    // a smooth 90° turn instead of a corner point.
    var e = _edgeMidpoint(entryDir, T);
    var x = _edgeMidpoint(exitDir,  T);
    var cx = ox + T * 0.5;
    var cy = oy + T * 0.5;
    ctx.beginPath();
    ctx.moveTo(ox + e.x, oy + e.y);
    ctx.quadraticCurveTo(cx, cy, ox + x.x, oy + x.y);
    ctx.stroke();
  }

  function _drawUTurn(ctx, ox, oy, T, dir) {
    // Cubic Bézier self-loop: enters at the edge midpoint, loops inward
    // toward the opposite edge with the two control points splayed along
    // the perpendicular axis, returns to the same edge midpoint.
    //
    // For dir=NORTH: entry at top-center; controls are below-left and
    // below-right, producing a downward teardrop curl.
    var e = _edgeMidpoint(dir, T);
    var opp = _opposite(dir);
    var inwardMid = _edgeMidpoint(opp, T);  // opposite edge midpoint
    var perp = (dir + 1) % 4;                // perpendicular axis
    var perpMid = _edgeMidpoint(perp, T);

    // Inward vector: from entry toward opposite edge midpoint.
    var inDx = inwardMid.x - e.x;
    var inDy = inwardMid.y - e.y;
    // Perpendicular unit-ish (from center toward perp edge midpoint).
    var perpDx = perpMid.x - T * 0.5;
    var perpDy = perpMid.y - T * 0.5;

    var depth = 0.85;  // how far toward the opposite edge the loop reaches
    var splay = 0.75;  // how wide the loop splays along the perpendicular

    var c1x = ox + e.x + inDx * depth + perpDx * splay;
    var c1y = oy + e.y + inDy * depth + perpDy * splay;
    var c2x = ox + e.x + inDx * depth - perpDx * splay;
    var c2y = oy + e.y + inDy * depth - perpDy * splay;

    ctx.beginPath();
    ctx.moveTo(ox + e.x, oy + e.y);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ox + e.x, oy + e.y);
    ctx.stroke();
  }

  function _drawHalfStub(ctx, ox, oy, T, dir, fromEdge) {
    // Line between tile center and the edge midpoint for dir.
    //   fromEdge=true  → edge-midpoint → center (head stub)
    //   fromEdge=false → center → edge-midpoint (tail stub / seed exit)
    var pt = _edgeMidpoint(dir, T);
    if (!pt) return;
    var cx = ox + T * 0.5;
    var cy = oy + T * 0.5;
    ctx.beginPath();
    if (fromEdge) {
      ctx.moveTo(ox + pt.x, oy + pt.y);
      ctx.lineTo(cx, cy);
    } else {
      ctx.moveTo(cx, cy);
      ctx.lineTo(ox + pt.x, oy + pt.y);
    }
    ctx.stroke();
  }

  function _drawSeedDot(ctx, ox, oy, T, color) {
    // Solitary visit (both dirs null) — draw a small filled circle at center.
    var cx = ox + T * 0.5;
    var cy = oy + T * 0.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.2, T * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  function _drawVisit(ctx, ox, oy, T, visit, color) {
    // Branch on the (entryDir, exitDir) pair. See file header for table.
    var e = visit.entryDir;
    var x = visit.exitDir;

    ctx.strokeStyle = color;

    if (e == null && x == null) {
      _drawSeedDot(ctx, ox, oy, T, color);
      return;
    }
    if (e == null && x != null) {
      _drawHalfStub(ctx, ox, oy, T, x, false);
      return;
    }
    if (e != null && x == null) {
      _drawHalfStub(ctx, ox, oy, T, e, true);
      return;
    }
    // Both set: straight / elbow / U-turn.
    if (e === _opposite(x)) {
      _drawStraight(ctx, ox, oy, T, e, x);
    } else if (e === x) {
      _drawUTurn(ctx, ox, oy, T, e);
    } else {
      _drawElbow(ctx, ox, oy, T, e, x);
    }
  }

  function _drawCrossMark(ctx, ox, oy, T) {
    var cx = ox + T * 0.5;
    var cy = oy + T * 0.5;
    var r = T * 0.22;
    ctx.strokeStyle = CROSS_COLOR;
    var prevWidth = ctx.lineWidth;
    ctx.lineWidth = Math.max(1, T * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
    ctx.lineWidth = prevWidth;
  }

  function _drawHeadPulse(ctx, ox, oy, T) {
    // Pulsing cyan-green halo at the head tile. Phase driven by clock so
    // multiple frames of the same tile don't produce stripes of identical
    // brightness — the eye catches the tile that is alive.
    var cx = ox + T * 0.5;
    var cy = oy + T * 0.5;
    var t = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    var phase = (t % 900) / 900;                  // 0..1 over ~0.9s
    var sine = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    var r = T * (0.22 + 0.14 * sine);
    var a = (0.30 + 0.45 * sine).toFixed(3);
    ctx.fillStyle = 'rgba(' + HEAD_HALO_BASE[0] + ',' +
                              HEAD_HALO_BASE[1] + ',' +
                              HEAD_HALO_BASE[2] + ',' + a + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Main overlay entry point ────────────────────────────────────

  function drawOverlay(ctx, currentFloorId) {
    if (typeof HoseState === 'undefined' || !HoseState.isActive()) return;
    if (_tileSize < 1) return;

    // Rung 2B: prefer the HoseDecal ledger. If it's missing (load-order
    // glitch), fall back to the legacy polyline so the minimap still shows
    // something rather than going blank.
    if (typeof HoseDecal === 'undefined') {
      _drawLegacyPolyline(ctx, currentFloorId);
      return;
    }

    var isReeling = (typeof HoseReel !== 'undefined' && HoseReel.isActive());
    var T = _tileSize;
    var baseColor = isReeling ? HOSE_COLOR_REEL : HOSE_COLOR;
    var strokeW = Math.max(1, HOSE_WIDTH_UNITS * (T / 6));

    // Track crossed tiles so the X passes can run after all stripes have
    // drawn (stripes underneath, X on top). iterateFloorVisits is a single
    // pass; collect then overlay.
    var crossed = [];

    // Stripe pass.
    ctx.lineWidth = strokeW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    HoseDecal.iterateFloorVisits(currentFloorId, function (tx, ty, rec) {
      var ox = _offsetX + tx * T;
      var oy = _offsetY + ty * T;
      var visits = rec.visits;
      for (var vi = 0; vi < visits.length; vi++) {
        _drawVisit(ctx, ox, oy, T, visits[vi], baseColor);
      }
      if (rec.crossCount >= 2) crossed.push({ x: ox, y: oy });
    });

    // Cross-mark pass (on top of stripes).
    for (var i = 0; i < crossed.length; i++) {
      _drawCrossMark(ctx, crossed[i].x, crossed[i].y, T);
    }

    // Head pulse (on top of everything).
    var head = HoseDecal.getHead();
    if (head && head.floorId === currentFloorId) {
      var hox = _offsetX + head.x * T;
      var hoy = _offsetY + head.y * T;
      _drawHeadPulse(ctx, hox, hoy, T);
    }

    // Origin marker: first path entry on this floor (truck on the origin
    // exterior, otherwise the stair-landing tile). Preserved from the
    // legacy renderer for behavior parity with floor transitions.
    var floorPath = HoseState.getPathOnFloor(currentFloorId);
    if (floorPath && floorPath.length > 0) {
      var orig = floorPath[0];
      var oxp = _offsetX + orig.x * T + T * 0.5;
      var oyp = _offsetY + orig.y * T + T * 0.5;
      ctx.fillStyle = ORIGIN_COLOR;
      ctx.beginPath();
      ctx.arc(oxp, oyp, Math.max(2, T * 0.30), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Legacy polyline fallback ────────────────────────────────────
  // Used only when HoseDecal isn't loaded. Mirrors the pre-Rung-2B code
  // so the minimap never goes dark during load ordering debug.

  function _drawLegacyPolyline(ctx, currentFloorId) {
    var floorPath = HoseState.getPathOnFloor(currentFloorId);
    if (!floorPath || floorPath.length < 1) return;

    var isReeling = (typeof HoseReel !== 'undefined' && HoseReel.isActive());
    var half = _tileSize * 0.5;

    ctx.strokeStyle = isReeling ? HOSE_COLOR_REEL : HOSE_COLOR;
    ctx.lineWidth = Math.max(1, HOSE_WIDTH_UNITS * (_tileSize / 6));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (var i = 0; i < floorPath.length; i++) {
      var px = _offsetX + floorPath[i].x * _tileSize + half;
      var py = _offsetY + floorPath[i].y * _tileSize + half;
      if (i === 0) ctx.moveTo(px, py);
      else         ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Kink dots (red) — only in legacy mode; Rung 2B uses cyan X instead.
    var freq = {};
    for (var j = 0; j < floorPath.length; j++) {
      var k = floorPath[j].x + ',' + floorPath[j].y;
      freq[k] = (freq[k] || 0) + 1;
    }
    ctx.fillStyle = 'rgba(255,60,60,0.8)';
    var kinkR = Math.max(2, _tileSize * 0.3);
    for (var key in freq) {
      if (freq[key] < 2) continue;
      var parts = key.split(',');
      var kx = _offsetX + parseInt(parts[0], 10) * _tileSize + half;
      var ky = _offsetY + parseInt(parts[1], 10) * _tileSize + half;
      ctx.beginPath();
      ctx.arc(kx, ky, kinkR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (floorPath.length > 0) {
      var orig = floorPath[0];
      var ox = _offsetX + orig.x * _tileSize + half;
      var oy = _offsetY + orig.y * _tileSize + half;
      ctx.fillStyle = ORIGIN_COLOR;
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(2, _tileSize * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Public API ─────────────────────────────────────────────────

  return Object.freeze({
    setRenderParams: setRenderParams,
    drawOverlay:     drawOverlay
  });
})();

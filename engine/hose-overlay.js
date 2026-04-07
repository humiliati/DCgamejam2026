/**
 * HoseOverlay — minimap rendering of the hose trail and kink markers (PW-4).
 *
 * Draws the hose breadcrumb path as a colored polyline on the minimap canvas
 * and marks kink points (self-crossings) as red dots. During reel-in, the
 * line visually retracts as HoseState.popLastStep() shrinks the path.
 *
 * Follows the same setRenderParams / drawOverlay pattern as MinimapNav.
 * Called by Minimap.render() after MinimapNav overlay, so the hose draws
 * on top of the nav path dots.
 *
 * Layer 2 — depends on: HoseState (soft)
 */
var HoseOverlay = (function () {
  'use strict';

  // ── Colors ──────────────────────────────────────────────────────
  var HOSE_COLOR       = 'rgba(80,220,120,0.65)';   // green line
  var HOSE_COLOR_REEL  = 'rgba(80,220,120,0.35)';   // dimmer during reel
  var KINK_COLOR       = 'rgba(255,60,60,0.8)';     // red kink dots
  var ORIGIN_COLOR     = 'rgba(255,200,40,0.8)';    // yellow origin marker (truck)
  var HOSE_WIDTH       = 2;                          // line width in px

  // ── Render params (synced from Minimap each frame) ──────────────
  var _tileSize = 0;
  var _offsetX  = 0;
  var _offsetY  = 0;

  function setRenderParams(tileSize, offsetX, offsetY) {
    _tileSize = tileSize;
    _offsetX  = offsetX;
    _offsetY  = offsetY;
  }

  // ── Drawing ─────────────────────────────────────────────────────

  /**
   * Draw the hose trail + kink dots on the minimap canvas.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} currentFloorId — only draw path entries on this floor
   */
  function drawOverlay(ctx, currentFloorId) {
    if (typeof HoseState === 'undefined' || !HoseState.isActive()) return;
    if (_tileSize < 1) return;

    var floorPath = HoseState.getPathOnFloor(currentFloorId);
    if (!floorPath || floorPath.length < 1) return;

    var isReeling = (typeof HoseReel !== 'undefined' && HoseReel.isActive());
    var half = _tileSize / 2;

    // ── Polyline: hose trail ──
    ctx.strokeStyle = isReeling ? HOSE_COLOR_REEL : HOSE_COLOR;
    ctx.lineWidth = Math.max(1, HOSE_WIDTH * (_tileSize / 6));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (var i = 0; i < floorPath.length; i++) {
      var px = _offsetX + floorPath[i].x * _tileSize + half;
      var py = _offsetY + floorPath[i].y * _tileSize + half;
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // ── Kink dots: mark tiles visited more than once ──
    // Build a frequency map for tiles on this floor
    var freq = {};
    for (var j = 0; j < floorPath.length; j++) {
      var k = floorPath[j].x + ',' + floorPath[j].y;
      freq[k] = (freq[k] || 0) + 1;
    }

    ctx.fillStyle = KINK_COLOR;
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

    // ── Origin marker: first tile in path (truck location) ──
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

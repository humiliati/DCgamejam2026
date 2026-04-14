// ═══════════════════════════════════════════════════════════════
//  bv-interaction.js — Pan, zoom, hover, paint, lasso input
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-render.js (canvas, VIEW, draw, cellPx),
//              bv-edit-state.js (EDIT, LASSO, HOVER, updateEditUI),
//              bv-floor-data.js (currentFloor),
//              bv-tile-schema.js (TILE_SCHEMA, CAT_LABELS),
//              bv-brush.js (paintCell, flushStroke),
//              bv-primitives.js (cellsInRect, cellsInLine, floodFillCells,
//                                replaceAllOfType, commitBulk),
//              bv-lasso.js (lassoStartSelect/Update/End, lassoUpdate/EndDrag),
//              bv-clipboard.js (CLIPBOARD, stampClipboardAt),
//              bv-clipboard-utils.js (showCopyToast)
//
//  MUST load AFTER DOM ready — reads #canvas-wrap and #tooltip at module top.
//
//  Exposes globals:
//    canvasWrap, tooltip, resizeCanvas, screenToGrid, updateCursor
//
//  External refs: buildTilePicker() [bv-tile-picker, extracted later],
//                 metaInterceptMousedown() [bv-meta-editor, optional]
// ═══════════════════════════════════════════════════════════════
'use strict';

var canvasWrap = document.getElementById('canvas-wrap');
var tooltip = document.getElementById('tooltip');

function resizeCanvas() {
  // Canvas with no width/height attribute defaults to 300×150 — if we
  // never size it to the wrap, the grid renders into a tiny box in the
  // top-left. Call this on startup, on window resize, and after any
  // layout change (e.g. toggling the resize bar).
  canvas.width  = canvasWrap.clientWidth  || 800;
  canvas.height = canvasWrap.clientHeight || 600;
  // Re-fit zoom/pan to the freshly-sized canvas so the grid recenters.
  if (currentFloor && currentFloor.grid) {
    var gw = currentFloor.grid[0] ? currentFloor.grid[0].length : 0;
    var gh = currentFloor.grid.length;
    if (gw && gh) {
      VIEW.zoom = Math.max(0.3, Math.min(3.0,
        Math.min((canvas.width  * 0.85) / (gw * VIEW.cellSize),
                 (canvas.height * 0.85) / (gh * VIEW.cellSize))));
      var cp = cellPx();
      VIEW.panX = (canvas.width  - gw * cp) / 2;
      VIEW.panY = (canvas.height - gh * cp) / 2;
      var zd = document.getElementById('zoom-display');
      if (zd) zd.textContent = VIEW.zoom.toFixed(1) + 'x';
    }
  }
  draw();
}
// Size the canvas once the wrap has real dimensions, and keep it in
// sync with window resizes. RequestAnimationFrame lets the browser
// compute layout before we read clientWidth/Height.
requestAnimationFrame(resizeCanvas);
window.addEventListener('resize', resizeCanvas);

function screenToGrid(mx, my) {
  var cp = cellPx();
  return { x: Math.floor((mx - VIEW.panX) / cp), y: Math.floor((my - VIEW.panY) / cp) };
}

canvasWrap.addEventListener('mousedown', function(e) {
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var g = screenToGrid(mx, my);

  // Metadata placement mode (spawn drag) preempts all other mouse handling.
  if (typeof metaInterceptMousedown === 'function' && metaInterceptMousedown(e, g)) return;

  if (EDIT.active && e.button === 0 && !e.ctrlKey && !e.altKey) {
    // Shift+click on Paint panels to the pan (keep original shortcut) — all other
    // tools use Shift as a tool-specific modifier (rect outline).
    var shift = !!e.shiftKey;
    if (EDIT.tool === 'paint' && !shift) {
      EDIT.painting = true;
      paintCell(g.x, g.y);
      return;
    }
    if (EDIT.tool === 'rect') {
      EDIT.dragPreview = { type:'rect', x0:g.x, y0:g.y, x1:g.x, y1:g.y, outline: shift };
      draw();
      return;
    }
    if (EDIT.tool === 'line') {
      EDIT.dragPreview = { type:'line', x0:g.x, y0:g.y, x1:g.x, y1:g.y };
      draw();
      return;
    }
    if (EDIT.tool === 'bucket') {
      commitBulk(floodFillCells(g.x, g.y));
      return;
    }
    if (EDIT.tool === 'replace') {
      commitBulk(replaceAllOfType(g.x, g.y));
      return;
    }
    if (EDIT.tool === 'paste') {
      if (!CLIPBOARD.tiles) { showCopyToast('Clipboard empty'); return; }
      stampClipboardAt(g.x, g.y);
      return;
    }
    if (EDIT.tool === 'lasso' && !shift) {
      lassoStartSelect(g.x, g.y);
      return;
    }
  }

  // Pan: middle button, left-click outside edit, or shift+left (paint tool only now,
  // since other tools consume shift for their own modifiers).
  var allowShiftPan = !EDIT.active || EDIT.tool === 'paint' || EDIT.tool === 'lasso';
  if (e.button === 1 || (e.button === 0 && !EDIT.active) ||
      (e.button === 0 && e.shiftKey && allowShiftPan && EDIT.tool !== 'lasso')) {
    VIEW.dragging = true;
    VIEW.dragStartX = e.clientX; VIEW.dragStartY = e.clientY;
    VIEW.panStartX = VIEW.panX; VIEW.panStartY = VIEW.panY;
    canvasWrap.style.cursor = 'grabbing';
  }
});

window.addEventListener('mousemove', function(e) {
  if (VIEW.dragging) {
    VIEW.panX = VIEW.panStartX + (e.clientX - VIEW.dragStartX);
    VIEW.panY = VIEW.panStartY + (e.clientY - VIEW.dragStartY);
    draw();
    return;
  }
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var g = screenToGrid(mx, my);

  HOVER.gx = g.x; HOVER.gy = g.y;
  if (EDIT.tool === 'paste') { draw(); }
  if (EDIT.painting) { paintCell(g.x, g.y); return; }
  if (EDIT.dragPreview) {
    EDIT.dragPreview.x1 = g.x; EDIT.dragPreview.y1 = g.y;
    draw();
    return;
  }
  if (LASSO.selecting) { lassoUpdateSelect(g.x, g.y); return; }
  if (LASSO.dragging)  { lassoUpdateDrag(g.x, g.y); return; }
});

window.addEventListener('mouseup', function() {
  VIEW.dragging = false;
  if (EDIT.painting) {
    EDIT.painting = false;
    flushStroke();
  }
  if (EDIT.dragPreview) {
    var p = EDIT.dragPreview;
    var cells = (p.type === 'rect')
      ? cellsInRect(p.x0, p.y0, p.x1, p.y1, !!p.outline)
      : cellsInLine(p.x0, p.y0, p.x1, p.y1);
    EDIT.dragPreview = null;
    commitBulk(cells);
  }
  if (LASSO.selecting) lassoEndSelect();
  if (LASSO.dragging)  lassoEndDrag();
  updateCursor();
});

function updateCursor() {
  if (EDIT.active) {
    canvasWrap.style.cursor = EDIT.tool === 'lasso' ? 'crosshair' : 'cell';
  } else {
    canvasWrap.style.cursor = 'crosshair';
  }
}

// Zoom
canvasWrap.addEventListener('wheel', function(e) {
  e.preventDefault();
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var oldZoom = VIEW.zoom;
  VIEW.zoom = Math.max(0.2, Math.min(5.0, VIEW.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  VIEW.panX = mx - (mx - VIEW.panX) * (VIEW.zoom / oldZoom);
  VIEW.panY = my - (my - VIEW.panY) * (VIEW.zoom / oldZoom);
  document.getElementById('zoom-display').textContent = VIEW.zoom.toFixed(1) + 'x';
  draw();
}, { passive: false });

// Right-click: eyedropper in edit mode
canvasWrap.addEventListener('contextmenu', function(e) {
  if (!EDIT.active) return;
  e.preventDefault();
  var rect = canvas.getBoundingClientRect();
  var g = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
  if (!currentFloor || !currentFloor.grid) return;
  var grid = currentFloor.grid;
  if (g.y >= 0 && g.y < grid.length && g.x >= 0 && g.x < grid[g.y].length) {
    EDIT.paintTile = grid[g.y][g.x];
    updateEditUI();
    buildTilePicker();
  }
});

// Hover tooltip
canvasWrap.addEventListener('mousemove', function(e) {
  if (VIEW.dragging || EDIT.painting || LASSO.selecting || LASSO.dragging) { tooltip.style.display = 'none'; return; }
  if (!currentFloor || !currentFloor.grid) return;
  var rect = canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var g = screenToGrid(mx, my);
  document.getElementById('ib-pos').textContent = g.x + ', ' + g.y;
  var grid = currentFloor.grid;
  if (g.y < 0 || g.y >= grid.length || g.x < 0 || !grid[g.y] || g.x >= grid[g.y].length) {
    tooltip.style.display = 'none'; document.getElementById('ib-tile').textContent = '--'; return;
  }
  var tile = grid[g.y][g.x];
  var schema = TILE_SCHEMA[tile] || { name:'UNKNOWN', cat:'?', walk:false, opq:false };
  document.getElementById('ib-tile').textContent = schema.name + ' (' + tile + ')';
  var html = '<span class="tt-coord">(' + g.x + ', ' + g.y + ')</span>  <span class="tt-tile">' + schema.name + '</span> [' + tile + ']\n';
  html += '<span class="tt-prop">Category:</span> ' + (CAT_LABELS[schema.cat] || schema.cat) + '\n';
  html += '<span class="tt-prop">Walkable:</span> ' + (schema.walk?'yes':'no') + '  <span class="tt-prop">Opaque:</span> ' + (schema.opq?'yes':'no');
  if (currentFloor.doorTargets) { var key=g.x+','+g.y; if (currentFloor.doorTargets[key]) html+='\n<span class="tt-door">Door > Floor "'+currentFloor.doorTargets[key]+'"</span>'; }
  if (currentFloor.doorFaces) { var key=g.x+','+g.y; if (currentFloor.doorFaces[key]!==undefined) { var dirs=['EAST','SOUTH','WEST','NORTH']; html+='\n<span class="tt-prop">Exterior face:</span> '+dirs[currentFloor.doorFaces[key]]; } }
  if (currentFloor.rooms) { currentFloor.rooms.forEach(function(r,i){ if(g.x>=r.x&&g.x<r.x+r.w&&g.y>=r.y&&g.y<r.y+r.h) html+='\n<span class="tt-prop">Room '+i+':</span> '+r.w+'x'+r.h+' at ('+r.x+','+r.y+')'; }); }
  if (EDIT.originalGrid && EDIT.originalGrid[g.y] && grid[g.y][g.x] !== EDIT.originalGrid[g.y][g.x]) {
    var origTile = EDIT.originalGrid[g.y][g.x];
    var origSchema = TILE_SCHEMA[origTile] || { name: 'UNKNOWN' };
    html += '\n<span class="tt-edit">Was: ' + origSchema.name + ' [' + origTile + ']</span>';
  }
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  var tx = e.clientX-rect.left+16, ty = e.clientY-rect.top-10;
  if (tx+tooltip.offsetWidth > canvas.width-8) tx = e.clientX-rect.left-tooltip.offsetWidth-8;
  if (ty+tooltip.offsetHeight > canvas.height-8) ty = canvas.height-tooltip.offsetHeight-8;
  if (ty < 4) ty = 4;
  tooltip.style.left = tx+'px'; tooltip.style.top = ty+'px';
});
canvasWrap.addEventListener('mouseleave', function() { tooltip.style.display = 'none'; });

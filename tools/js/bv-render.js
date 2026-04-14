// ═══════════════════════════════════════════════════════════════
//  bv-render.js — Canvas rendering (tiles, overlays, previews)
//  Extracted from blockout-visualizer.html (Pass 0.1)
//
//  Depends on: bv-tile-schema.js, bv-floor-data.js, bv-edit-state.js,
//              bv-primitives.js (cellsInRect, cellsInLine)
//
//  IMPORTANT: Must load AFTER DOM is ready (needs #cv). Keep at
//  end-of-body with the rest of the BV script bundle.
//
//  Exposes globals:
//    canvas, ctx, VIEW
//    cellPx(), draw()
//
//  External refs: drawValidationHighlight() [bv-validation, optional]
// ═══════════════════════════════════════════════════════════════
'use strict';

var canvas = document.getElementById('cv');
var ctx = canvas.getContext('2d');

var VIEW = {
  panX: 0, panY: 0, zoom: 1.0, cellSize: 20,
  showGrid: false, showRooms: true, showDoors: true, showIDs: false, showLegend: false,
  dragging: false, dragStartX: 0, dragStartY: 0, panStartX: 0, panStartY: 0
};

function cellPx() { return VIEW.cellSize * VIEW.zoom; }

function draw() {
  var w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, w, h);
  if (!currentFloor || !currentFloor.grid) return;

  var grid = currentFloor.grid;
  var gw = grid[0] ? grid[0].length : 0;
  var gh = grid.length;
  var cp = cellPx();
  var orig = EDIT.originalGrid;

  // Draw tiles
  for (var y = 0; y < gh; y++) {
    for (var x = 0; x < gw; x++) {
      var tile = grid[y] ? grid[y][x] : 0;
      var schema = TILE_SCHEMA[tile];
      var px = VIEW.panX + x * cp;
      var py = VIEW.panY + y * cp;
      if (px + cp < 0 || px > w || py + cp < 0 || py > h) continue;

      ctx.fillStyle = schema ? schema.color : '#ff00ff';
      ctx.fillRect(px, py, cp, cp);

      // Dirty cell highlight
      if (orig && orig[y] && grid[y][x] !== orig[y][x]) {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, cp - 2, cp - 2);
      }

      // Tile ID/glyph text
      if (VIEW.showIDs && cp >= 16) {
        ctx.fillStyle = '#ffffff88';
        ctx.font = Math.max(8, cp * 0.35) + 'px Consolas';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(cp >= 28 ? String(tile) : (schema ? schema.glyph : '?'), px + cp/2, py + cp/2);
      }
    }
  }

  // Grid lines
  if (VIEW.showGrid) {
    ctx.strokeStyle = '#ffffff11';
    ctx.lineWidth = 0.5;
    for (var x = 0; x <= gw; x++) {
      var px = VIEW.panX + x * cp;
      if (px >= 0 && px <= w) { ctx.beginPath(); ctx.moveTo(px, Math.max(0,VIEW.panY)); ctx.lineTo(px, Math.min(h,VIEW.panY+gh*cp)); ctx.stroke(); }
    }
    for (var y = 0; y <= gh; y++) {
      var py = VIEW.panY + y * cp;
      if (py >= 0 && py <= h) { ctx.beginPath(); ctx.moveTo(Math.max(0,VIEW.panX), py); ctx.lineTo(Math.min(w,VIEW.panX+gw*cp), py); ctx.stroke(); }
    }
  }

  // Room overlays
  if (VIEW.showRooms && currentFloor.rooms) {
    ctx.strokeStyle = '#ffff0044'; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
    currentFloor.rooms.forEach(function(r) {
      ctx.strokeRect(VIEW.panX+r.x*cp, VIEW.panY+r.y*cp, r.w*cp, r.h*cp);
      if (r.cx !== undefined) { ctx.fillStyle='#ffff0044'; ctx.beginPath(); ctx.arc(VIEW.panX+(r.cx+.5)*cp, VIEW.panY+(r.cy+.5)*cp, 3, 0, Math.PI*2); ctx.fill(); }
    });
    ctx.setLineDash([]);
  }

  // Door target overlays
  if (VIEW.showDoors && currentFloor.doorTargets) {
    var targets = currentFloor.doorTargets;
    ctx.font = Math.max(9, cp*0.4)+'px Consolas'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for (var key in targets) {
      var parts = key.split(','), dx = parseInt(parts[0]), dy = parseInt(parts[1]);
      var dpx = VIEW.panX+dx*cp, dpy = VIEW.panY+dy*cp;
      ctx.fillStyle = '#ff333388';
      ctx.beginPath(); ctx.moveTo(dpx+cp/2,dpy+2); ctx.lineTo(dpx+cp-2,dpy+cp/2); ctx.lineTo(dpx+cp/2,dpy+cp-2); ctx.lineTo(dpx+2,dpy+cp/2); ctx.closePath(); ctx.fill();
      if (cp >= 20) { ctx.fillStyle='#ff6666'; ctx.fillText('>'+targets[key], dpx+cp/2, dpy+cp/2); }
    }
  }

  // Spawn marker
  var sp = currentFloor.spawn;
  if (!sp && currentFloor.floorId === '0') sp = { x: 4, y: 17 };
  if (sp) {
    var spx = VIEW.panX+(sp.x+.5)*cp, spy = VIEW.panY+(sp.y+.5)*cp;
    ctx.fillStyle='#ff44ff'; ctx.beginPath(); ctx.arc(spx, spy, Math.max(4,cp*.3), 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle='#ff88ff'; ctx.lineWidth=2; ctx.stroke();
    if (cp>=20) { ctx.fillStyle='#ff88ff'; ctx.font=Math.max(9,cp*.35)+'px Consolas'; ctx.textAlign='center'; ctx.fillText('SPAWN',spx,spy-cp*.45); }
  }

  // Door entry/exit markers
  if (currentFloor.doors) {
    var d = currentFloor.doors, markers = [];
    if (d.doorEntry) markers.push({pos:d.doorEntry, label:'ENTRY', color:'#44ff44'});
    if (d.doorExit) markers.push({pos:d.doorExit, label:'EXIT', color:'#ff8844'});
    if (d.stairsDn) markers.push({pos:d.stairsDn, label:'DN', color:'#4488ff'});
    if (d.stairsUp) markers.push({pos:d.stairsUp, label:'UP', color:'#88bbff'});
    markers.forEach(function(m) {
      if (!m.pos) return;
      ctx.strokeStyle=m.color; ctx.lineWidth=2; ctx.strokeRect(VIEW.panX+m.pos.x*cp+2, VIEW.panY+m.pos.y*cp+2, cp-4, cp-4);
      if (cp>=16) { ctx.fillStyle=m.color; ctx.font='bold '+Math.max(8,cp*.3)+'px Consolas'; ctx.textAlign='center'; ctx.fillText(m.label, VIEW.panX+(m.pos.x+.5)*cp, VIEW.panY+(m.pos.y+.5)*cp+cp*.55); }
    });
  }

  // Validation highlight overlay (red/amber/blue borders on flagged cells)
  if (typeof drawValidationHighlight === 'function') drawValidationHighlight();

  // Lasso selection rect
  if (LASSO.sel && EDIT.tool === 'lasso') {
    var s = LASSO.sel;
    ctx.strokeStyle = '#e8c547';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(VIEW.panX + s.x * cp, VIEW.panY + s.y * cp, s.w * cp, s.h * cp);
    ctx.setLineDash([]);
  }

  // Floating lasso tiles preview
  if (LASSO.floating) {
    var f = LASSO.floating;
    ctx.globalAlpha = 0.7;
    for (var dy = 0; dy < f.tiles.length; dy++) {
      for (var dx = 0; dx < f.tiles[dy].length; dx++) {
        var tile = f.tiles[dy][dx];
        var schema = TILE_SCHEMA[tile];
        var px = VIEW.panX + (f.curX + dx) * cp;
        var py = VIEW.panY + (f.curY + dy) * cp;
        ctx.fillStyle = schema ? schema.color : '#ff00ff';
        ctx.fillRect(px, py, cp, cp);
      }
    }
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = '#44bbff';
    ctx.lineWidth = 2;
    ctx.strokeRect(VIEW.panX + f.curX * cp, VIEW.panY + f.curY * cp, f.tiles[0].length * cp, f.tiles.length * cp);
  }

  // Paste ghost preview (follows HOVER when paste tool is active)
  if (EDIT.tool === 'paste' && CLIPBOARD.tiles) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (var py = 0; py < CLIPBOARD.h; py++) {
      for (var px2 = 0; px2 < CLIPBOARD.w; px2++) {
        var t = CLIPBOARD.tiles[py][px2];
        var schema = TILE_SCHEMA[t];
        ctx.fillStyle = schema ? schema.color : '#ff00ff';
        ctx.fillRect(VIEW.panX + (HOVER.gx + px2) * cp, VIEW.panY + (HOVER.gy + py) * cp, cp, cp);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#66ffaa';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(VIEW.panX + HOVER.gx * cp, VIEW.panY + HOVER.gy * cp, CLIPBOARD.w * cp, CLIPBOARD.h * cp);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Rect / Line drag preview
  if (EDIT.dragPreview) {
    var dp = EDIT.dragPreview;
    ctx.save();
    ctx.globalAlpha = 0.55;
    var tileColor = (TILE_SCHEMA[EDIT.paintTile] && TILE_SCHEMA[EDIT.paintTile].color) || '#e8c547';
    ctx.fillStyle = tileColor;
    var previewCells = (dp.type === 'rect')
      ? cellsInRect(dp.x0, dp.y0, dp.x1, dp.y1, !!dp.outline)
      : cellsInLine(dp.x0, dp.y0, dp.x1, dp.y1);
    for (var i = 0; i < previewCells.length; i++) {
      var c = previewCells[i];
      ctx.fillRect(VIEW.panX + c.x * cp, VIEW.panY + c.y * cp, cp, cp);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#e8c547';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    if (dp.type === 'rect') {
      var rx = Math.min(dp.x0,dp.x1), ry = Math.min(dp.y0,dp.y1);
      var rw = Math.abs(dp.x1-dp.x0)+1, rh = Math.abs(dp.y1-dp.y0)+1;
      ctx.strokeRect(VIEW.panX + rx*cp, VIEW.panY + ry*cp, rw*cp, rh*cp);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
}

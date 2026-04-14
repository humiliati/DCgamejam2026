/**
 * SpatialDebug — authoring overlay that makes world-Y and the various
 * per-subsystem coordinate systems (wall-native, sprite-yAlt,
 * cap-row, back-layer) visible on the 3D viewport.
 *
 * Vision: docs/SPATIAL_DEBUG_OVERLAY_VISION.md
 *
 * Layer 2 — depends on SpatialContract (Layer 1), TILES (Layer 0),
 * and FloorManager (Layer 3, queried defensively via typeof).
 *
 * ── Primary mode: "rifle sight" forward-column probe ────────────
 * Every frame we step along camera-forward in half-tile increments
 * and collect up to N distinct grid cells. Each non-empty cell gets
 * a vertical scale painted at its own screen column using its own
 * perpDist (same pixels-per-unit as the wall next to it). Columns
 * recede in perspective and are color-keyed by ordinal.
 *
 * ── Layout rules (the previous version folded on itself because it
 * stacked headers at y=4 when a tile's top projected above-screen
 * and painted a full-height chip behind every column). v2 fixes:
 *
 *   1. Ticks iterate in world-Y, but only ones whose screen-Y lands
 *      inside [0, h] render (both the tick arm AND its label). That
 *      kills the "labels drawn far offscreen, canvas seems to wrap"
 *      artifact — there is no wrap, there were just labels outside
 *      the visible rect being rendered anyway and overlapping each
 *      other when clamped.
 *
 *   2. No full-height chip behind columns. The spine and ticks are
 *      self-legible on the dark viewport; the old chip made the
 *      overlay dominate the screenshot the user is trying to hand
 *      off to the tile designer.
 *
 *   3. Headers anchor to the floor plane (psy(0)) with an ordinal-
 *      indexed vertical stagger, so near/far columns never stack at
 *      the same Y. The floor plane is visible for any walkable tile,
 *      so psy(0) is an always-on-screen anchor.
 *
 *   4. Leader line connects the header block to the tile's projected
 *      screen-X so the author can match header → tile at a glance.
 */
var SpatialDebug = (function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  var _enabled       = false;
  var _markSprites   = false;
  var _forwardProbe  = true;
  var _globalRuler   = false;
  var _probeTarget   = null;
  var _showReticule  = true;
  var _showWidget    = true;

  // Max tiles in the forward sight. 5 keeps columns readable.
  var _MAX_FORWARD_TILES = 5;

  // Per-ordinal visibility — index 0 == sightline #1, etc. All on by
  // default; the widget surfaces a checkbox per slot so authors can
  // mute noisy columns (e.g. the floor tile right under their feet)
  // while keeping the tile that's actually being debugged legible.
  var _columnOn = [];
  for (var _ci = 0; _ci < _MAX_FORWARD_TILES; _ci++) _columnOn.push(true);
  function setColumn(ordinal, on) {
    if (ordinal < 0 || ordinal >= _MAX_FORWARD_TILES) return;
    _columnOn[ordinal] = !!on;
    _syncWidget();
  }
  function isColumn(ordinal) { return !!_columnOn[ordinal]; }

  var _RULER_ANCHOR_DIST = 1.0;
  var _RULER_FRAC_X      = 1 / 3;
  var _TICK_MINOR_W      = 8;
  var _TICK_MAJOR_W      = 14;
  var _TICK_UNIT_W       = 20;
  var _GUTTER_W          = 68;

  // Tile-id → string name, built lazily.
  var _TILE_NAMES = null;
  function _tileName(id) {
    if (id === null || id === undefined) return '-';
    if (!_TILE_NAMES && typeof TILES !== 'undefined') {
      _TILE_NAMES = {};
      for (var k in TILES) {
        if (typeof TILES[k] === 'number') _TILE_NAMES[TILES[k]] = k;
      }
    }
    return (_TILE_NAMES && _TILE_NAMES[id]) || ('T' + id);
  }

  // ── API setters ────────────────────────────────────────────────
  function setEnabled(on) {
    _enabled = !!on;
    if (_enabled && _showWidget) _mountWidget();
    else                         _unmountWidget();
  }
  function isEnabled()         { return _enabled; }
  function setForwardProbe(on) { _forwardProbe = !!on; _syncWidget(); }
  function isForwardProbe()    { return _forwardProbe; }
  function setGlobalRuler(on)  { _globalRuler = !!on; _syncWidget(); }
  function isGlobalRuler()     { return _globalRuler; }
  function setReticule(on)     { _showReticule = !!on; _syncWidget(); }
  function setWidget(on) {
    _showWidget = !!on;
    if (_enabled && _showWidget) _mountWidget();
    else                         _unmountWidget();
  }

  function probe(gx, gy, opts) {
    if (gx === null || gx === undefined) { _probeTarget = null; _syncWidget(); return; }
    _probeTarget = { gx: gx | 0, gy: gy | 0, opts: opts || {} };
    console.log('[SpatialDebug] probe set at tile', gx, gy);
    _syncWidget();
  }
  function clearProbe() { _probeTarget = null; _syncWidget(); }
  function getProbe()   { return _probeTarget; }

  // ── Projection (matches RaycasterSprites' sprite projection math)
  function _projectWorld(px, py, pDir, halfFov, w, wx, wy) {
    var dx = wx - px;
    var dy = wy - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return { sx: w * 0.5, perpDist: dist, inFrustum: true, angle: 0 };
    var angle = Math.atan2(dy, dx) - pDir;
    while (angle >  Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    var perpDist = dist * Math.cos(angle);
    if (perpDist <= 0.05) return null;
    var sx = w * 0.5 + (angle / halfFov) * (w * 0.5);
    var inFrustum = Math.abs(angle) <= halfFov + 0.05;
    return { sx: sx, perpDist: perpDist, inFrustum: inFrustum, angle: angle };
  }

  // ── Entry point ────────────────────────────────────────────────
  function render(ctx, camera, contract, w, h, sprites) {
    if (!_enabled) return;
    if (!ctx || !contract) return;

    var rawHalfH   = h * 0.5;
    var pitchShift = (camera.pitch || 0) * rawHalfH;
    var halfH      = Math.max(20, Math.min(h - 20, rawHalfH - pitchShift));
    var bobShift   = (camera.bobY || 0) * h;

    ctx.save();

    if (_forwardProbe) _renderForwardColumns(ctx, camera, contract, w, h, halfH, bobShift);
    if (_globalRuler)  _renderGlobalRuler(ctx, contract, w, h, halfH, bobShift);
    if (_probeTarget)  _renderProbePin(ctx, camera, contract, w, h, halfH, bobShift);
    if (_markSprites && sprites && sprites.length) _renderSpriteMarkers(ctx, camera, sprites, w, h, halfH, bobShift);
    if (_showReticule) _drawReticule(ctx, w, h, halfH);

    ctx.restore();
  }

  function _drawReticule(ctx, w, h, halfH) {
    var cx = Math.floor(w * 0.5);
    ctx.save();
    ctx.strokeStyle = 'rgba(252,255,26,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 10, halfH + 0.5); ctx.lineTo(cx - 3,  halfH + 0.5);
    ctx.moveTo(cx + 3,  halfH + 0.5); ctx.lineTo(cx + 10, halfH + 0.5);
    ctx.moveTo(cx + 0.5, halfH - 10); ctx.lineTo(cx + 0.5, halfH - 3);
    ctx.moveTo(cx + 0.5, halfH + 3);  ctx.lineTo(cx + 0.5, halfH + 10);
    ctx.stroke();
    ctx.restore();
  }

  // ── Forward corridor ──────────────────────────────────────────
  function _renderForwardColumns(ctx, camera, contract, w, h, halfH, bobShift) {
    if (typeof FloorManager === 'undefined' || !FloorManager.getFloorData) return;
    var fd = FloorManager.getFloorData();
    if (!fd || !fd.grid) return;

    var halfFov = Math.PI / 6;
    var px = camera.px, py = camera.py, pDir = camera.pDir;
    var fx = Math.cos(pDir), fy = Math.sin(pDir);

    var seen  = {};
    var cells = [];
    var stepLen = 0.5;
    var maxSteps = _MAX_FORWARD_TILES * 4 + 8;

    for (var i = 1; i <= maxSteps && cells.length < _MAX_FORWARD_TILES + 2; i++) {
      var d  = i * stepLen;
      var gx = Math.floor(px + fx * d);
      var gy = Math.floor(py + fy * d);
      if (gx < 0 || gy < 0 || gx >= fd.gridW || gy >= fd.gridH) break;
      var key = gx + ',' + gy;
      if (seen[key]) continue;
      seen[key] = true;
      var tile = fd.grid[gy][gx];
      cells.push({ gx: gx, gy: gy, tile: tile });
      if (typeof TILES !== 'undefined') {
        var isCap = (typeof TILES.hasFlatTopCap === 'function' && TILES.hasFlatTopCap(tile));
        if (tile === TILES.WALL && !isCap) break;
      }
    }

    // Render far-to-near so close columns draw on top.
    cells.sort(function (a, b) {
      var da = (a.gx + 0.5 - px) * (a.gx + 0.5 - px) + (a.gy + 0.5 - py) * (a.gy + 0.5 - py);
      var db = (b.gx + 0.5 - px) * (b.gx + 0.5 - px) + (b.gy + 0.5 - py) * (b.gy + 0.5 - py);
      return db - da;
    });

    // Ordinal is assigned by the INPUT order (nearest = #1) so muting
    // #1 in the widget always hides the closest tile, not whichever
    // tile happened to render first post-sort. We pre-stamp the
    // ordinal before the far-to-near sort below.
    var nearSorted = cells.slice().sort(function (a, b) {
      var da = (a.gx + 0.5 - px) * (a.gx + 0.5 - px) + (a.gy + 0.5 - py) * (a.gy + 0.5 - py);
      var db = (b.gx + 0.5 - px) * (b.gx + 0.5 - px) + (b.gy + 0.5 - py) * (b.gy + 0.5 - py);
      return da - db;
    });
    for (var nn = 0; nn < nearSorted.length; nn++) nearSorted[nn]._ordinal = nn;

    for (var c = 0; c < cells.length; c++) {
      var cell = cells[c];
      var ord = cell._ordinal != null ? cell._ordinal : c;
      if (!_columnOn[ord]) continue;
      _renderTileColumn(ctx, cell, camera, contract, w, h, halfH, bobShift, halfFov, ord);
    }
  }

  var _COLUMN_COLORS = ['#fcff1a', '#2afce0', '#ff6ad5', '#7effa3', '#ff9a3c', '#c792ff'];

  // Each ordinal gets a vertical header band offset from psy(0). This
  // keeps headers off the ticks and prevents the y=4 stacking bug.
  function _headerBand(h, floorPy, ordinal) {
    // Chip is now ~148px tall, so we stagger by 156px. Fit at most
    // (available height / 156) header slots stacked; past that we
    // wrap back against the floor plane to stay on-screen.
    var slot = 156;
    var chipH = 148;
    var baseY;
    if (floorPy < h * 0.5) {
      baseY = floorPy + 10 + ordinal * slot;
      if (baseY + chipH > h - 4) {
        baseY = Math.max(8, floorPy - 10 - chipH - (ordinal % 3) * slot);
      }
    } else {
      baseY = floorPy - 10 - chipH - ordinal * slot;
      if (baseY < 4) {
        baseY = Math.min(h - chipH - 4, floorPy + 10 + (ordinal % 3) * slot);
      }
    }
    return Math.max(4, Math.min(h - chipH - 4, baseY));
  }

  function _renderTileColumn(ctx, cell, camera, contract, w, h, halfH, bobShift, halfFov, ordinal) {
    var gx = cell.gx, gy = cell.gy, tile = cell.tile;
    var p = _projectWorld(camera.px, camera.py, camera.pDir, halfFov, w, gx + 0.5, gy + 0.5);
    if (!p || !p.inFrustum) return;
    var perpDist = p.perpDist;
    if (perpDist < 0.15) return;
    var sxCol = Math.round(p.sx);

    var wallH = contract.wallHeight || 1.0;
    var tileOff = 0;
    if (typeof SpatialContract !== 'undefined') {
      try {
        wallH = SpatialContract.getWallHeight(contract, gx, gy, null, tile) || wallH;
        tileOff = SpatialContract.getTileHeightOffset(contract, tile) || 0;
      } catch (_e) { /* use defaults */ }
    }
    var hasCap = false, hasVoid = false, isFloat = false;
    if (typeof TILES !== 'undefined') {
      hasCap  = (typeof TILES.hasFlatTopCap === 'function' && TILES.hasFlatTopCap(tile));
      hasVoid = (typeof TILES.hasVoidCap    === 'function' && TILES.hasVoidCap(tile));
      isFloat = (typeof TILES.isFloating    === 'function' && TILES.isFloating(tile));
    }

    var vertShift = (h * tileOff) / perpDist;
    var psy = function (worldY) {
      return halfH - (h * worldY / perpDist) + bobShift - vertShift;
    };

    var slabBase = tileOff;
    var slabTop  = tileOff + wallH;
    var color    = _COLUMN_COLORS[ordinal % _COLUMN_COLORS.length];

    var colX   = sxCol + 14;
    var labelX = colX + 6;

    // Clamp viewport-visible world-Y range. For any visible portion
    // we draw ticks; above/below the viewport we simply don't render,
    // so labels never stack at y=4 or y=h-4 anymore.
    var yTopClamp = (halfH + bobShift - vertShift) * perpDist / h;                     // worldY whose psy == 0
    var yBotClamp = (halfH - h + bobShift - vertShift) * perpDist / h;                 // worldY whose psy == h
    // yTopClamp > yBotClamp because screen-Y is inverted.
    var yHi = Math.min(slabTop + 0.2, yTopClamp);
    var yLo = Math.max(Math.min(0, slabBase) - 0.2, yBotClamp);
    if (yHi <= yLo) return; // entirely off-screen

    // ── Zone bands (LEFT of spine) ──────────────────────────────────
    // Paints the physical render zones so the author can SEE the gap
    // fill, slab face, cap region, and ceiling void on the screenshot.
    // STOOP on floor 0 is the reference case: a hasFlatTopCap tile with
    // tileOff=0 and wH≈0.5, so the slab ends halfway up and the cap is
    // a void band above. DECK/BED/TABLE are similar; TERMINAL adds the
    // hasVoidCap flag which paints the cap band in dark green.
    ctx.save();
    var stepColor    = contract.stepColor    || '#2a2a2a';
    var floorColor   = contract.floorColor   || '#333';
    var ceilColor    = contract.ceilingColor || '#1a1a1a';
    var ceilingType  = contract.ceilingType  || '?';
    var bandX = colX - 30;
    var bandW = 14;

    function _paintBand(yBot, yTop, fill, alpha, label) {
      if (yTop <= yBot) return;
      var bTop = psy(yTop);
      var bBot = psy(yBot);
      if (bBot < 0 || bTop > h) return;
      var y0 = Math.max(0, bTop);
      var y1 = Math.min(h, bBot);
      if (y1 - y0 < 0.5) return;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fillRect(bandX, y0, bandW, y1 - y0);
      ctx.globalAlpha = 1;
      // Left-edge pin-stripe so the band has a crisp outline.
      ctx.strokeStyle = fill;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bandX + 0.5, y0);
      ctx.lineTo(bandX + 0.5, y1);
      ctx.stroke();
      // Inline label when the band is tall enough to read.
      if (label && (y1 - y0) >= 12) {
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillText(label, bandX - 1 + 1, (y0 + y1) * 0.5 + 1);
        ctx.fillStyle = '#f8f4ff';
        ctx.fillText(label, bandX - 1,     (y0 + y1) * 0.5);
      }
    }

    // Step fill: world-Y 0 → tileOff (raised transition tiles only).
    if (tileOff > 0.001) {
      _paintBand(0, tileOff, stepColor, 0.75, 'step');
    } else if (tileOff < -0.001) {
      // Sunken tiles show a ceiling-fill slot above the top of the slab.
      _paintBand(slabTop, 0, stepColor, 0.55, 'sunk');
    }

    // Slab face: tileOff → slabTop. Uses the ordinal color so authors
    // can match the zone band to the header border at a glance.
    _paintBand(slabBase, slabTop, color, 0.28, 'slab');

    // Cap region for hasFlatTopCap tiles: slabTop → contract.wallHeight.
    // This is the empty air ABOVE a half-height tile where the raycaster
    // projects the floor-texture cap. hasVoidCap tiles render this as
    // void (sky-through on interior/dungeon), so color it green.
    if (hasCap) {
      var capTop = ceilY; // contract wall-height
      var capFill = hasVoid ? '#4effa0' : floorColor;
      var capAlpha = hasVoid ? 0.35 : 0.5;
      var capLbl  = hasVoid ? 'void' : 'cap';
      _paintBand(slabTop, capTop, capFill, capAlpha, capLbl);
    }

    // Ceiling region: wallHeight → yHi. Keyed to ceilingType so the
    // author can see at a glance whether this floor paints a SKY, SOLID,
    // or VOID lid above the walls.
    var ceilBandFill = (ceilingType === 'SKY')   ? '#4a7ac8'
                     : (ceilingType === 'SOLID') ? ceilColor
                     : (ceilingType === 'VOID')  ? '#0a0a0a'
                     : '#333';
    _paintBand(ceilY, yHi, ceilBandFill, 0.35, ceilingType.toLowerCase());
    ctx.restore();

    // Spine — bold, 3px wide with a faint dark backing stroke so it
    // reads over any wall texture without disappearing into the paint.
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(colX + 0.5, psy(yHi));
    ctx.lineTo(colX + 0.5, psy(yLo));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(colX + 0.5, psy(yHi));
    ctx.lineTo(colX + 0.5, psy(yLo));
    ctx.stroke();

    // Ticks — about 1.6× the previous size and bolded. Unit ticks
    // (integers) use a contrasting yellow so 0.0 / 1.0 / 2.0 always
    // jump out no matter what the column color is.
    var pMinor = Math.ceil(yLo * 10);
    var pMaxor = Math.floor(yHi * 10);
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    for (var i = pMinor; i <= pMaxor; i++) {
      var y = i * 0.1;
      var py = psy(y);
      if (py < 0 || py > h) continue;
      var isUnit = (i % 10 === 0);
      var isHalf = (i % 5  === 0);
      var tW = isUnit ? 16 : (isHalf ? 11 : 6);
      var tickCol = isUnit ? '#fcff1a' : (isHalf ? color : 'rgba(231,226,255,0.55)');
      ctx.strokeStyle = tickCol;
      ctx.lineWidth = isUnit ? 2.4 : (isHalf ? 1.6 : 1.2);
      ctx.beginPath();
      ctx.moveTo(colX, py + 0.5);
      ctx.lineTo(colX + tW, py + 0.5);
      ctx.stroke();
      if (isHalf || isUnit) {
        // Dark halo behind label for legibility.
        var lbl = y.toFixed(1);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillText(lbl, labelX + tW + 1, py + 1);
        ctx.fillStyle = tickCol;
        ctx.fillText(lbl, labelX + tW,     py);
      }
    }

    // Slab bracket — thick arms at authored top + bottom of the tile's
    // wall slab. These are the two numbers the tile designer tunes, so
    // they get the boldest treatment on the column.
    var topPy  = psy(slabTop);
    var basePy = psy(slabBase);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    if (topPy  >= 0 && topPy  <= h) { ctx.moveTo(colX - 12, topPy + 0.5);  ctx.lineTo(colX - 2, topPy + 0.5); }
    if (basePy >= 0 && basePy <= h) { ctx.moveTo(colX - 12, basePy + 0.5); ctx.lineTo(colX - 2, basePy + 0.5); }
    ctx.stroke();
    if (topPy >= 0 && basePy <= h && topPy <= basePy) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(colX - 7, Math.max(0, topPy) + 0.5);
      ctx.lineTo(colX - 7, Math.min(h, basePy) + 0.5);
      ctx.stroke();
    }

    // Floor-plane tick (world-Y 0) when slab base is elevated.
    var floorPy = psy(0);
    if (slabBase !== 0 && floorPy >= 0 && floorPy <= h) {
      ctx.strokeStyle = 'rgba(255,106,213,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(colX - 6, floorPy + 0.5);
      ctx.lineTo(colX + 14, floorPy + 0.5);
      ctx.stroke();
    }

    // Ceiling-plane tick — where the contract's base wallHeight caps
    // the void. Useful when debugging hasFlatTopCap columns because
    // the cap floor plane is a function of (base wallHeight × 1), not
    // of the tile's own wH override.
    var ceilY = contract.wallHeight || 1.0;
    var ceilPy = psy(ceilY);
    if (ceilPy >= 0 && ceilPy <= h) {
      ctx.strokeStyle = 'rgba(184,17,110,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(colX - 6, ceilPy + 0.5);
      ctx.lineTo(colX + 14, ceilPy + 0.5);
      ctx.stroke();
    }

    // ── Header block anchored to the floor plane, ordinal-staggered ──
    floorPy = Math.max(4, Math.min(h - 110, psy(0)));
    var hTop = _headerBand(h, floorPy, ordinal);
    var flags = [];
    if (hasCap)  flags.push('flat');
    if (hasVoid) flags.push('void');
    if (isFloat) flags.push('float');
    var flagStr = flags.length ? flags.join(',') : '-';

    // Player-relative bearing in grid tiles so contributors don't have
    // to subtract coords by hand when handing the screenshot off.
    var dGX = gx - Math.floor(camera.px);
    var dGY = gy - Math.floor(camera.py);
    var bearing = '+' + (dGX >= 0 ? dGX : dGX) + ',' + (dGY >= 0 ? dGY : dGY);
    bearing = bearing.replace('+-', '-');

    // Contract summary for the first column only — repeats are noise.
    var depth = contract.depth != null ? contract.depth : '?';
    var ceilType = contract.ceilingType || '?';

    // Leader line — subtle but thicker than before so it reads on busy
    // wall textures.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(colX + 0.5, floorPy + 0.5);
    ctx.lineTo(colX + 42.5, hTop + 36);
    ctx.stroke();

    // Header chip — bordered in the column's color so it's unambiguous
    // which on-screen column owns which panel. 6 rows: title / tile /
    // wH+off / base+top / caps / palette / distance+context.
    var chipX = colX + 28;
    var chipW = 260;
    var chipH = 148;
    ctx.fillStyle = 'rgba(4,2,10,0.86)';
    ctx.fillRect(chipX, hTop, chipW, chipH);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(chipX + 0.5, hTop + 0.5, chipW - 1, chipH - 1);

    // Title — big, bold, carries ordinal + grid coord.
    ctx.fillStyle = color;
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('#' + (ordinal + 1) + '  (' + gx + ',' + gy + ')  ' + bearing,
                 chipX + 8, hTop + 6);

    // Tile name — emphasized in yellow because it's the primary thing
    // a tile designer needs to read off the screenshot.
    ctx.fillStyle = '#fcff1a';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillText(_tileName(tile) + '  [id ' + (tile == null ? '?' : tile) + ']',
                 chipX + 8, hTop + 24);

    // Authored numbers — wH, off, base, top, flags — two rows.
    ctx.fillStyle = '#e7e2ff';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText('wH ' + wallH.toFixed(2) + '   off ' + tileOff.toFixed(2),
                 chipX + 8, hTop + 44);
    ctx.fillText('base ' + slabBase.toFixed(2) + '   top ' + slabTop.toFixed(2),
                 chipX + 8, hTop + 60);

    // Flags row — colored to call attention to cap status since that's
    // what's relevant for the terminal emoji authoring problem.
    ctx.fillStyle = hasVoid ? '#7effa3' : (hasCap ? '#2afce0' : '#b7a8e0');
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillText('caps ' + flagStr, chipX + 8, hTop + 76);

    // Palette row — exact hex values for the zones painted on the left,
    // so the tile designer can reproduce the look when tweaking a
    // neighboring tile's contract without eye-dropping the screenshot.
    var rowY = hTop + 94;
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textBaseline = 'top';
    // "step" swatch + hex
    ctx.fillStyle = stepColor;
    ctx.fillRect(chipX + 8, rowY + 1, 10, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(chipX + 8.5, rowY + 1.5, 9, 9);
    ctx.fillStyle = '#e7e2ff';
    ctx.fillText('step ' + stepColor, chipX + 22, rowY);
    // "floor" swatch + hex
    ctx.fillStyle = floorColor;
    ctx.fillRect(chipX + 130, rowY + 1, 10, 10);
    ctx.strokeRect(chipX + 130.5, rowY + 1.5, 9, 9);
    ctx.fillStyle = '#e7e2ff';
    ctx.fillText('flr ' + floorColor, chipX + 144, rowY);

    // Ceiling swatch row.
    rowY = hTop + 110;
    ctx.fillStyle = (ceilingType === 'SKY') ? '#4a7ac8'
                  : (ceilingType === 'SOLID') ? ceilColor
                  : '#0a0a0a';
    ctx.fillRect(chipX + 8, rowY + 1, 10, 10);
    ctx.strokeRect(chipX + 8.5, rowY + 1.5, 9, 9);
    ctx.fillStyle = '#e7e2ff';
    ctx.fillText('ceil ' + ceilingType, chipX + 22, rowY);

    // Distance + contract context row — sits at the bottom of the chip.
    ctx.fillStyle = 'rgba(231,226,255,0.8)';
    ctx.font = '11px "Courier New", monospace';
    ctx.fillText('d=' + perpDist.toFixed(2) + '   d' + depth +
                 '   wH⌈' + ceilY.toFixed(2) + '⌉',
                 chipX + 8, hTop + 128);

    ctx.restore();
  }

  // ── Optional global world-Y ruler ──────────────────────────────
  function _renderGlobalRuler(ctx, contract, w, h, halfH, bobShift) {
    var rulerX = Math.floor(w * _RULER_FRAC_X);
    var gutterL = rulerX - Math.floor(_GUTTER_W * 0.35);
    var gutterR = rulerX + Math.ceil(_GUTTER_W * 0.65);
    var sy = function (worldY) {
      return halfH - (h * worldY / _RULER_ANCHOR_DIST) + bobShift;
    };
    var rulerTopY = (contract.wallHeight || 1.0) * 1.25;
    var rulerBotY = -0.4;

    ctx.fillStyle = 'rgba(6, 4, 14, 0.45)';
    ctx.fillRect(gutterL, 0, gutterR - gutterL, h);
    ctx.strokeStyle = '#2afce0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rulerX + 0.5, 0);
    ctx.lineTo(rulerX + 0.5, h);
    ctx.stroke();

    ctx.font = '10px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    var minor = Math.round(rulerBotY * 10);
    var maxor = Math.round(rulerTopY * 10);
    for (var i = minor; i <= maxor; i++) {
      var y = i * 0.1, py = sy(y);
      if (py < 0 || py > h) continue;
      var isUnit = (i % 10 === 0), isHalf = (i % 5 === 0);
      var tickW = isUnit ? _TICK_UNIT_W : (isHalf ? _TICK_MAJOR_W : _TICK_MINOR_W);
      var color = isUnit ? '#fcff1a' : (isHalf ? '#2afce0' : 'rgba(231,226,255,0.55)');
      ctx.strokeStyle = color;
      ctx.lineWidth = isUnit ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(rulerX, py + 0.5);
      ctx.lineTo(rulerX + tickW, py + 0.5);
      ctx.stroke();
      if (isHalf || isUnit) {
        ctx.fillStyle = color;
        ctx.fillText(y.toFixed(1), rulerX + tickW + 4, py);
      }
    }
  }

  function _renderProbePin(ctx, camera, contract, w, h, halfH, bobShift) {
    var halfFov = Math.PI / 6;
    var gx = _probeTarget.gx, gy = _probeTarget.gy;
    var p = _projectWorld(camera.px, camera.py, camera.pDir, halfFov, w, gx + 0.5, gy + 0.5);
    if (!p || p.perpDist < 0.1) return;

    var tile = null;
    if (typeof FloorManager !== 'undefined' && FloorManager.getFloorData) {
      var fd = FloorManager.getFloorData();
      if (fd && fd.grid && gy >= 0 && gy < fd.gridH && gx >= 0 && gx < fd.gridW) {
        tile = fd.grid[gy][gx];
      }
    }
    _renderTileColumn(ctx, { gx: gx, gy: gy, tile: tile }, camera, contract, w, h, halfH, bobShift, halfFov, 5);
  }

  function _renderSpriteMarkers(ctx, camera, sprites, w, h, halfH, bobShift) {
    var halfFov = Math.PI / 6;
    ctx.save();
    ctx.font = '9px "Courier New", monospace';
    ctx.textBaseline = 'top';
    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      if (!s || typeof s.x !== 'number') continue;
      var p = _projectWorld(camera.px, camera.py, camera.pDir, halfFov, w,
                            (s.x || 0) + 0.5, (s.y || 0) + 0.5);
      if (!p || !p.inFrustum) continue;
      if (p.perpDist < 0.1 || p.perpDist > 40) continue;

      var yAlt = (s.yAlt || 0);
      var py = halfH - (h * yAlt / p.perpDist) + bobShift;
      ctx.strokeStyle = '#2afce0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.sx - 6, py + 0.5); ctx.lineTo(p.sx + 6, py + 0.5);
      ctx.moveTo(p.sx + 0.5, py - 6); ctx.lineTo(p.sx + 0.5, py + 6);
      ctx.stroke();
      var anchor = s.groundLevel ? 'ground' : (s.anchor ? s.anchor : 'billboard');
      var tag = '(' + s.x.toFixed(1) + ',' + s.y.toFixed(1) + ') ' +
                'yAlt=' + yAlt.toFixed(2) + ' sc=' + (s.scale || 0.6).toFixed(2) +
                ' ' + anchor;
      var tw = ctx.measureText(tag).width;
      ctx.fillStyle = 'rgba(6,4,14,0.7)';
      ctx.fillRect(p.sx + 8, py - 6, tw + 6, 12);
      ctx.fillStyle = '#2afce0';
      ctx.fillText(tag, p.sx + 11, py - 5);
    }
    ctx.restore();
  }

  // ── Live DOM widget ───────────────────────────────────────────
  //
  // Canvas-drawn toggles would need hit-testing + a custom event
  // pipeline; a tiny DOM panel is simpler and fits the neon HUD
  // aesthetic already used by the test harness. Pinned top-right,
  // pointer-events:auto only on itself, so it never blocks gameplay
  // input elsewhere.
  var _widgetEl = null;

  function _mountWidget() {
    if (_widgetEl) { _syncWidget(); return; }
    if (typeof document === 'undefined' || !document.body) {
      window.addEventListener('DOMContentLoaded', _mountWidget, { once: true });
      return;
    }
    var el = document.createElement('div');
    el.id = 'spatial-debug-widget';
    // Restore saved position if the author has dragged the panel
    // previously; fall back to bottom-LEFT so the default never
    // overlaps the minimap (top-right) or the HUD avatar (top-left).
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('sdbg_widget_pos') || 'null'); }
    catch (e) { /* ignore */ }
    var defLeft = '8px';
    var defBottom = '8px';
    var posCss = saved && typeof saved.left === 'number' && typeof saved.top === 'number'
      ? ('left:' + saved.left + 'px;top:' + saved.top + 'px')
      : ('left:' + defLeft + ';bottom:' + defBottom);

    el.style.cssText = [
      'position:fixed', posCss, 'z-index:99998',
      'padding:8px 10px', 'background:rgba(12,6,25,0.92)',
      'border:1px solid #2afce0', 'border-radius:3px',
      'box-shadow:0 0 10px rgba(42,252,224,0.35)',
      'font-family:Courier New, monospace', 'font-size:11px',
      'color:#e7e2ff', 'letter-spacing:1px', 'min-width:190px',
      'pointer-events:auto', 'user-select:none'
    ].join(';');
    el.innerHTML =
      '<div id="sdbg-drag" style="color:#fcff1a;font-weight:bold;margin-bottom:6px;letter-spacing:2px;border-bottom:1px dashed rgba(42,252,224,0.35);padding-bottom:4px;cursor:move;display:flex;justify-content:space-between;align-items:center;">' +
        '<span>◆ SPATIAL DEBUG</span>' +
        '<span style="color:#b7a8e0;font-weight:normal;font-size:9px;">⇕ drag</span>' +
      '</div>' +
      _row('sdbg-forward',  'Forward sightline') +
      _columnRows() +
      _row('sdbg-ruler',    'Global Y-ruler') +
      _row('sdbg-sprites',  'Sprite markers') +
      _row('sdbg-reticule', 'Center reticule') +
      '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed rgba(42,252,224,0.25);">' +
        '<div style="color:#b7a8e0;margin-bottom:4px;">Probe pin</div>' +
        '<div style="display:flex;gap:4px;">' +
          '<input id="sdbg-px" type="text" placeholder="x" style="width:42px;background:#000;border:1px solid #2afce0;color:#2afce0;font-family:inherit;font-size:11px;padding:2px 4px;">' +
          '<input id="sdbg-py" type="text" placeholder="y" style="width:42px;background:#000;border:1px solid #2afce0;color:#2afce0;font-family:inherit;font-size:11px;padding:2px 4px;">' +
          '<button id="sdbg-set"   style="flex:1;background:rgba(252,80,198,0.25);border:1px solid #fc50c6;color:#fff;font-family:inherit;font-size:10px;cursor:pointer;">set</button>' +
          '<button id="sdbg-clear" style="flex:1;background:transparent;border:1px solid #b7a8e0;color:#b7a8e0;font-family:inherit;font-size:10px;cursor:pointer;">clr</button>' +
        '</div>' +
      '</div>' +
      '<div id="sdbg-status" style="margin-top:6px;font-size:10px;color:#6e6490;"></div>';

    document.body.appendChild(el);
    _widgetEl = el;

    // Drag-to-move via the title bar. We pin the element in absolute
    // left/top space on first drag so the CSS left-or-bottom
    // computation settles to a single pair of numbers we can persist.
    var handle = document.getElementById('sdbg-drag');
    if (handle) {
      var dragging = false, offX = 0, offY = 0;
      handle.addEventListener('mousedown', function (ev) {
        dragging = true;
        var rect = _widgetEl.getBoundingClientRect();
        _widgetEl.style.left   = rect.left + 'px';
        _widgetEl.style.top    = rect.top + 'px';
        _widgetEl.style.right  = 'auto';
        _widgetEl.style.bottom = 'auto';
        offX = ev.clientX - rect.left;
        offY = ev.clientY - rect.top;
        ev.preventDefault();
      });
      window.addEventListener('mousemove', function (ev) {
        if (!dragging) return;
        var nx = Math.max(0, Math.min(window.innerWidth  - 40, ev.clientX - offX));
        var ny = Math.max(0, Math.min(window.innerHeight - 20, ev.clientY - offY));
        _widgetEl.style.left = nx + 'px';
        _widgetEl.style.top  = ny + 'px';
      });
      window.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        try {
          var rect = _widgetEl.getBoundingClientRect();
          localStorage.setItem('sdbg_widget_pos',
            JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
        } catch (e) { /* ignore */ }
      });
    }

    _bind('sdbg-forward',  _forwardProbe, function (v) { _forwardProbe = v; });
    for (var oi = 0; oi < _MAX_FORWARD_TILES; oi++) {
      (function (idx) {
        _bind('sdbg-col-' + idx, _columnOn[idx], function (v) { _columnOn[idx] = v; });
      })(oi);
    }
    _bind('sdbg-ruler',    _globalRuler,  function (v) { _globalRuler  = v; });
    _bind('sdbg-sprites',  _markSprites,  function (v) { _markSprites  = v; });
    _bind('sdbg-reticule', _showReticule, function (v) { _showReticule = v; });

    document.getElementById('sdbg-set').addEventListener('click', function () {
      var x = parseInt(document.getElementById('sdbg-px').value, 10);
      var y = parseInt(document.getElementById('sdbg-py').value, 10);
      if (isFinite(x) && isFinite(y)) probe(x, y);
    });
    document.getElementById('sdbg-clear').addEventListener('click', clearProbe);

    _syncWidget();
  }

  // Per-ordinal row set — indented under the master "Forward sightline"
  // toggle so it reads as a sub-group. Color chips match the column's
  // render color so the author can trace widget row → on-screen tick
  // color without a legend.
  function _columnRows() {
    var out = '<div style="margin:2px 0 4px 14px;border-left:1px dotted rgba(42,252,224,0.25);padding-left:6px;">';
    for (var i = 0; i < _MAX_FORWARD_TILES; i++) {
      var col = _COLUMN_COLORS[i % _COLUMN_COLORS.length];
      out +=
        '<label style="display:flex;align-items:center;gap:6px;padding:1px 0;cursor:pointer;font-size:10px;">' +
          '<input id="sdbg-col-' + i + '" type="checkbox" style="accent-color:' + col + ';margin:0;">' +
          '<span style="display:inline-block;width:10px;height:10px;background:' + col + ';border-radius:2px;"></span>' +
          '<span>Sightline #' + (i + 1) + '</span>' +
        '</label>';
    }
    out += '</div>';
    return out;
  }

  function _row(id, label) {
    return '<label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer;">' +
             '<input id="' + id + '" type="checkbox" style="accent-color:#fc50c6;margin:0;">' +
             '<span>' + label + '</span>' +
           '</label>';
  }

  function _bind(id, initial, setter) {
    var el = document.getElementById(id);
    if (!el) return;
    el.checked = !!initial;
    el.addEventListener('change', function () { setter(el.checked); _syncWidget(); });
  }

  function _syncWidget() {
    if (!_widgetEl) return;
    var ids = {
      'sdbg-forward':  _forwardProbe,
      'sdbg-ruler':    _globalRuler,
      'sdbg-sprites':  _markSprites,
      'sdbg-reticule': _showReticule
    };
    for (var id in ids) {
      var el = document.getElementById(id);
      if (el) el.checked = !!ids[id];
    }
    for (var oi = 0; oi < _MAX_FORWARD_TILES; oi++) {
      var cEl = document.getElementById('sdbg-col-' + oi);
      if (cEl) cEl.checked = !!_columnOn[oi];
    }
    var status = document.getElementById('sdbg-status');
    if (status) {
      status.textContent = _probeTarget
        ? ('pin @ (' + _probeTarget.gx + ',' + _probeTarget.gy + ')')
        : 'no pin set';
    }
  }

  function _unmountWidget() {
    if (!_widgetEl) return;
    if (_widgetEl.parentNode) _widgetEl.parentNode.removeChild(_widgetEl);
    _widgetEl = null;
  }

  return {
    setEnabled:      setEnabled,
    isEnabled:       isEnabled,
    setForwardProbe: setForwardProbe,
    isForwardProbe:  isForwardProbe,
    setColumn:       setColumn,
    isColumn:        isColumn,
    setGlobalRuler:  setGlobalRuler,
    isGlobalRuler:   isGlobalRuler,
    setReticule:     setReticule,
    setWidget:       setWidget,
    probe:           probe,
    clearProbe:      clearProbe,
    getProbe:        getProbe,
    render:          render,
    get markSprites() { return _markSprites; },
    set markSprites(v) { _markSprites = !!v; _syncWidget(); }
  };
})();

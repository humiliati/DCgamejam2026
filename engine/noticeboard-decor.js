/**
 * NoticeboardDecor — Dungeon minimap preview on notice board wall decor.
 *
 * Layer 3.5 — loaded after FloorManager, Minimap, TextureAtlas, Raycaster.
 *
 * When the player is on a depth-2 interior floor (N.N) that contains both
 * a NOTICE_BOARD tile and a STAIRS_DN tile, this module:
 *
 *   1. Finds each NOTICE_BOARD tile on the floor
 *   2. BFS-searches within SEARCH_RADIUS tiles for the nearest STAIRS_DN
 *   3. Resolves the target dungeon floor ID (N.N.N) via doorTargets or
 *      the childId convention
 *   4. Peeks the target floor's grid via FloorManager.peekFloorGrid()
 *      (generates + caches if not yet visited)
 *   5. Renders a 64×64 minimap preview canvas (fully revealed, no fog)
 *   6. Registers it as a TextureAtlas entry ('nb_preview_<targetId>')
 *   7. Replaces the decor_pinned_note wall decor entries on the notice
 *      board with a larger preview billboard sprite
 *
 * The result: the player walks up to the notice board outside a dungeon
 * entrance and sees a small map of the dungeon they're about to enter,
 * pinned to the board like a planning document.
 *
 * Depends on: TILES, FloorManager, TextureAtlas, SpatialContract (Layer 1)
 */
var NoticeboardDecor = (function () {
  'use strict';

  var T = typeof TILES !== 'undefined' ? TILES : null;
  var FM = typeof FloorManager !== 'undefined' ? FloorManager : null;
  var TA = typeof TextureAtlas !== 'undefined' ? TextureAtlas : null;

  // ── Constants ─────────────────────────────────────────────────────
  var PREVIEW_SIZE = 64;      // Texture resolution (matches TextureAtlas TEX_SIZE)
  var SEARCH_RADIUS = 12;     // BFS tile radius to find nearest STAIRS_DN
  var SPRITE_SCALE = 0.52;    // Wall decor billboard width (world units)
  var ANCHOR_U = 0.5;         // Centred horizontally on face
  var ANCHOR_V = 0.62;        // Slightly above centre (board is 1.2× tall)

  // Minimap-matching colour palette (fully revealed, no fog-of-war)
  var C = {
    bg:       '#111111',
    wall:     '#555555',
    floor:    '#2a2a2a',
    stairsDn: '#3366cc',
    stairsUp: '#55bbff',
    door:     '#b08040',
    hazard:   '#cc3333',
    chest:    '#ffff00',
    bonfire:  '#ff8800',
    corpse:   '#88aa66',
    breakable:'#887766'
  };

  // ── Preview cache ─────────────────────────────────────────────────
  // Key: target floor ID → HTMLCanvasElement (64×64)
  var _previewCache = {};

  /**
   * Render a minimap preview of the given grid to a 64×64 offscreen canvas.
   * All tiles are shown as fully explored + lit (planning map).
   *
   * A thin 1px parchment-coloured border frames the map to visually
   * separate it from the notice board texture behind.
   */
  function _renderPreview(grid, gridW, gridH) {
    var canvas = document.createElement('canvas');
    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    var ctx = canvas.getContext('2d');

    // Parchment background (matches notice board aesthetic)
    ctx.fillStyle = '#2a2218';
    ctx.fillRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    // Compute tile size to fit inside a 2px border
    var inner = PREVIEW_SIZE - 4;  // 2px border each side
    var tileSize = Math.max(1, Math.floor(inner / Math.max(gridW, gridH)));
    var mapW = gridW * tileSize;
    var mapH = gridH * tileSize;
    var ox = Math.floor((PREVIEW_SIZE - mapW) / 2);
    var oy = Math.floor((PREVIEW_SIZE - mapH) / 2);

    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var tile = grid[y][x];
        var color;

        if (tile === T.WALL || tile === T.PILLAR || tile === T.TREE) {
          color = C.wall;
        } else if (tile === T.STAIRS_DN || tile === T.TRAPDOOR_DN) {
          color = C.stairsDn;
        } else if (tile === T.STAIRS_UP || tile === T.TRAPDOOR_UP) {
          color = C.stairsUp;
        } else if (T.isDoor && T.isDoor(tile)) {
          color = C.door;
        } else if (T.isHazard && T.isHazard(tile)) {
          color = C.hazard;
        } else if (tile === T.CHEST) {
          color = C.chest;
        } else if (tile === T.BONFIRE) {
          color = C.bonfire;
        } else if (tile === T.CORPSE) {
          color = C.corpse;
        } else if (tile === T.BREAKABLE) {
          color = C.breakable;
        } else if (tile === T.EMPTY || (T.isWalkable && T.isWalkable(tile))) {
          color = C.floor;
        } else {
          // Non-walkable infrastructure, unknown tiles → wall-like
          color = C.wall;
        }

        ctx.fillStyle = color;
        ctx.fillRect(ox + x * tileSize, oy + y * tileSize, tileSize, tileSize);
      }
    }

    // ── Parchment border (thin warm frame) ──
    ctx.strokeStyle = '#8a7a5a';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 1.5, oy - 1.5, mapW + 3, mapH + 3);

    // ── "DUNGEON MAP" label at top (tiny, readable at 64px) ──
    ctx.fillStyle = '#9a8a6a';
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DUNGEON MAP', PREVIEW_SIZE / 2, oy - 3);

    return canvas;
  }

  /**
   * Get or create a preview canvas for the given target floor.
   * Returns an HTMLCanvasElement (64×64) or null if the floor can't be generated.
   */
  function _getOrCreatePreview(targetFloorId) {
    if (_previewCache[targetFloorId]) return _previewCache[targetFloorId];

    if (!FM) return null;

    // Try cache first, then peek (generates if needed)
    var peek = null;
    var cached = FM.getFloorCache(targetFloorId);
    if (cached && cached.grid) {
      peek = { grid: cached.grid, gridW: cached.gridW, gridH: cached.gridH };
    } else if (FM.peekFloorGrid) {
      peek = FM.peekFloorGrid(targetFloorId);
    }
    if (!peek || !peek.grid) return null;

    var canvas = _renderPreview(peek.grid, peek.gridW, peek.gridH);
    _previewCache[targetFloorId] = canvas;
    return canvas;
  }

  /**
   * BFS from (sx, sy) to find the nearest STAIRS_DN within SEARCH_RADIUS.
   * Returns { x, y } or null.
   */
  function _findNearestStairs(grid, gridW, gridH, sx, sy) {
    var STAIRS_DN = T.STAIRS_DN;
    var TRAPDOOR_DN = T.TRAPDOOR_DN;
    var visited = {};
    var queue = [{ x: sx, y: sy, d: 0 }];
    visited[sx + ',' + sy] = true;

    while (queue.length > 0) {
      var cur = queue.shift();
      if (cur.d > SEARCH_RADIUS) break;

      var tile = grid[cur.y][cur.x];
      if (tile === STAIRS_DN || tile === TRAPDOOR_DN) {
        return { x: cur.x, y: cur.y };
      }

      // 4-directional BFS
      var dirs = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
        { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
      ];
      for (var i = 0; i < dirs.length; i++) {
        var nx = cur.x + dirs[i].dx;
        var ny = cur.y + dirs[i].dy;
        if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
        var nk = nx + ',' + ny;
        if (visited[nk]) continue;
        visited[nk] = true;
        // BFS through walkable tiles and door-like tiles (not through walls)
        var nt = grid[ny][nx];
        if (T.isWalkable && T.isWalkable(nt)) {
          queue.push({ x: nx, y: ny, d: cur.d + 1 });
        } else if (nt === STAIRS_DN || nt === TRAPDOOR_DN) {
          // Allow finding the stair tile itself even though it's not walkable
          queue.push({ x: nx, y: ny, d: cur.d + 1 });
        }
      }
    }
    return null;
  }

  /**
   * Resolve the target dungeon floor ID from a STAIRS_DN tile coordinate.
   *
   * Priority:
   *   1. Explicit doorTargets["x,y"] on the current floor
   *   2. Convention: depth ≥ 3 → nextSiblingId, else childId(currentId, '1')
   */
  function _resolveTargetFloor(floorId, stairCoord, doorTargets) {
    var key = stairCoord.x + ',' + stairCoord.y;

    // 1. Explicit doorTarget
    if (doorTargets && doorTargets[key]) {
      return doorTargets[key];
    }

    // 2. Convention-based
    var depth = String(floorId).split('.').length;
    if (depth >= 3) {
      // Already in a dungeon → next sibling
      return FM.nextSiblingId ? FM.nextSiblingId(floorId)
                              : _nextSiblingLocal(floorId);
    }
    // Depth 1 or 2 → first child
    return FM.childId ? FM.childId(floorId, '1')
                      : String(floorId) + '.1';
  }

  // Local fallback for nextSiblingId (in case FM doesn't expose it)
  function _nextSiblingLocal(id) {
    var parts = String(id).split('.');
    var last = parseInt(parts[parts.length - 1], 10) || 0;
    parts[parts.length - 1] = String(last + 1);
    return parts.join('.');
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Populate notice board wall decor with dungeon minimap previews.
   *
   * Called from FloorManager.generateCurrentFloor() after wallDecor is
   * built but before Raycaster.setContract().
   *
   * @param {string} floorId       Current floor ID
   * @param {Object} floorData     Current floor's floorData
   *   .grid, .gridW, .gridH, .wallDecor, .doorTargets
   */
  function populate(floorId, floorData) {
    if (!T || !FM || !TA) return;
    if (!floorData || !floorData.grid || !floorData.wallDecor) return;

    var grid = floorData.grid;
    var W = floorData.gridW;
    var H = floorData.gridH;
    var decor = floorData.wallDecor;
    var doorTargets = floorData.doorTargets || {};
    var NOTICE_BOARD = T.NOTICE_BOARD;

    // Scan for notice board tiles
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        if (grid[y][x] !== NOTICE_BOARD) continue;

        // Find nearest STAIRS_DN via BFS
        var stair = _findNearestStairs(grid, W, H, x, y);
        if (!stair) continue;  // No stairs nearby — skip this board

        // Resolve target floor
        var targetId = _resolveTargetFloor(floorId, stair, doorTargets);
        if (!targetId) continue;

        // Generate preview canvas
        var previewCanvas = _getOrCreatePreview(targetId);
        if (!previewCanvas) continue;

        // Register as texture (idempotent — same ID reuses existing)
        var texId = 'nb_preview_' + targetId;
        if (!TA.hasTexture(texId)) {
          TA.register(texId, previewCanvas);
        }

        // Replace decor_pinned_note entries on this notice board with the
        // preview billboard. The infrastructure decor pass already created
        // entries on all walkable-neighbor faces; we swap those in place.
        var cell = decor[y] && decor[y][x];
        if (!cell) continue;

        var faces = ['n', 's', 'e', 'w'];
        for (var fi = 0; fi < faces.length; fi++) {
          var face = faces[fi];
          var items = cell[face];
          if (!items) continue;

          for (var di = 0; di < items.length; di++) {
            if (items[di].spriteId === 'decor_pinned_note') {
              // Replace with preview billboard
              items[di] = {
                spriteId: texId,
                anchorU: ANCHOR_U,
                anchorV: ANCHOR_V,
                scale: SPRITE_SCALE
              };
            }
          }

          // If no pinned note was found (board might have been placed
          // without the infrastructure pass), add the preview directly
          var hasPreview = false;
          for (var ci = 0; ci < items.length; ci++) {
            if (items[ci].spriteId === texId) { hasPreview = true; break; }
          }
          if (!hasPreview) {
            items.push({
              spriteId: texId,
              anchorU: ANCHOR_U,
              anchorV: ANCHOR_V,
              scale: SPRITE_SCALE
            });
          }
        }
      }
    }
  }

  /**
   * Flush the preview cache. Call on full game reset or when dungeon
   * layouts are regenerated (e.g. new-game-plus).
   */
  function clearCache() {
    _previewCache = {};
  }

  return Object.freeze({
    populate: populate,
    clearCache: clearCache
  });
})();

/**
 * Minimap — top-down dungeon map overlay with floor cache stack.
 *
 * Shows explored tiles, player position + facing, enemy blips.
 * Supports multi-floor navigation via cached explored state per
 * floor ID, with a breadcrumb stack for tracking the active path.
 *
 * Floor hierarchy (EyesOnly convention):
 *   "1"     = depth 1, exterior/overworld
 *   "1.2"   = depth 2, interior contrived (building)
 *   "1.2.3" = depth 3, nested proc-gen dungeon
 *
 * Transition behavior:
 *   Horizontal (N↔N.N): instant grid swap, no fade
 *   Vertical (N.N↔N.N.N, N.N.N↔N): swap during fade overlay
 */
var Minimap = (function () {
  'use strict';

  var _canvas = null;
  var _ctx = null;
  var _frame = null;       // #minimap-frame container
  var _expandBtn = null;   // #minimap-expand toggle
  var _floorLabelEl = null; // #minimap-floor-label
  // Time strip DOM refs
  var _timeStripEl  = null;  // #minimap-time-strip
  var _tsPhaseEl    = null;  // #mts-phase
  var _tsTimeEl     = null;  // #mts-time
  var _tsHeadingEl  = null;  // #mts-heading
  var _expanded = false;   // false = embedded (160px), true = overlay (320px)
  var _visible = true;     // Always visible during gameplay (embedded mode)
  var _size = 160;         // Current render size (changes with expand/collapse)

  // ── Floor cache & stack ──────────────────────────────────────────
  // _floorCache: floorId → { explored, lastPlayerPos }
  // Persists explored fog state so returning to a floor restores it.
  var _floorCache = {};

  // _floorStack: ordered array of floorIds representing the path
  // from surface to current depth. E.g. ['1', '1.2', '1.2.1']
  var _floorStack = [];

  // Current floor being displayed
  var _currentFloorId = null;

  // Current explored hash (reference into cache)
  var _explored = {};

  // ── Lit/unlit visibility tracking ─────────────────────────────────
  // _visibleFrame: tile key → frame counter when last in player's sight.
  // Tiles within reveal radius on the CURRENT frame get stamped with
  // _frameCounter.  Tiles where _visibleFrame[key] === _frameCounter
  // render "lit" (bright); explored tiles with stale stamps render "unlit"
  // (dimmed).  This matches dcexjam2025's visible_frame pattern.
  var _visibleFrame = {};   // key → last-seen frame counter
  var _frameCounter = 0;    // incremented each reveal() call

  // Floor label (from spatial contract) for overlay
  var _floorLabel = '';

  var COLORS = {
    bg:         'rgba(0,0,0,0.7)',
    wall:       '#555',
    wallUnlit:  '#3a3a3a',    // Dimmed wall (explored but not in sight)
    floor:      '#2a2a2a',
    floorLit:   '#3a3a3a',    // Brighter floor (currently in sight radius)
    door:       '#b08040',    // Horizontal transition markers (amber)
    stairs:     '#5588ff',    // Vertical transition markers (blue)
    stairsUp:   '#55bbff',    // Stairs up (lighter blue)
    stairsDn:   '#3366cc',    // Stairs down (deeper blue)
    player:     '#0f0',
    enemy:      '#f44',
    enemySus:   '#ff0',
    // Sight cone fill per awareness state
    coneUnaware:   'rgba(0,255,0,0.10)',     // green — safe
    coneSuspicious:'rgba(255,255,0,0.15)',    // yellow — caution
    coneAlerted:   'rgba(255,68,68,0.20)',    // red — danger
    coneEngaged:   'rgba(218,70,214,0.25)',   // magenta — combat
    chest:      '#ff0',
    hazard:     '#c33',       // Red tint for fire/spikes/poison/trap
    bonfire:    '#f80',       // Orange for bonfire checkpoints
    corpse:     '#8a6',       // Muted green for harvestable corpses
    collectible:'#fa4',       // Amber for walk-over pickups (gold/battery/food)
    breakable:  '#876',       // Tan-brown for destructible props
    unexplored: '#000',
    label:      'rgba(255,255,255,0.6)',
    labelBg:    'rgba(0,0,0,0.5)',
    // Battle zone / hazard area tinting
    battleZone: 'rgba(255,68,68,0.12)',   // Red tint over hazard tiles
    // Event icon colors
    npcIcon:    '#6cf',       // Cyan for NPC markers
    shopIcon:   '#fd4',       // Gold for shop markers
    bossIcon:   '#f4a',       // Pink for boss door markers
    questIcon:  '#af6'        // Green for quest markers
  };

  function init(canvas) {
    _canvas = canvas;
    _ctx = canvas.getContext('2d');

    // Find frame container and controls
    _frame = document.getElementById('minimap-frame');
    _expandBtn = document.getElementById('minimap-expand');
    _floorLabelEl = document.getElementById('minimap-floor-label');

    // Time strip elements
    _timeStripEl = document.getElementById('minimap-time-strip');
    _tsDayEl     = document.getElementById('mts-day');
    _tsPhaseEl   = document.getElementById('mts-phase');
    _tsTimeEl    = document.getElementById('mts-time');
    _tsHeadingEl = document.getElementById('mts-heading');

    // Set initial embedded size (matches CSS #minimap-frame 200px)
    _size = 200;
    _expanded = false;
    _visible = true;
    _canvas.width = _size;
    _canvas.height = _size;

    // Wire expand/collapse click
    if (_expandBtn) {
      _expandBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        _toggleExpand();
      });
    }
  }

  // ── Floor management ─────────────────────────────────────────────

  /**
   * Enter a new floor. Caches current floor state and sets up the
   * new floor's explored hash (from cache if revisiting, empty if new).
   *
   * @param {string} floorId   - e.g. "1", "1.2", "1.2.1"
   * @param {string} [label]   - Floor label from spatial contract
   */
  function enterFloor(floorId, label) {
    // Cache current floor before switching
    if (_currentFloorId) {
      _floorCache[_currentFloorId] = _floorCache[_currentFloorId] || {};
      _floorCache[_currentFloorId].explored = _explored;
      _floorCache[_currentFloorId].visibleFrame = _visibleFrame;
    }

    _currentFloorId = floorId;
    _floorLabel = label || floorId;

    // Restore cached explored state or start fresh
    if (_floorCache[floorId] && _floorCache[floorId].explored) {
      _explored = _floorCache[floorId].explored;
      _visibleFrame = _floorCache[floorId].visibleFrame || {};
    } else {
      _explored = {};
      _visibleFrame = {};
      _floorCache[floorId] = { explored: _explored, visibleFrame: _visibleFrame };
    }
  }

  /**
   * Push a floor onto the breadcrumb stack (going deeper).
   * Call this BEFORE enterFloor when descending/entering.
   *
   * @param {string} floorId
   */
  function pushFloor(floorId) {
    // Don't duplicate the top of stack
    if (_floorStack.length === 0 || _floorStack[_floorStack.length - 1] !== floorId) {
      _floorStack.push(floorId);
    }
  }

  /**
   * Pop floors from the stack back to a target floor (going up/out).
   * Removes everything above the target from the stack.
   *
   * @param {string} targetFloorId - The floor we're returning to
   */
  function popToFloor(targetFloorId) {
    var idx = _floorStack.indexOf(targetFloorId);
    if (idx >= 0) {
      _floorStack.length = idx + 1; // Trim everything after target
    } else {
      // Target not in stack — push it (shouldn't happen in normal flow)
      _floorStack = [targetFloorId];
    }
  }

  /**
   * Get the current breadcrumb stack (for debug/HUD).
   * @returns {Array<string>}
   */
  function getFloorStack() {
    return _floorStack.slice();
  }

  /**
   * Get the current floor ID.
   * @returns {string|null}
   */
  function getCurrentFloorId() {
    return _currentFloorId;
  }

  /**
   * Get depth of current floor (1=exterior, 2=interior, 3=nested).
   * @returns {number}
   */
  function getCurrentDepth() {
    if (!_currentFloorId) return 1;
    return String(_currentFloorId).split('.').length;
  }

  /**
   * Clear explored state for current floor only.
   */
  function clearExplored() {
    _explored = {};
    _visibleFrame = {};
    if (_currentFloorId && _floorCache[_currentFloorId]) {
      _floorCache[_currentFloorId].explored = _explored;
      _floorCache[_currentFloorId].visibleFrame = _visibleFrame;
    }
  }

  /**
   * Clear ALL cached floor data. Use on new game / hard reset.
   */
  function clearAllFloors() {
    _floorCache = {};
    _floorStack = [];
    _currentFloorId = null;
    _explored = {};
    _visibleFrame = {};
    _frameCounter = 0;
    _floorLabel = '';
  }

  /**
   * Toggle expanded overlay mode (M key or click expand icon).
   * In embedded mode the minimap is always visible at 160px.
   * In expanded mode it triples to 480px centered in the viewport.
   * Toggled by clicking the compass sprite on the minimap canvas.
   */
  function toggle() {
    _toggleExpand();
  }

  function _toggleExpand() {
    _expanded = !_expanded;
    _size = _expanded ? 480 : 200;
    _canvas.width = _size;
    _canvas.height = _size;
    if (_frame) {
      _frame.classList.toggle('expanded', _expanded);
      if (_expanded) {
        _frame.style.width = '480px';
        _frame.style.height = '480px';
      } else {
        _frame.style.width = '';
        _frame.style.height = '';
      }
    }
    if (_expandBtn) {
      // Hide the old expand button — compass is the toggle now
      _expandBtn.style.display = 'none';
    }
  }

  /**
   * Expand the minimap (compass click).
   */
  function compassExpand() {
    if (!_expanded) _toggleExpand();
  }

  /**
   * Collapse the minimap back to normal embedded size.
   * Called when click-to-move path starts.
   */
  function compassCollapse() {
    if (_expanded) _toggleExpand();
  }

  function isVisible() { return _visible; }
  function isExpanded() { return _expanded; }

  /**
   * Reveal tiles around a position (fog of war).
   * @param {number} px - Player grid X
   * @param {number} py - Player grid Y
   * @param {number} [radius] - Sight radius (default 5)
   */
  function reveal(px, py, radius) {
    radius = radius || 5;
    _frameCounter++;
    for (var dy = -radius; dy <= radius; dy++) {
      for (var dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          var key = (px + dx) + ',' + (py + dy);
          _explored[key] = true;
          _visibleFrame[key] = _frameCounter;
        }
      }
    }
  }

  /**
   * Render the minimap.
   * @param {Object} player   - { x, y, dir }
   * @param {Array[]} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {Array}  [enemies] - [{ x, y, awareness }]
   */
  function render(player, grid, gridW, gridH, enemies) {
    if (!_ctx) return;
    var ctx = _ctx;
    var baseTileSize = Math.max(2, Math.floor(_size / Math.max(gridW, gridH)));
    // 1.7× zoom for content legibility (user feedback: 70% larger)
    var tileSize = Math.max(3, Math.floor(baseTileSize * 1.7));
    // Center on player position instead of centering the whole grid
    var offsetX = Math.floor(_size / 2 - player.x * tileSize - tileSize / 2);
    var offsetY = Math.floor(_size / 2 - player.y * tileSize - tileSize / 2);

    // Clear
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, _size, _size);

    // ── Pass 1: Tile grid with lit/unlit distinction ───────────────
    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var key = x + ',' + y;
        if (!_explored[key]) continue;

        var tile = grid[y][x];
        var px2 = offsetX + x * tileSize;
        var py2 = offsetY + y * tileSize;
        var isLit = (_visibleFrame[key] === _frameCounter);

        if (tile === TILES.WALL || tile === TILES.PILLAR || tile === TILES.TREE) {
          ctx.fillStyle = isLit ? COLORS.wall : COLORS.wallUnlit;
        } else if (tile === TILES.STAIRS_UP) {
          ctx.fillStyle = isLit ? COLORS.stairsUp : _dimColor(COLORS.stairsUp);
        } else if (tile === TILES.STAIRS_DN) {
          ctx.fillStyle = isLit ? COLORS.stairsDn : _dimColor(COLORS.stairsDn);
        } else if (TILES.isDoor && TILES.isDoor(tile)) {
          ctx.fillStyle = isLit ? COLORS.door : _dimColor(COLORS.door);
        } else if (tile === TILES.CHEST) {
          ctx.fillStyle = isLit ? COLORS.chest : _dimColor(COLORS.chest);
        } else if (TILES.isHazard && TILES.isHazard(tile)) {
          ctx.fillStyle = isLit ? COLORS.hazard : _dimColor(COLORS.hazard);
        } else if (tile === TILES.BONFIRE) {
          ctx.fillStyle = isLit ? COLORS.bonfire : _dimColor(COLORS.bonfire);
        } else if (tile === TILES.CORPSE) {
          ctx.fillStyle = isLit ? COLORS.corpse : _dimColor(COLORS.corpse);
        } else if (tile === TILES.COLLECTIBLE) {
          ctx.fillStyle = isLit ? COLORS.collectible : _dimColor(COLORS.collectible);
        } else if (tile === TILES.BREAKABLE) {
          ctx.fillStyle = isLit ? COLORS.breakable : _dimColor(COLORS.breakable);
        } else if (tile === TILES.EMPTY || (TILES.isWalkable && TILES.isWalkable(tile))) {
          ctx.fillStyle = isLit ? COLORS.floorLit : COLORS.floor;
        } else {
          ctx.fillStyle = COLORS.unexplored;
        }

        ctx.fillRect(px2, py2, tileSize, tileSize);

        // ── Battle zone tinting (hazard area overlay) ──
        if (isLit && TILES.isHazard && TILES.isHazard(tile)) {
          ctx.fillStyle = COLORS.battleZone;
          ctx.fillRect(px2, py2, tileSize, tileSize);
        }

        // Draw directional chevrons on stair tiles + bonfire glow marker
        if (tileSize >= 4) {
          if (tile === TILES.BONFIRE && isLit) {
            // Bonfire: pulsing glow dot + flame chevron for visibility
            ctx.fillStyle = '#ff4';
            var bfCx = px2 + tileSize * 0.5;
            var bfCy = py2 + tileSize * 0.5;
            var bfR  = Math.max(2, tileSize * 0.35);
            ctx.beginPath();
            ctx.arc(bfCx, bfCy, bfR, 0, Math.PI * 2);
            ctx.fill();
          }
          if (tile === TILES.STAIRS_DN) {
            _drawChevron(ctx, px2, py2, tileSize, 'down');
          } else if (tile === TILES.STAIRS_UP) {
            _drawChevron(ctx, px2, py2, tileSize, 'up');
          }
        }
      }
    }

    // ── Pass 2: Event icon overlays (shops, boss doors, bonfires) ──
    if (tileSize >= 5) {
      _drawEventIcons(ctx, grid, gridW, gridH, tileSize, offsetX, offsetY);
    }

    // Draw enemy sight cones (behind dots so dots stay visible)
    if (enemies) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        var ek = e.x + ',' + e.y;
        if (!_explored[ek]) continue;
        // Only draw cones for enemies that have a facing direction
        if (e.dir === undefined && e.orientation === undefined) continue;

        var ex = offsetX + e.x * tileSize + tileSize / 2;
        var ey = offsetY + e.y * tileSize + tileSize / 2;
        var facing = _enemyFacingAngle(e);
        var aw = e.awareness || 0;
        // Use AwarenessConfig for canonical cone colors when available
        var coneColor;
        if (typeof AwarenessConfig !== 'undefined') {
          coneColor = AwarenessConfig.getConeColor(aw);
        } else {
          coneColor = (aw > 100) ? COLORS.coneEngaged
                    : (aw > 70)  ? COLORS.coneAlerted
                    : (aw > 30)  ? COLORS.coneSuspicious
                    :               COLORS.coneUnaware;
        }
        var sightRange = (e.sightRange || 5) * tileSize;
        _drawSightCone(ctx, ex, ey, facing, sightRange, coneColor);
      }
    }

    // Draw enemy dots (on top of cones) — skip NPCs (drawn separately)
    if (enemies) {
      for (var i = 0; i < enemies.length; i++) {
        var e = enemies[i];
        if (e.npcType) continue; // NPCs rendered as diamonds below
        var ek = e.x + ',' + e.y;
        if (!_explored[ek]) continue;

        var ex = offsetX + e.x * tileSize + tileSize / 2;
        var ey = offsetY + e.y * tileSize + tileSize / 2;
        ctx.fillStyle = (e.awareness > 30) ? COLORS.enemySus : COLORS.enemy;
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(2, tileSize / 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw NPC icons (cyan diamonds — distinct from enemy dots)
    _drawNpcIcons(ctx, enemies, tileSize, offsetX, offsetY);

    // Draw quest waypoint marker (pulsing green diamond)
    _drawQuestMarker(ctx, tileSize, offsetX, offsetY);

    // ── Orientation grid: draw subtle grid lines on tiles near the player ──
    // Helps the player see exactly which tile they're on and what's adjacent.
    if (tileSize >= 4) {
      var gridR = 3; // radius of grid overlay in tiles
      ctx.strokeStyle = 'rgba(51,255,136,0.12)';
      ctx.lineWidth = 1;
      for (var gx = player.x - gridR; gx <= player.x + gridR + 1; gx++) {
        if (gx < 0 || gx > gridW) continue;
        var lx = offsetX + gx * tileSize;
        var ly0 = offsetY + Math.max(0, player.y - gridR) * tileSize;
        var ly1 = offsetY + Math.min(gridH, player.y + gridR + 1) * tileSize;
        ctx.beginPath();
        ctx.moveTo(lx, ly0);
        ctx.lineTo(lx, ly1);
        ctx.stroke();
      }
      for (var gy = player.y - gridR; gy <= player.y + gridR + 1; gy++) {
        if (gy < 0 || gy > gridH) continue;
        var ly = offsetY + gy * tileSize;
        var lx0 = offsetX + Math.max(0, player.x - gridR) * tileSize;
        var lx1 = offsetX + Math.min(gridW, player.x + gridR + 1) * tileSize;
        ctx.beginPath();
        ctx.moveTo(lx0, ly);
        ctx.lineTo(lx1, ly);
        ctx.stroke();
      }
      // Highlight the player's own tile with a brighter outline
      ctx.strokeStyle = 'rgba(51,255,136,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        offsetX + player.x * tileSize,
        offsetY + player.y * tileSize,
        tileSize, tileSize
      );
    }

    // Draw player
    var ppx = offsetX + player.x * tileSize + tileSize / 2;
    var ppy = offsetY + player.y * tileSize + tileSize / 2;

    // Glow behind player marker for visibility
    ctx.fillStyle = 'rgba(0,255,128,0.15)';
    ctx.beginPath();
    ctx.arc(ppx, ppy, Math.max(4, tileSize * 0.8), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    var triSize = Math.max(4, tileSize * 1.1);
    var tipX = ppx + Math.cos(player.dir) * triSize;
    var tipY = ppy + Math.sin(player.dir) * triSize;
    var baseAngle = Math.PI * 0.8;
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(ppx + Math.cos(player.dir + baseAngle) * triSize * 0.5,
               ppy + Math.sin(player.dir + baseAngle) * triSize * 0.5);
    ctx.lineTo(ppx + Math.cos(player.dir - baseAngle) * triSize * 0.5,
               ppy + Math.sin(player.dir - baseAngle) * triSize * 0.5);
    ctx.closePath();
    ctx.fill();

    // Update MinimapNav render params and draw path overlay
    if (typeof MinimapNav !== 'undefined') {
      MinimapNav.setRenderParams(tileSize, offsetX, offsetY, gridW, gridH);
      MinimapNav.drawOverlay(ctx);
    }

    // Draw compass in bottom-left corner (rotates to show north)
    _drawCompass(ctx, player.dir);

    // Update time/heading strip in DOM frame
    _updateTimeStrip(player.dir);

    // Update floor label in DOM frame (not drawn on canvas)
    if (_floorLabelEl) {
      _floorLabelEl.textContent = _floorLabel || '';
    }

    // Draw depth indicator (breadcrumb dots, top-right)
    if (_floorStack.length > 1) {
      _drawBreadcrumbs(ctx);
    }
  }

  // ── Color dimming for unlit tiles ──────────────────────────────────
  // Cache dimmed versions of hex colors to avoid recalculating each frame.
  var _dimCache = {};
  var _DIM_FACTOR = 0.5; // 50% brightness for explored-but-not-visible tiles

  /**
   * Return a dimmed version of a hex color string.
   * @param {string} hex - e.g. '#55bbff'
   * @returns {string} Dimmed hex color
   */
  function _dimColor(hex) {
    if (_dimCache[hex]) return _dimCache[hex];
    // Parse hex (supports #rgb and #rrggbb)
    var h = hex.replace('#', '');
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    var r = Math.round(parseInt(h.substr(0, 2), 16) * _DIM_FACTOR);
    var g = Math.round(parseInt(h.substr(2, 2), 16) * _DIM_FACTOR);
    var b = Math.round(parseInt(h.substr(4, 2), 16) * _DIM_FACTOR);
    var result = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    _dimCache[hex] = result;
    return result;
  }

  // ── Event icon overlays ───────────────────────────────────────────
  // Draws small procedural icons on special tiles: shops, boss doors,
  // bonfires, bookshelves. Matches dcexjam2025's event icon system
  // but uses canvas primitives instead of sprite atlas.

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array[]} grid
   * @param {number} gridW
   * @param {number} gridH
   * @param {number} ts - tileSize
   * @param {number} ox - offsetX
   * @param {number} oy - offsetY
   */
  function _drawEventIcons(ctx, grid, gridW, gridH, ts, ox, oy) {
    var half = ts / 2;
    var iconR = Math.max(2, ts * 0.3);
    ctx.font = Math.max(6, ts * 0.6) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var y = 0; y < gridH; y++) {
      for (var x = 0; x < gridW; x++) {
        var key = x + ',' + y;
        if (!_explored[key]) continue;
        var isLit = (_visibleFrame[key] === _frameCounter);
        if (!isLit) continue; // Only show icons for currently visible tiles

        var tile = grid[y][x];
        var cx = ox + x * ts + half;
        var cy = oy + y * ts + half;
        var icon = null;
        var iconColor = null;

        if (tile === TILES.SHOP) {
          icon = '$';
          iconColor = COLORS.shopIcon;
        } else if (tile === TILES.BOSS_DOOR) {
          icon = '!';
          iconColor = COLORS.bossIcon;
        } else if (tile === TILES.BONFIRE) {
          icon = '*';
          iconColor = COLORS.bonfire;
        } else if (tile === TILES.BOOKSHELF) {
          icon = '?';
          iconColor = COLORS.questIcon;
        } else if (tile === TILES.PUZZLE) {
          icon = '~';
          iconColor = COLORS.questIcon;
        }

        if (icon) {
          // Draw icon background pip
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.arc(cx, cy, iconR + 1, 0, Math.PI * 2);
          ctx.fill();
          // Draw icon text
          ctx.fillStyle = iconColor;
          ctx.fillText(icon, cx, cy);
        }
      }
    }
  }

  // ── NPC minimap icons ─────────────────────────────────────────────
  // Draws small diamond markers for NPCs (non-enemy entities) on the
  // minimap. Distinguishes from enemy dots by shape and color.

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} enemies - Entity list (includes NPCs with npcType)
   * @param {number} ts - tileSize
   * @param {number} ox - offsetX
   * @param {number} oy - offsetY
   */
  function _drawNpcIcons(ctx, enemies, ts, ox, oy) {
    if (!enemies) return;
    var half = ts / 2;
    var dSize = Math.max(2, ts * 0.35);

    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e.npcType) continue; // Only NPCs, not combat enemies
      if (e.hp <= 0) continue;

      var key = e.x + ',' + e.y;
      if (!_explored[key]) continue;

      var cx = ox + e.x * ts + half;
      var cy = oy + e.y * ts + half;

      // Diamond shape for NPCs
      ctx.fillStyle = COLORS.npcIcon;
      ctx.beginPath();
      ctx.moveTo(cx, cy - dSize);
      ctx.lineTo(cx + dSize, cy);
      ctx.lineTo(cx, cy + dSize);
      ctx.lineTo(cx - dSize, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Quest waypoint marker ──────────────────────────────────────────
  // Draws a pulsing diamond on a target tile to guide the player toward
  // their current objective. The marker pulses via sine wave on alpha.

  var _questTarget = null; // { x, y } or null — set by Game

  function setQuestTarget(target) {
    _questTarget = target; // { x, y } or null to clear
  }

  function _drawQuestMarker(ctx, ts, ox, oy) {
    if (!_questTarget) return;
    var key = _questTarget.x + ',' + _questTarget.y;
    // Show marker even on unexplored tiles (it's a waypoint, not fog)
    var cx = ox + _questTarget.x * ts + ts / 2;
    var cy = oy + _questTarget.y * ts + ts / 2;

    // Pulsing alpha (0.4 → 0.9 over ~1.5s cycle)
    var pulse = 0.65 + 0.25 * Math.sin(performance.now() * 0.004);
    var dSize = Math.max(3, ts * 0.45);

    // Outer glow
    ctx.fillStyle = 'rgba(120,220,160,' + (pulse * 0.3).toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, dSize + 2, 0, Math.PI * 2);
    ctx.fill();

    // Diamond
    ctx.fillStyle = 'rgba(120,220,160,' + pulse.toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(cx, cy - dSize);
    ctx.lineTo(cx + dSize, cy);
    ctx.lineTo(cx, cy + dSize);
    ctx.lineTo(cx - dSize, cy);
    ctx.closePath();
    ctx.fill();

    // Inner pip
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, ts * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Sight cone helpers ────────────────────────────────────────────

  /**
   * Convert enemy orientation string to radians.
   * Supports both cardinal ('north','south','east','west') from patrol AI
   * and numeric `dir` (radians) from movement interpolation.
   */
  var _ORIENTATION_ANGLES = {
    'east':  0,
    'south': Math.PI / 2,
    'west':  Math.PI,
    'north': -Math.PI / 2
  };

  function _enemyFacingAngle(enemy) {
    if (typeof enemy.dir === 'number') return enemy.dir;
    return _ORIENTATION_ANGLES[enemy.orientation] || 0;
  }

  /**
   * Draw a 60° sight cone wedge on the minimap canvas.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx       - Center X (pixel)
   * @param {number} cy       - Center Y (pixel)
   * @param {number} facing   - Direction in radians
   * @param {number} range    - Sight range in pixels
   * @param {string} color    - Fill color (rgba string)
   */
  var _CONE_HALF_ANGLE = Math.PI / 6; // 30° each side = 60° total

  function _drawSightCone(ctx, cx, cy, facing, range, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, range, facing - _CONE_HALF_ANGLE, facing + _CONE_HALF_ANGLE, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw a small up/down chevron on stair tiles.
   */
  function _drawChevron(ctx, px, py, size, direction) {
    var cx = px + size / 2;
    var cy = py + size / 2;
    var half = size * 0.3;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (direction === 'down') {
      ctx.moveTo(cx - half, cy - half * 0.5);
      ctx.lineTo(cx, cy + half * 0.5);
      ctx.lineTo(cx + half, cy - half * 0.5);
    } else {
      ctx.moveTo(cx - half, cy + half * 0.5);
      ctx.lineTo(cx, cy - half * 0.5);
      ctx.lineTo(cx + half, cy + half * 0.5);
    }
    ctx.stroke();
  }

  // ── Time strip (DOM-based, updates each render frame) ────────────

  var _tsDayEl = null;  // #mts-day

  // Cardinal heading names indexed by player direction (0=N, 1=E, 2=S, 3=W)
  var _HEADING_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  /**
   * Convert a radian angle to a cardinal/intercardinal label.
   * @param {number} radians - Player facing angle (0=E, π/2=S, π=W, -π/2=N)
   * @returns {string} Cardinal label (N, NE, E, SE, S, SW, W, NW)
   */
  function _radToHeading(radians) {
    // Normalize to 0–2π, where 0 = East in math coords
    var a = ((radians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // Convert so 0 = North (subtract π/2 and invert)
    // In our coord system: -π/2 = North, 0 = East, π/2 = South, π = West
    // So: north-relative = (a + π/2) mod 2π, where 0=N going clockwise
    var northRel = (a + Math.PI / 2) % (Math.PI * 2);
    var idx = Math.round(northRel / (Math.PI / 4)) % 8;
    return _HEADING_LABELS[idx];
  }

  /**
   * Update the DOM time strip with current DayCycle + heading info.
   * Called once per render frame from render().
   * @param {number} playerAngle - Player facing angle in radians
   */
  function _updateTimeStrip(playerAngle) {
    if (!_tsTimeEl) return;
    if (typeof DayCycle === 'undefined') return;

    // Day label: suit symbol on hero days, day abbreviation otherwise
    if (_tsDayEl) {
      _tsDayEl.textContent = DayCycle.getDayLabel();
      var suitColor = DayCycle.getDayLabelColor();
      _tsDayEl.style.color = suitColor || '';
    }

    _tsPhaseEl.textContent  = DayCycle.getPhaseIcon();
    _tsTimeEl.textContent   = DayCycle.getTimeString();
    _tsHeadingEl.textContent = '\u25B8' + _radToHeading(playerAngle);
  }

  // ── Compass ──────────────────────────────────────────────────────

  // Compass hit-test region (updated each render frame)
  var _compassCX = 0;
  var _compassCY = 0;
  var _compassR  = 0;

  /**
   * Draw a compass rose in the bottom-left corner.
   * The "N" needle always points toward world-north, rotating
   * opposite to the player's facing so it reads correctly.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} playerAngle - Player facing in radians (0=east, π/2=south)
   */
  function _drawCompass(ctx, playerAngle) {
    var r = Math.max(10, _size * 0.07);
    var cx = r + 6;
    var cy = _size - r - 6;
    _compassCX = cx;
    _compassCY = cy;
    _compassR  = r;

    ctx.save();
    ctx.translate(cx, cy);

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(51,255,136,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rotate so north needle points to world-north
    // World-north is -π/2 in our coord system; player.dir is the camera angle.
    // Needle should point toward -π/2 minus player's current angle.
    var northAngle = -Math.PI / 2 - playerAngle;
    ctx.rotate(northAngle);

    // North needle (bright green triangle)
    var needleLen = r * 0.75;
    var needleW   = r * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, -needleLen);
    ctx.lineTo(-needleW, needleLen * 0.3);
    ctx.lineTo(needleW, needleLen * 0.3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(51,255,136,0.85)';
    ctx.fill();

    // South needle (dim)
    ctx.beginPath();
    ctx.moveTo(0, needleLen);
    ctx.lineTo(-needleW, -needleLen * 0.3);
    ctx.lineTo(needleW, -needleLen * 0.3);
    ctx.closePath();
    ctx.fillStyle = 'rgba(51,255,136,0.25)';
    ctx.fill();

    // "N" label at needle tip
    ctx.rotate(-northAngle); // Un-rotate for text
    // Place "N" at the north tip position (rotated)
    var nx = Math.cos(northAngle - Math.PI / 2) * (needleLen + 3);
    var ny = Math.sin(northAngle - Math.PI / 2) * (needleLen + 3);
    // Only draw "N" label in expanded/compass modes where there's room
    if (_size >= 160) {
      ctx.fillStyle = 'rgba(51,255,136,0.7)';
      ctx.font = Math.max(7, r * 0.55) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', nx, ny);
    }

    ctx.restore();
  }

  /**
   * Test if a canvas-local pixel coordinate hits the compass.
   * @param {number} px - Canvas-local X
   * @param {number} py - Canvas-local Y
   * @returns {boolean}
   */
  function hitTestCompass(px, py) {
    var dx = px - _compassCX;
    var dy = py - _compassCY;
    return (dx * dx + dy * dy) <= (_compassR + 4) * (_compassR + 4);
  }

  /**
   * Draw breadcrumb dots showing depth in floor stack.
   * Current floor = bright dot, parent floors = dim dots.
   */
  function _drawBreadcrumbs(ctx) {
    var count = _floorStack.length;
    var currentIdx = _floorStack.indexOf(_currentFloorId);
    if (currentIdx < 0) currentIdx = count - 1;

    var dotR = 4;
    var gap = 14;
    var startX = _size - (count * gap) - 4;
    var y = 16;

    for (var i = 0; i < count; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * gap + dotR, y, dotR, 0, Math.PI * 2);
      if (i === currentIdx) {
        ctx.fillStyle = '#fff';
      } else if (i < currentIdx) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
      }
      ctx.fill();
    }
  }

  return {
    init: init,
    render: render,
    reveal: reveal,

    // Floor cache management
    enterFloor: enterFloor,
    pushFloor: pushFloor,
    popToFloor: popToFloor,
    getFloorStack: getFloorStack,
    getCurrentFloorId: getCurrentFloorId,
    getCurrentDepth: getCurrentDepth,
    clearExplored: clearExplored,
    clearAllFloors: clearAllFloors,

    toggle: toggle,
    isVisible: isVisible,
    isExpanded: isExpanded,
    compassExpand: compassExpand,
    compassCollapse: compassCollapse,
    hitTestCompass: hitTestCompass,
    setQuestTarget: setQuestTarget,
    getExplored: function () { return _explored; },
    getCanvas: function () { return _canvas; },
    getSize: function () { return _size; }
  };
})();

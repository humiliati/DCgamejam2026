/**
 * PuzzlePeek — Interactive sliding-tile puzzle overlay for TILES.PUZZLE.
 *
 * When the player faces a PUZZLE tile, a frosted DOM panel appears showing a
 * 3×3 sliding-tile puzzle in its solved state (left behind by The Seeker).
 * The player's task: shuffle the tiles to disorganize the puzzle for the
 * next adventurer.  After MIN_SHUFFLES tile moves the "RESET PUZZLE" button
 * enables; confirming sets the grid cell to TILES.EMPTY and shows a toast.
 *
 * Grid:    3×3 (tiles 1–8 + one empty slot), each tile 76×76 px, 4 px gap.
 * UX:      Click any tile adjacent to the empty slot to slide it.
 *          Hover-highlight shows which tiles are movable.
 * Score:   5+ moves required before the confirm button unlocks.
 *
 * Layer 3 (after InteractPrompt, BoxAnim, ChestPeek, CratePeek)
 * Depends on: TILES, Player, MovementController, FloorManager,
 *             Toast (optional), SessionStats (optional)
 */
var PuzzlePeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY   = 400;   // ms debounce before panel appears
  var GRID_N       = 3;     // 3×3
  var TILE_SIZE    = 76;    // px — visible tile face
  var TILE_GAP     = 4;     // px — gap between tiles
  var TILE_STEP    = TILE_SIZE + TILE_GAP;   // 80 px stride
  var MIN_SHUFFLES = 5;     // moves required before confirm enables

  // Retrofuturistic rune-shard palette (one distinct hue per tile value)
  var TILE_COLORS = [
    null,        // 0 = empty slot
    '#2e5a7e',   // 1 - cobalt
    '#3a6b3a',   // 2 - fern
    '#7e4e2a',   // 3 - ochre
    '#5e3a7e',   // 4 - violet
    '#7e3a2e',   // 5 - rust
    '#2e6a6a',   // 6 - teal
    '#7e6a2e',   // 7 - gold
    '#6a2e5e',   // 8 - crimson
  ];

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _tiles      = [];   // length 9; value 0=empty, 1-8=tile label
  var _tileEls    = [];   // indexed by tile VALUE (0-8) → DOM element
  var _moveCount  = 0;
  var _cleanupId  = 0;    // generation counter to cancel stale DOM cleanup

  // ── DOM ────────────────────────────────────────────────────────
  var _container  = null;
  var _gridEl     = null;
  var _statusEl   = null;
  var _confirmBtn = null;

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('puzzle-peek-container');
    if (_container) return;   // already built

    _container = document.createElement('div');
    _container.id = 'puzzle-peek-container';
    _container.style.cssText =
      'position:absolute; top:50%; left:50%;' +
      'transform:translate(-50%,-50%) translateY(-6%);' +
      'z-index:20; pointer-events:none; opacity:0;' +
      'transition:opacity 0.3s ease;' +
      'width:264px;' +
      'background:rgba(8,8,14,0.94);' +
      'border:1px solid rgba(100,180,255,0.22);' +
      'border-radius:8px;' +
      'box-shadow:0 0 48px rgba(80,150,255,0.12),' +
        '0 0 0 1px rgba(60,120,220,0.08),' +
        'inset 0 0 40px rgba(0,0,0,0.4);' +
      'padding:14px 14px 12px;' +
      'box-sizing:border-box;';

    var vp = document.getElementById('viewport');
    if (vp) vp.appendChild(_container);

    // ── header ──
    var hdr = document.createElement('div');
    hdr.style.cssText =
      'color:rgba(160,210,255,0.9); font:bold 13px monospace;' +
      'text-align:center; margin-bottom:2px; letter-spacing:0.06em;' +
      'text-shadow:0 0 10px rgba(100,180,255,0.5);';
    hdr.textContent = '\u2014 PUZZLE PANEL \u2014';
    _container.appendChild(hdr);

    var sub = document.createElement('div');
    sub.style.cssText =
      'color:rgba(120,160,200,0.65); font:10px monospace;' +
      'text-align:center; margin-bottom:10px;';
    sub.textContent = 'disorganize for the next adventurer';
    _container.appendChild(sub);

    // ── 3×3 grid wrapper ──
    var gridW = GRID_N * TILE_SIZE + (GRID_N - 1) * TILE_GAP;
    var gridH = gridW;
    var gridWrap = document.createElement('div');
    gridWrap.style.cssText =
      'position:relative;' +
      'width:' + gridW + 'px;height:' + gridH + 'px;' +
      'margin:0 auto;';
    _gridEl = gridWrap;
    _container.appendChild(gridWrap);

    // ── status line ──
    _statusEl = document.createElement('div');
    _statusEl.id = 'puzzle-peek-status';
    _statusEl.style.cssText =
      'color:rgba(160,190,140,0.75); font:11px monospace;' +
      'text-align:center; margin-top:9px; height:14px; line-height:14px;';
    _container.appendChild(_statusEl);

    // ── confirm button ──
    _confirmBtn = document.createElement('button');
    _confirmBtn.id = 'puzzle-peek-confirm';
    _confirmBtn.textContent = 'RESET PUZZLE';
    _confirmBtn.style.cssText =
      'display:block; width:100%; margin-top:8px; padding:7px 0;' +
      'background:rgba(30,50,70,0.7); border:1px solid rgba(80,140,220,0.25);' +
      'border-radius:4px; color:rgba(140,180,220,0.4); font:bold 11px monospace;' +
      'cursor:not-allowed; letter-spacing:0.08em; outline:none;' +
      'transition:background 0.2s ease,border-color 0.2s ease,color 0.2s ease;';
    _confirmBtn.disabled = true;
    _confirmBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _confirmReset();
    });
    _container.appendChild(_confirmBtn);
  }

  // ── Per-frame check ──────────────────────────────────────────

  function update(dt) {
    if (!_container || typeof FloorManager === 'undefined') return;

    var floorData = FloorManager.getFloorData();
    if (!floorData) { _hide(); return; }

    var p   = Player.getPos();
    var dir = Player.getDir();
    var fx  = p.x + MC.DX[dir];
    var fy  = p.y + MC.DY[dir];

    if (fx < 0 || fx >= floorData.gridW || fy < 0 || fy >= floorData.gridH) {
      _hide(); return;
    }

    var tile = floorData.grid[fy][fx];
    if (tile !== TILES.PUZZLE) { _hide(); return; }

    // Same tile — already showing, nothing to do
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // New tile — accumulate debounce timer
    _facingTile = tile;
    _facingX    = fx;
    _facingY    = fy;
    _timer     += dt;

    if (_timer >= SHOW_DELAY) {
      _show(tile, fx, fy, floorData);
    }
  }

  // ── Show ─────────────────────────────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) return;

    _cleanupId++;      // Cancel any in-flight DOM cleanup from a prior _hide()
    _active    = true;
    _timer     = 0;
    _moveCount = 0;

    // Solved state: tiles 1-8 in order, empty slot at position 8 (bottom-right)
    _tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];

    _buildGrid();
    _updateStatus();

    _container.style.pointerEvents = 'auto';
    _container.style.opacity = '1';
  }

  // ── Grid construction ────────────────────────────────────────

  function _buildGrid() {
    if (!_gridEl) return;
    _gridEl.innerHTML = '';
    _tileEls = new Array(9);

    // Empty slot visual (tile value 0)
    var emptyEl = document.createElement('div');
    emptyEl.style.cssText =
      'position:absolute;' +
      'width:' + TILE_SIZE + 'px;height:' + TILE_SIZE + 'px;' +
      'border-radius:4px;' +
      'background:rgba(4,4,8,0.85);' +
      'box-shadow:inset 0 0 14px rgba(0,0,0,0.9);' +
      'transition:left 0.12s ease,top 0.12s ease;';
    _tileEls[0] = emptyEl;
    _gridEl.appendChild(emptyEl);

    // Numbered tiles 1-8
    for (var v = 1; v <= 8; v++) {
      (function (val) {
        var el = document.createElement('div');
        el.style.cssText =
          'position:absolute;' +
          'width:' + TILE_SIZE + 'px;height:' + TILE_SIZE + 'px;' +
          'border-radius:4px; cursor:pointer;' +
          'background:' + TILE_COLORS[val] + ';' +
          'box-shadow:' +
            'inset 0 1px 0 rgba(255,255,255,0.14),' +
            'inset 0 -2px 0 rgba(0,0,0,0.45),' +
            'inset 1px 0 0 rgba(255,255,255,0.06),' +
            '0 2px 5px rgba(0,0,0,0.7);' +
          'display:flex;align-items:center;justify-content:center;' +
          'user-select:none;' +
          'transition:left 0.12s ease,top 0.12s ease,filter 0.1s ease;';

        var num = document.createElement('span');
        num.textContent = String(val);
        num.style.cssText =
          'font:bold 26px monospace;' +
          'color:rgba(255,255,255,0.82);' +
          'text-shadow:0 1px 3px rgba(0,0,0,0.8);' +
          'pointer-events:none;';
        el.appendChild(num);

        el.addEventListener('click', function (e) {
          e.stopPropagation();
          _moveTileByValue(val);
        });
        el.addEventListener('mouseenter', function () {
          if (_isAdjacentToEmpty(val)) el.style.filter = 'brightness(1.3)';
        });
        el.addEventListener('mouseleave', function () {
          el.style.filter = '';
        });

        _tileEls[val] = el;
        _gridEl.appendChild(el);
      })(v);
    }

    _placeTiles();
  }

  /** Position all tile DOM elements based on the current _tiles array. */
  function _placeTiles() {
    for (var i = 0; i < 9; i++) {
      var val = _tiles[i];
      var row = Math.floor(i / GRID_N);
      var col = i % GRID_N;
      var el  = _tileEls[val];
      if (el) {
        el.style.left = (col * TILE_STEP) + 'px';
        el.style.top  = (row * TILE_STEP) + 'px';
      }
    }
  }

  function _isAdjacentToEmpty(val) {
    var tileIdx  = _tiles.indexOf(val);
    var emptyIdx = _tiles.indexOf(0);
    if (tileIdx < 0 || emptyIdx < 0) return false;
    var tRow = Math.floor(tileIdx / GRID_N),  tCol = tileIdx % GRID_N;
    var eRow = Math.floor(emptyIdx / GRID_N), eCol = emptyIdx % GRID_N;
    return (tRow === eRow && Math.abs(tCol - eCol) === 1) ||
           (tCol === eCol && Math.abs(tRow - eRow) === 1);
  }

  function _moveTileByValue(val) {
    if (!_active) return;
    var tileIdx  = _tiles.indexOf(val);
    var emptyIdx = _tiles.indexOf(0);
    if (tileIdx < 0 || emptyIdx < 0) return;

    var tRow = Math.floor(tileIdx / GRID_N),  tCol = tileIdx % GRID_N;
    var eRow = Math.floor(emptyIdx / GRID_N), eCol = emptyIdx % GRID_N;
    var adj = (tRow === eRow && Math.abs(tCol - eCol) === 1) ||
              (tCol === eCol && Math.abs(tRow - eRow) === 1);
    if (!adj) return;

    _tiles[emptyIdx] = val;
    _tiles[tileIdx]  = 0;
    _moveCount++;

    _placeTiles();
    _updateStatus();
  }

  function _updateStatus() {
    if (!_statusEl || !_confirmBtn) return;

    if (_moveCount < MIN_SHUFFLES) {
      var rem = MIN_SHUFFLES - _moveCount;
      _statusEl.textContent = 'move ' + rem + ' more tile' + (rem !== 1 ? 's' : '') + ' to enable reset';
      _statusEl.style.color = 'rgba(160,190,140,0.75)';
      _confirmBtn.disabled              = true;
      _confirmBtn.style.color           = 'rgba(140,180,220,0.4)';
      _confirmBtn.style.cursor          = 'not-allowed';
      _confirmBtn.style.borderColor     = 'rgba(80,140,220,0.25)';
      _confirmBtn.style.background      = 'rgba(30,50,70,0.7)';
    } else {
      _statusEl.textContent = 'puzzle disorganized \u2713';
      _statusEl.style.color = 'rgba(80,220,130,0.9)';
      _confirmBtn.disabled              = false;
      _confirmBtn.style.color           = 'rgba(100,230,160,0.9)';
      _confirmBtn.style.cursor          = 'pointer';
      _confirmBtn.style.borderColor     = 'rgba(60,200,110,0.5)';
      _confirmBtn.style.background      = 'rgba(15,55,30,0.85)';
    }
  }

  // ── Confirm reset ────────────────────────────────────────────

  function _confirmReset() {
    if (!_confirmBtn || _confirmBtn.disabled) return;

    // Consume the puzzle tile in the floor grid
    var floorData = FloorManager.getFloorData();
    if (floorData && _facingX >= 0 && _facingY >= 0) {
      floorData.grid[_facingY][_facingX] = TILES.EMPTY;
    }

    // Increment stat counter
    if (typeof SessionStats !== 'undefined' &&
        typeof SessionStats.increment === 'function') {
      SessionStats.increment('puzzlesReset');
    }

    // Feedback toast
    if (typeof Toast !== 'undefined' && typeof Toast.show === 'function') {
      Toast.show('\u2713 Puzzle reset', 2000);
    }

    _hide();
  }

  // ── Hide ─────────────────────────────────────────────────────

  function _hide() {
    if (!_active) { _timer = 0; return; }

    _container.style.opacity       = '0';
    _container.style.pointerEvents = 'none';

    _active     = false;
    _facingTile = 0;
    _facingX    = -1;
    _facingY    = -1;
    _moveCount  = 0;
    _tiles      = [];
    _timer      = 0;

    var myId = ++_cleanupId;
    setTimeout(function () {
      if (_cleanupId !== myId) return;   // _show() was called before the timeout fired
      if (_gridEl) _gridEl.innerHTML = '';
      _tileEls = [];
      if (_confirmBtn) {
        _confirmBtn.disabled          = true;
        _confirmBtn.style.color       = 'rgba(140,180,220,0.4)';
        _confirmBtn.style.cursor      = 'not-allowed';
        _confirmBtn.style.borderColor = 'rgba(80,140,220,0.25)';
        _confirmBtn.style.background  = 'rgba(30,50,70,0.7)';
      }
      if (_statusEl) {
        _statusEl.textContent = '';
        _statusEl.style.color = 'rgba(160,190,140,0.75)';
      }
    }, 350);
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init:   init,
    update: update
  };
})();

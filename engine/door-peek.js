/**
 * DoorPeek — BoxAnim door reveal when facing a transition tile.
 *
 * When the player faces a door or stair tile, a CSS 3D door box
 * appears centered in the viewport and swings open on its left Y-axis
 * hinge to reveal the destination floor name and direction indicator.
 *
 * Visual: BoxAnim door-variant with grass-stone frame faces, wooden
 * door lid, dark porthole void inside, warm parchment glow. Corrected
 * depth (35px) and gentler rotation angle prevent the old hashtag look.
 *
 * Text:
 *   Inside: destination floor name (warm parchment, large)
 *   Below box: "Exiting [floor] to proceed/return to [target]" (200% sized)
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager, i18n
 */
var DoorPeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY  = 300;   // ms before box appears (debounce jitter)
  var OPEN_DELAY  = 150;   // ms after appear before lid opens

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;  // Currently showing a peek box
  var _boxId      = null;   // BoxAnim instance ID
  var _facingTile = 0;      // TILES constant we're peeking at
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;      // Debounce timer
  var _opened     = false;  // Lid has opened
  var _container  = null;   // DOM container for the peek box
  var _subLabel   = null;   // DOM element for transition text below

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    // Create a container div centered in the viewport
    _container = document.getElementById('door-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'door-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-55%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    // Sub-label element for transition text (two rows, 36px, left-aligned)
    _subLabel = document.getElementById('door-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'door-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:36px; text-align:left;' +
        'font:42px monospace; color:rgba(180,170,150,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.7);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.3;';
      _container.appendChild(_subLabel);
    }
  }

  // ── Per-frame check ──────────────────────────────────────────

  function update(dt) {
    if (!_container || typeof BoxAnim === 'undefined') return;
    if (typeof FloorManager === 'undefined') return;

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
    if (!TILES.isDoor(tile) && tile !== TILES.STAIRS_DN && tile !== TILES.STAIRS_UP) {
      _hide(); return;
    }

    // Same tile we were already peeking at
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // New tile — start debounce
    if (!_active || _facingTile !== tile || _facingX !== fx || _facingY !== fy) {
      _facingTile = tile;
      _facingX = fx;
      _facingY = fy;
      _timer += dt;

      if (_timer >= SHOW_DELAY) {
        _show(tile, fx, fy, floorData);
      }
      return;
    }
  }

  // ── Show / hide ──────────────────────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) _destroyBox();

    // Create a door-variant box — no spin
    _boxId = BoxAnim.create('door', _container, { spin: false });
    _active = true;
    _opened = false;
    _timer = 0;

    // Resolve direction and target
    var currentId = FloorManager.getFloor();
    var targetId = null;
    var direction = 'advance';

    if (tile === TILES.DOOR || tile === TILES.BOSS_DOOR) {
      direction = 'advance';
      var key = fx + ',' + fy;
      if (floorData.doorTargets && floorData.doorTargets[key]) {
        targetId = floorData.doorTargets[key];
      }
    } else if (tile === TILES.DOOR_BACK || tile === TILES.DOOR_EXIT) {
      direction = 'retreat';
      var exitKey = fx + ',' + fy;
      if (floorData.doorTargets && floorData.doorTargets[exitKey]) {
        targetId = floorData.doorTargets[exitKey];
      }
    } else if (tile === TILES.STAIRS_DN) {
      direction = 'advance';
    } else if (tile === TILES.STAIRS_UP) {
      direction = 'retreat';
    }

    // Get labels
    var targetLabel = '';
    if (targetId && typeof FloorManager.getFloorLabel === 'function') {
      targetLabel = FloorManager.getFloorLabel(targetId);
    }
    if (!targetLabel && targetId) targetLabel = targetId;

    var currentLabel = '';
    if (typeof FloorManager.getFloorLabel === 'function') {
      currentLabel = FloorManager.getFloorLabel(currentId);
    }
    if (!currentLabel) currentLabel = currentId;

    // Determine glow color by direction
    var glowColor, labelColor;
    if (tile === TILES.BOSS_DOOR) {
      glowColor = 'rgba(220,60,40,0.5)';
      labelColor = '#f06050';
    } else if (direction === 'advance') {
      glowColor = 'rgba(220,200,160,0.5)';
      labelColor = '#dcc8a0';
    } else {
      glowColor = 'rgba(180,220,255,0.5)';
      labelColor = '#c0d8f0';
    }

    // Build label: destination floor name (or direction fallback)
    var displayLabel = targetLabel;
    if (!displayLabel) {
      if (tile === TILES.STAIRS_DN)   displayLabel = i18n.t('interact.descend', '▼ Descend');
      else if (tile === TILES.STAIRS_UP) displayLabel = i18n.t('interact.ascend', '▲ Ascend');
      else if (tile === TILES.BOSS_DOOR) displayLabel = i18n.t('interact.enter', '⚠ Boss');
      else displayLabel = direction === 'advance'
        ? i18n.t('interact.enter', '► Enter')
        : i18n.t('interact.exit', '◄ Exit');
    }

    // Style the box instance
    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', glowColor);
      inst.style.pointerEvents = 'none';

      // Insert destination label inside the glow area
      var glow = inst.querySelector('.box3d-glow');
      if (glow) {
        glow.innerHTML = '<span style="font:bold 28px monospace;color:' +
          labelColor + ';text-shadow:0 0 16px ' + glowColor +
          ';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
          'white-space:nowrap;">' + displayLabel + '</span>';
      }
    }

    // Sub-label: two-row transition text (DOM-safe, no innerHTML with user data)
    if (_subLabel && currentLabel && targetLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode('exiting ' + currentLabel));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('\u21b3' + targetLabel));
      _subLabel.style.color = 'rgba(180,170,150,0)';
    } else if (_subLabel) {
      _subLabel.textContent = '';
    }

    // Fade in
    _container.style.opacity = '1';

    // Open lid after brief delay
    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        // Fade in sub-label after door opens
        if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0.9)';
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (_opened && _boxId) {
      BoxAnim.close(_boxId);
    }

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0)';

    // Destroy after fade-out
    setTimeout(function () {
      _destroyBox();
    }, 350);

    _active = false;
    _opened = false;
    _facingTile = 0;
    _facingX = -1;
    _facingY = -1;
    _timer = 0;
  }

  function _destroyBox() {
    if (_boxId) {
      BoxAnim.destroy(_boxId);
      _boxId = null;
    }
    _active = false;
    _opened = false;
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init: init,
    update: update
  };
})();
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
  var _actionBtn  = null;   // Clickable action button (Magic Remote)
  var _labelLayer = null;   // Flat overlay layer above 3D scene

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    // Create a container div centered in the viewport
    _container = document.getElementById('door-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'door-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    // Label layer — flat overlay above 3D scene for text + action button
    _labelLayer = document.getElementById('door-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'door-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Sub-label element for transition text (two rows, 36px, left-aligned)
    _subLabel = document.getElementById('door-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'door-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:60px; text-align:left;' +
        'font:38px monospace; color:rgba(180,170,150,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.7);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.3;';
      _labelLayer.appendChild(_subLabel);
    }

    // Action button — clickable for Magic Remote
    _actionBtn = document.getElementById('door-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'door-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; bottom:-80px; left:50%;' +
        'transform:translateX(-50%);' +
        'font:bold 18px monospace; color:#c0d8f0;' +
        'background:rgba(60,80,120,0.5);' +
        'border:2px solid rgba(140,180,220,0.4);' +
        'border-radius:8px; padding:8px 20px;' +
        'text-shadow:0 0 8px rgba(140,180,220,0.4);' +
        'cursor:pointer; pointer-events:auto;' +
        'opacity:0; transition:opacity 0.3s ease;' +
        'outline:none;';
      _actionBtn.textContent = '[OK] Enter';
      _actionBtn.addEventListener('click', _onActionClick);
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#c0d8f0';
        _actionBtn.style.color = '#fff';
        _actionBtn.style.background = 'rgba(80,120,180,0.6)';
        _actionBtn.style.textShadow = '0 0 12px rgba(160,200,255,0.5)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = 'rgba(140,180,220,0.4)';
        _actionBtn.style.color = '#c0d8f0';
        _actionBtn.style.background = 'rgba(60,80,120,0.5)';
        _actionBtn.style.textShadow = '0 0 8px rgba(140,180,220,0.4)';
      });
      _labelLayer.appendChild(_actionBtn);
    }
  }

  function _onActionClick(e) {
    if (e) e.stopPropagation();
    // Delegate to Game.interact() — same pathway as Enter key
    if (typeof Game !== 'undefined' && typeof Game.interact === 'function') {
      Game.interact();
    } else if (typeof InputManager !== 'undefined' && InputManager.simulateOK) {
      InputManager.simulateOK();
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

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

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

    // ── Night-lock override ─────────────────────────────────────
    // If the target building is closed for the night, show a locked
    // variant instead of the normal door peek. Fires muffled bark.
    var _nightLocked = false;
    if (targetId && typeof DayCycle !== 'undefined' && DayCycle.isNightLocked(targetId)) {
      _nightLocked = true;
      // Fire muffled bark (debounced by BarkLibrary cooldown)
      var mPool = DayCycle.getMuffledBarkPool(targetId);
      if (mPool && typeof BarkLibrary !== 'undefined') {
        BarkLibrary.fire(mPool);
      }
    }

    // Determine glow color by direction
    var glowColor, labelColor;
    if (_nightLocked) {
      glowColor = 'rgba(100,100,140,0.4)';
      labelColor = '#8888aa';
    } else if (tile === TILES.BOSS_DOOR) {
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
    var displayLabel;
    if (_nightLocked) {
      displayLabel = '\uD83D\uDD12 Closed for the night';
    } else {
      displayLabel = targetLabel;
      if (!displayLabel) {
        if (tile === TILES.STAIRS_DN)   displayLabel = i18n.t('interact.descend', '▼ Descend');
        else if (tile === TILES.STAIRS_UP) displayLabel = i18n.t('interact.ascend', '▲ Ascend');
        else if (tile === TILES.BOSS_DOOR) displayLabel = i18n.t('interact.enter', '⚠ Boss');
        else displayLabel = direction === 'advance'
          ? i18n.t('interact.enter', '► Enter')
          : i18n.t('interact.exit', '◄ Exit');
      }
    }

    // Style the box instance (z-index:1, below label layer at z-index:2)
    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.zIndex = '1';
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
    if (_nightLocked && _subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(targetLabel || 'building'));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('come back in the morning'));
      _subLabel.style.color = 'rgba(180,170,150,0)';
    } else if (_subLabel && currentLabel && targetLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode('exiting ' + currentLabel));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('\u21b3' + targetLabel + ' soon'));
      _subLabel.style.color = 'rgba(180,170,150,0)';
    } else if (_subLabel) {
      _subLabel.textContent = '';
    }

    // Update action button text and hide initially
    if (_actionBtn) {
      _actionBtn.style.opacity = '0';
      if (_nightLocked) {
        _actionBtn.style.display = 'none'; // Can't enter at night
      } else {
        _actionBtn.style.display = '';
        _actionBtn.textContent = direction === 'advance'
          ? '[OK] Enter' : '[OK] Exit';
        // Color scheme matches direction
        if (direction === 'advance') {
          _actionBtn.style.color = '#dcc8a0';
          _actionBtn.style.background = 'rgba(100,80,40,0.5)';
          _actionBtn.style.borderColor = 'rgba(200,170,100,0.4)';
        } else {
          _actionBtn.style.color = '#c0d8f0';
          _actionBtn.style.background = 'rgba(60,80,120,0.5)';
          _actionBtn.style.borderColor = 'rgba(140,180,220,0.4)';
        }
      }
    }

    // Fade in
    _container.style.opacity = '1';

    // Open lid after brief delay
    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        // Fade in sub-label and action button after door opens
        if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0.9)';
        if (_actionBtn && _actionBtn.style.display !== 'none') {
          _actionBtn.style.opacity = '1';
        }
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    if (_opened && _boxId) {
      BoxAnim.close(_boxId);
    }

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(180,170,150,0)';
    if (_actionBtn) _actionBtn.style.opacity = '0';

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

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  return {
    init: init,
    update: update,
    forceHide: forceHide,
    isActive: function () { return _active; }
  };
})();
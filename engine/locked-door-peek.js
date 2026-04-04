/**
 * LockedDoorPeek — BoxAnim locked-door reveal when facing a locked door tile.
 *
 * When the player faces a LOCKED_DOOR tile, a CSS 3D locked-door box
 * appears centered in the viewport. Instead of swinging open, the door
 * shakes (rejection animation) and a lock emoji overlays with pulsing
 * glow to indicate the door cannot be opened.
 *
 * Visual: BoxAnim locked-variant — dark iron-banded wood, red/crimson
 * glow, shake animation on the lid, lock emoji flash overlay.
 *
 * Text below box (two rows, left-aligned):
 *   🔒 locked door
 *   requires [key item name] to unlock
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager, i18n
 */
var LockedDoorPeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY   = 300;   // ms before box appears (debounce jitter)
  var SHAKE_DELAY  = 200;   // ms after appear before shake triggers
  var RESHAKE_CD   = 2000;  // ms cooldown between shakes while staying on tile

  // ── State ──────────────────────────────────────────────────────
  var _active      = false;
  var _boxId       = null;
  var _facingTile  = 0;
  var _facingX     = -1;
  var _facingY     = -1;
  var _timer       = 0;
  var _shaken      = false;
  var _shakeCd     = 0;     // Cooldown timer for reshake
  var _container   = null;
  var _labelLayer  = null;
  var _innerLabel  = null;
  var _subLabel    = null;
  var _actionBtn   = null;

  // ── Init ───────────────────────────────────────────────────────

  function _onActionClick() {
    if (typeof Game !== 'undefined' && Game.interact) Game.interact();
  }

  function init() {
    _container = document.getElementById('locked-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'locked-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-55%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    // ── Label layer (z-index:2) — flat overlay above 3D box ──
    _labelLayer = document.getElementById('locked-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'locked-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Inner label (lock emoji — replaces the one inside .box3d-glow)
    _innerLabel = document.getElementById('locked-peek-innerlabel');
    if (!_innerLabel) {
      _innerLabel = document.createElement('div');
      _innerLabel.id = 'locked-peek-innerlabel';
      _innerLabel.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'font:bold 28px monospace; color:#e05040;' +
        'text-shadow:0 0 16px rgba(220,60,40,0.5);' +
        'white-space:nowrap; pointer-events:none;';
      _innerLabel.textContent = '\uD83D\uDD12 LOCKED';
      _labelLayer.appendChild(_innerLabel);
    }

    // Sub-label (margin bumped to 60px)
    _subLabel = document.getElementById('locked-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'locked-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(220,80,60,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.7);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.4;';
      _labelLayer.appendChild(_subLabel);
    }

    // Action button — shows "[OK] Use Key" when player has the key
    _actionBtn = document.getElementById('locked-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'locked-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:130px; padding:12px 28px; min-height:48px;' +
        'font:bold 18px monospace; color:#e08060; background:rgba(50,20,20,0.85);' +
        'border:1px solid #c05040; border-radius:6px;' +
        'cursor:pointer; pointer-events:auto; opacity:0; white-space:nowrap;' +
        'transition:opacity 0.3s ease, border-color 0.15s, color 0.15s, box-shadow 0.15s;';
      _actionBtn.textContent = 'Use Key';
      _actionBtn.addEventListener('click', _onActionClick);
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#ff8060';
        _actionBtn.style.color       = '#fff';
        _actionBtn.style.boxShadow   = '0 0 10px rgba(220,80,60,0.5)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = '#c05040';
        _actionBtn.style.color       = '#e08060';
        _actionBtn.style.boxShadow   = 'none';
      });
      _labelLayer.appendChild(_actionBtn);
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
    if (tile !== TILES.LOCKED_DOOR) {
      _hide(); return;
    }

    // Same tile we were already peeking at
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      // Manage reshake cooldown
      if (_shaken) {
        _shakeCd += dt;
        if (_shakeCd >= RESHAKE_CD && _boxId) {
          BoxAnim.shake(_boxId);
          _shakeCd = 0;
        }
      }
      return;
    }

    // New tile — start debounce
    _facingTile = tile;
    _facingX    = fx;
    _facingY    = fy;
    _timer     += dt;

    if (_timer >= SHOW_DELAY) {
      _show(tile, fx, fy, floorData);
    }
  }

  // ── Show / hide ──────────────────────────────────────────────

  function _show(tile, fx, fy, floorData) {
    if (_active) _destroyBox();

    _boxId   = BoxAnim.create('locked', _container, { spin: false });
    _active  = true;
    _shaken  = false;
    _shakeCd = 0;
    _timer   = 0;

    var glowColor  = 'rgba(220,60,40,0.5)';

    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', glowColor);
      inst.style.pointerEvents = 'none';
      inst.style.zIndex = '1'; // Below _labelLayer (z-index:2)
    }

    // Inner label — already set to "🔒 LOCKED" in init, no change needed
    if (_innerLabel) _innerLabel.textContent = '\uD83D\uDD12 LOCKED';

    // Determine key requirement from floor data
    var keyName = 'a key';
    var hasKey  = false;
    if (floorData.lockedDoors) {
      var coordKey = fx + ',' + fy;
      if (floorData.lockedDoors[coordKey] && floorData.lockedDoors[coordKey].keyName) {
        keyName = floorData.lockedDoors[coordKey].keyName;
      }
      // Check if the player actually has the key
      if (typeof Player !== 'undefined' && Player.hasItem) {
        hasKey = Player.hasItem(floorData.lockedDoors[coordKey] && floorData.lockedDoors[coordKey].keyId);
      }
    }

    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode('\uD83D\uDD12 locked door'));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('requires ' + keyName));
      _subLabel.style.color = 'rgba(220,80,60,0)';
    }

    // Action button — show only if player has the key
    if (_actionBtn) {
      _actionBtn.textContent = hasKey ? 'Unlock' : 'Use Key';
      _actionBtn.style.opacity = '0';
      _actionBtn.style.display = hasKey ? '' : 'none';
    }

    // Fade in
    _container.style.opacity = '1';

    // Trigger shake after brief delay (rejection — door doesn't open)
    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.shake(_boxId);
        _shaken = true;
        if (_subLabel) _subLabel.style.color = 'rgba(220,80,60,0.9)';
        if (_actionBtn && hasKey) _actionBtn.style.opacity = '1';
      }
    }, SHAKE_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(220,80,60,0)';
    if (_actionBtn) _actionBtn.style.opacity = '0';

    setTimeout(function () { _destroyBox(); }, 350);

    _active     = false;
    _shaken     = false;
    _shakeCd    = 0;
    _facingTile = 0;
    _facingX    = -1;
    _facingY    = -1;
    _timer      = 0;
  }

  function _destroyBox() {
    if (_boxId) {
      BoxAnim.destroy(_boxId);
      _boxId = null;
    }
    _active = false;
    _shaken = false;
  }

  /**
   * Force-hide the peek overlay (called when door is unlocked externally).
   */
  function forceHide() {
    _hide();
  }

  /**
   * Whether the locked-door peek box is currently visible.
   */
  function isActive() {
    return _active;
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init:      init,
    update:    update,
    forceHide: forceHide,
    isActive:  isActive
  };
})();

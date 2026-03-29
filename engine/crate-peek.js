/**
 * CratePeek — BoxAnim crate reveal when facing a breakable tile.
 *
 * When the player faces a BREAKABLE tile, a CSS 3D crate box appears
 * centred in the viewport. The lid slides off to the right to reveal
 * the crate interior from a steep top-down perspective. Hovering the
 * opened lid tilts it further to emphasise the view-from-above angle.
 *
 * Visual: BoxAnim crate-variant — wood-plank faces, cross-grain lid,
 * warm amber interior glow.
 *
 * Text below box (two rows, left-aligned):
 *   breakable crate
 *   → smash to loot
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager
 */
var CratePeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 400;   // ms before box appears (debounce)
  var OPEN_DELAY = 200;   // ms after appear before lid slides off

  // ── State ──────────────────────────────────────────────────────
  var _active     = false;
  var _boxId      = null;
  var _facingTile = 0;
  var _facingX    = -1;
  var _facingY    = -1;
  var _timer      = 0;
  var _opened     = false;
  var _container  = null;
  var _subLabel   = null;

  // ── Init ───────────────────────────────────────────────────────

  function init() {
    _container = document.getElementById('crate-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'crate-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    _subLabel = document.getElementById('crate-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'crate-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:24px; text-align:left;' +
        'font:28px monospace; color:rgba(200,170,100,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
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
    if (tile !== TILES.BREAKABLE) { _hide(); return; }

    // Same tile we were already peeking at
    if (_active && _facingTile === tile && _facingX === fx && _facingY === fy) {
      return;
    }

    // New tile — accumulate debounce
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

    _boxId   = BoxAnim.create('crate', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    var glowColor  = 'rgba(200,150,60,0.5)';
    var labelColor = '#c8a040';

    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', glowColor);
      inst.style.pointerEvents = 'none';

      var glow = inst.querySelector('.box3d-glow');
      if (glow) {
        var span = document.createElement('span');
        span.style.cssText =
          'font:bold 14px monospace;color:' + labelColor +
          ';text-shadow:0 0 10px ' + glowColor +
          ';position:absolute;top:50%;left:50%;' +
          'transform:translate(-50%,-50%);white-space:nowrap;';
        span.textContent = '? LOOT ?';
        glow.appendChild(span);
      }
    }

    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode('breakable crate'));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode('\u2192 smash to loot'));
      _subLabel.style.color = 'rgba(200,170,100,0)';
    }

    _container.style.opacity = '1';

    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0.9)';
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(200,170,100,0)';

    setTimeout(function () { _destroyBox(); }, 350);

    _active     = false;
    _opened     = false;
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
    _opened = false;
  }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init: init,
    update: update
  };
})();

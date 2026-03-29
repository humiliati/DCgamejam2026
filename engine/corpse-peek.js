/**
 * CorpsePeek — BoxAnim coffin reveal when facing a corpse tile.
 *
 * When the player faces a CORPSE tile (with a registered corpse), a CSS
 * 3D coffin box appears centred in the viewport. The lid slides off to
 * reveal the corpse interior with a spectral glow.
 *
 * Gleaner mode (apron equipped): shows "corpse stock → restock to reanimate"
 * Scavenger mode (default):      shows "fallen creature → harvest for parts"
 *
 * Visual: BoxAnim crate-variant with eerie purple/grey tones instead of
 * warm amber. Spectral interior glow.
 *
 * Layer 3 (after InteractPrompt, BoxAnim)
 * Depends on: BoxAnim, TILES, Player, MovementController, FloorManager,
 *             CorpseRegistry
 */
var CorpsePeek = (function () {
  'use strict';

  var MC = MovementController;

  // ── Config ──────────────────────────────────────────────────────
  var SHOW_DELAY = 350;   // ms before box appears (debounce)
  var OPEN_DELAY = 250;   // ms after appear before lid slides off

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
    _container = document.getElementById('corpse-peek-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'corpse-peek-container';
      _container.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'z-index:18; pointer-events:none; opacity:0;' +
        'transition:opacity 0.3s ease;';
      var viewport = document.getElementById('viewport');
      if (viewport) viewport.appendChild(_container);
    }

    _subLabel = document.getElementById('corpse-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'corpse-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:0; transform:none;' +
        'margin-top:36px; text-align:left;' +
        'font:38px monospace; color:rgba(160,140,180,0);' +
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
    if (tile !== TILES.CORPSE) { _hide(); return; }

    // Must have a registered corpse entity
    if (typeof CorpseRegistry !== 'undefined') {
      var corpse = CorpseRegistry.getCorpseAt(fx, fy, FloorManager.getCurrentFloorId());
      if (!corpse || corpse.reanimated) { _hide(); return; }
    }

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

    // Eerie spectral glow instead of warm amber
    var glowColor  = 'rgba(140,100,180,0.5)';
    var labelColor = '#a088c0';

    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', glowColor);
      inst.style.pointerEvents = 'none';

      // Darken the box faces for a coffin look
      var faces = inst.querySelectorAll('.box3d-face');
      for (var f = 0; f < faces.length; f++) {
        faces[f].style.filter = 'hue-rotate(240deg) saturate(0.5) brightness(0.7)';
      }

      var glow = inst.querySelector('.box3d-glow');
      if (glow) {
        // Show the corpse emoji inside
        var corpseEmoji = '💀';
        if (typeof CorpseRegistry !== 'undefined') {
          corpseEmoji = CorpseRegistry.getDisplayEmoji(fx, fy, FloorManager.getCurrentFloorId());
        }
        var span = document.createElement('span');
        span.style.cssText =
          'font:bold 32px sans-serif;color:' + labelColor +
          ';text-shadow:0 0 12px ' + glowColor +
          ';position:absolute;top:50%;left:50%;' +
          'transform:translate(-50%,-50%);white-space:nowrap;';
        span.textContent = corpseEmoji;
        glow.appendChild(span);
      }
    }

    // Determine mode text
    var corpse = null;
    var floorId = (typeof FloorManager !== 'undefined') ? FloorManager.getCurrentFloorId() : '';
    if (typeof CorpseRegistry !== 'undefined') {
      corpse = CorpseRegistry.getCorpseAt(fx, fy, floorId);
    }

    var line1 = corpse ? corpse.enemyName : 'fallen creature';
    var line2 = '\u2192 harvest for parts';

    // Gleaner mode: check if container exists (restockable)
    if (typeof CrateSystem !== 'undefined' && CrateSystem.hasContainer(fx, fy, floorId)) {
      var container = CrateSystem.getContainer(fx, fy, floorId);
      if (container && !container.sealed) {
        line2 = '\u2192 restock to reanimate';
      } else if (container && container.sealed) {
        line2 = '\u2192 sealed \u2714';
      }
    }

    if (_subLabel) {
      _subLabel.textContent = '';
      _subLabel.appendChild(document.createTextNode(line1));
      _subLabel.appendChild(document.createElement('br'));
      _subLabel.appendChild(document.createTextNode(line2));
      _subLabel.style.color = 'rgba(160,140,180,0)';
    }

    _container.style.opacity = '1';

    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        if (_subLabel) _subLabel.style.color = 'rgba(160,140,180,0.9)';
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(160,140,180,0)';

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

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
  var _labelLayer = null;
  var _innerLabel = null;
  var _subLabel   = null;
  var _actionBtn  = null;
  var _closeBtn   = null;

  // ── Init ───────────────────────────────────────────────────────

  function _onActionClick() {
    if (typeof Game !== 'undefined' && Game.interact) Game.interact();
  }

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

    // ── Label layer (z-index:2) — flat overlay above 3D box ──
    _labelLayer = document.getElementById('corpse-peek-labels');
    if (!_labelLayer) {
      _labelLayer = document.createElement('div');
      _labelLayer.id = 'corpse-peek-labels';
      _labelLayer.style.cssText =
        'position:absolute; top:0; left:0; width:100%; height:100%;' +
        'z-index:2; pointer-events:none;';
      _container.appendChild(_labelLayer);
    }

    // Inner label (emoji, replaces the one that was inside .box3d-glow)
    _innerLabel = document.getElementById('corpse-peek-innerlabel');
    if (!_innerLabel) {
      _innerLabel = document.createElement('div');
      _innerLabel.id = 'corpse-peek-innerlabel';
      _innerLabel.style.cssText =
        'position:absolute; top:50%; left:50%;' +
        'transform:translate(-50%,-50%);' +
        'font:bold 32px sans-serif; color:#a088c0;' +
        'text-shadow:0 0 12px rgba(140,100,180,0.5);' +
        'white-space:nowrap; pointer-events:none;';
      _labelLayer.appendChild(_innerLabel);
    }

    // Sub-label (margin bumped to 60px)
    _subLabel = document.getElementById('corpse-peek-sublabel');
    if (!_subLabel) {
      _subLabel = document.createElement('div');
      _subLabel.id = 'corpse-peek-sublabel';
      _subLabel.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:60px; text-align:center;' +
        'font:20px monospace; color:rgba(160,140,180,0);' +
        'text-shadow:0 1px 4px rgba(0,0,0,0.8);' +
        'transition:color 0.4s ease 0.3s; white-space:nowrap;' +
        'pointer-events:none; line-height:1.4;';
      _labelLayer.appendChild(_subLabel);
    }

    // Action button
    _actionBtn = document.getElementById('corpse-peek-action');
    if (!_actionBtn) {
      _actionBtn = document.createElement('button');
      _actionBtn.id = 'corpse-peek-action';
      _actionBtn.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:130px; padding:12px 28px; min-height:48px;' +
        'font:bold 18px monospace; color:#d0b8e0; background:rgba(40,20,50,0.85);' +
        'border:1px solid #a088c0; border-radius:6px;' +
        'cursor:pointer; pointer-events:auto; opacity:0; white-space:nowrap;' +
        'transition:opacity 0.3s ease, border-color 0.15s, color 0.15s, box-shadow 0.15s;';
      _actionBtn.textContent = 'Harvest';
      _actionBtn.addEventListener('click', _onActionClick);
      _actionBtn.addEventListener('mouseenter', function () {
        _actionBtn.style.borderColor = '#d0b8ff';
        _actionBtn.style.color       = '#fff';
        _actionBtn.style.boxShadow   = '0 0 10px rgba(160,120,200,0.5)';
      });
      _actionBtn.addEventListener('mouseleave', function () {
        _actionBtn.style.borderColor = '#a088c0';
        _actionBtn.style.color       = '#d0b8e0';
        _actionBtn.style.boxShadow   = 'none';
      });
      _labelLayer.appendChild(_actionBtn);
    }

    // Close button — [ESC] Close
    _closeBtn = document.getElementById('corpse-peek-close');
    if (!_closeBtn) {
      _closeBtn = document.createElement('button');
      _closeBtn.id = 'corpse-peek-close';
      _closeBtn.style.cssText =
        'position:absolute; top:100%; left:50%; transform:translateX(-50%);' +
        'margin-top:200px; padding:10px 20px; min-height:44px;' +
        'font:16px monospace; color:rgba(160,140,180,0.7); background:rgba(30,20,40,0.6);' +
        'border:1px solid rgba(160,140,180,0.3); border-radius:4px;' +
        'cursor:pointer; pointer-events:auto; opacity:0; white-space:nowrap;' +
        'transition:opacity 0.3s ease, border-color 0.15s, color 0.15s;';
      _closeBtn.textContent = '\u2715 Close';
      _closeBtn.addEventListener('click', function () { _hide(); });
      _closeBtn.addEventListener('mouseenter', function () {
        _closeBtn.style.borderColor = 'rgba(160,140,180,0.7)';
        _closeBtn.style.color       = 'rgba(200,180,220,0.9)';
      });
      _closeBtn.addEventListener('mouseleave', function () {
        _closeBtn.style.borderColor = 'rgba(160,140,180,0.3)';
        _closeBtn.style.color       = 'rgba(160,140,180,0.7)';
      });
      _labelLayer.appendChild(_closeBtn);
    }
  }

  function handleKey(key) {
    if (!_active) return false;
    if (key === 'Escape') { _hide(); return true; }
    return false;
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
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-popup', { volume: 0.4 });

    _boxId   = BoxAnim.create('chest', _container, { spin: false });
    _active  = true;
    _opened  = false;
    _timer   = 0;

    // Eerie spectral glow instead of warm amber
    var glowColor  = 'rgba(140,100,180,0.5)';

    var inst = document.getElementById(_boxId);
    if (inst) {
      inst.style.setProperty('--box-glow', glowColor);
      // Coffin color scheme — dark grey-purple wood
      inst.style.setProperty('--box-dark', '#1a1020');
      inst.style.setProperty('--box-dark2', '#140c1a');
      inst.style.setProperty('--box-light', '#4a3860');
      inst.style.setProperty('--box-floor', '#0a0810');
      inst.style.setProperty('--box-ceil', '#2a2038');
      inst.style.pointerEvents = 'none';
      inst.style.zIndex = '1'; // Below _labelLayer (z-index:2)
    }

    // Inner label — corpse emoji (in label layer, NOT inside .box3d-glow)
    var corpseEmoji = '\uD83D\uDC80'; // 💀
    if (typeof CorpseRegistry !== 'undefined') {
      corpseEmoji = CorpseRegistry.getDisplayEmoji(fx, fy, FloorManager.getCurrentFloorId());
    }
    if (_innerLabel) _innerLabel.textContent = corpseEmoji;

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

    // Action button text based on mode
    if (_actionBtn) {
      _actionBtn.textContent = line2.indexOf('restock') >= 0
        ? 'Restock' : 'Harvest';
      _actionBtn.style.opacity = '0';
    }
    if (_closeBtn) _closeBtn.style.opacity = '0';

    _container.style.opacity = '1';

    setTimeout(function () {
      if (_active && _boxId) {
        BoxAnim.open(_boxId);
        _opened = true;
        if (_subLabel) _subLabel.style.color = 'rgba(160,140,180,0.9)';
        if (_actionBtn) _actionBtn.style.opacity = '1';
        if (_closeBtn) _closeBtn.style.opacity = '1';
      }
    }, OPEN_DELAY);
  }

  function _hide() {
    if (!_active) { _timer = 0; return; }
    if (typeof AudioSystem !== 'undefined') AudioSystem.play('ui-click', { volume: 0.3 });

    if (_opened && _boxId) BoxAnim.close(_boxId);

    _container.style.opacity = '0';
    if (_subLabel) _subLabel.style.color = 'rgba(160,140,180,0)';
    if (_actionBtn) _actionBtn.style.opacity = '0';
    if (_closeBtn) _closeBtn.style.opacity = '0';

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

  /** Force-hide the peek overlay. */
  function forceHide() { _hide(); }

  /** Whether the corpse-peek box is currently visible. */
  function isActive() { return _active; }

  // ── Public API ─────────────────────────────────────────────────

  return {
    init:      init,
    update:    update,
    handleKey: handleKey,
    forceHide: forceHide,
    isActive:  isActive
  };
})();
